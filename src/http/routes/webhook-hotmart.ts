import { timingSafeEqual } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { addVipRole, removeVipRole } from "../../bot/roles";
import { isBotReady } from "../../bot/state";
import {
  type EntitlementIntent,
  resolveEntitlement,
} from "../../domain/entitlement";
import {
  hotmartEventSchema,
  normalizeHotmartEvent,
} from "../../domain/hotmartEvent";
import { env } from "../../env";
import {
  findUserByEmailAndGuild,
  updateOrInsertSubscription,
} from "../../services/subscriptionService";
import {
  parseSubscriptionStatus,
  type SubscriptionStatus,
} from "../../utils/subscriptionStatus";

// Hotmart authenticates deliveries with a static per-account token in this header. There is
// no body signature, so a constant-time comparison of the shared secret is the whole check.
function hasValidHottok(received: string | string[] | undefined): boolean {
  const token = Array.isArray(received) ? received[0] : received;
  if (!token) {
    return false;
  }
  const expected = Buffer.from(env.HOTMART_WEBHOOK_SECRET);
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(expected, actual);
}

// Purchase events often carry no `subscription.status`. Persisting the entitlement we just
// derived keeps the stored row consistent with the role we apply, which is what lets
// reconciliation trust the database.
function statusFromIntent(
  intent: EntitlementIntent
): SubscriptionStatus | undefined {
  if (intent === "GRANT") {
    return "ACTIVE";
  }
  if (intent === "REVOKE") {
    return "INACTIVE";
  }
  return;
}

async function syncVipRole(
  log: FastifyBaseLogger,
  discordId: string,
  guildId: string,
  intent: EntitlementIntent
) {
  try {
    if (intent === "GRANT") {
      await addVipRole(discordId, guildId);
    } else {
      await removeVipRole(discordId, guildId);
    }
    log.info({ discordId, intent }, "[Webhook] VIP role synchronized");
  } catch (error) {
    // Reconciliation is the recovery path. Failing the request would make Hotmart retry the
    // whole event, including the database write.
    log.error(
      { err: error, discordId, intent },
      "[Webhook] Failed to synchronize VIP role"
    );
  }
}

export const webhookHotmartRoute: FastifyPluginCallbackZod = (app) => {
  app.post(
    "/webhook/hotmart",
    {
      schema: {
        body: hotmartEventSchema,
      },
      // onRequest rather than preHandler: this runs before the body is parsed or validated,
      // so an unauthenticated caller never reaches our schemas and always gets 401 instead
      // of a shape-dependent 400.
      onRequest: (request, reply, done) => {
        if (!hasValidHottok(request.headers["x-hotmart-hottok"])) {
          request.log.warn(
            { ip: request.ip },
            "[Webhook] Rejected delivery with missing or invalid hottok"
          );
          reply.status(401).send({ error: "Invalid hottok" });
          return;
        }
        done();
      },
    },
    async (request, reply) => {
      // Hotmart retries on 5xx. Refusing the delivery until the gateway is up is what keeps
      // a restart from silently swallowing role changes.
      if (!isBotReady()) {
        request.log.warn(
          "[Webhook] Rejected delivery: Discord gateway not ready yet"
        );
        return reply
          .status(503)
          .send({ error: "Discord gateway not ready, please retry" });
      }

      const normalized = normalizeHotmartEvent(request.body);
      const guildId = env.DISCORD_GUILD_ID;

      const intent = resolveEntitlement(
        normalized.event,
        normalized.subscriptionStatus,
        normalized.purchaseStatus
      );

      request.log.info(
        {
          event: normalized.event,
          email: normalized.email,
          subscriptionStatus: normalized.subscriptionStatus,
          purchaseStatus: normalized.purchaseStatus,
          intent,
        },
        "[Webhook] Hotmart event received"
      );

      const status = normalized.subscriptionStatus
        ? parseSubscriptionStatus(normalized.subscriptionStatus)
        : statusFromIntent(intent);

      if (normalized.email && normalized.subscriptionId && status) {
        await updateOrInsertSubscription({
          email: normalized.email,
          guildId,
          subscriptionId: normalized.subscriptionId,
          status,
          cancellationDate: normalized.cancellationDate,
          dateNextCharge: normalized.dateNextCharge,
          planName: normalized.planName,
          productName: normalized.productName,
          subscriberCode: normalized.subscriberCode,
        });
      }

      if (!normalized.email || intent === "NO_CHANGE") {
        return reply.status(200).send({ ok: true });
      }

      const user = await findUserByEmailAndGuild(normalized.email, guildId);
      if (!user) {
        request.log.info(
          { email: normalized.email },
          "[Webhook] No linked Discord account for this email"
        );
        return reply.status(200).send({ ok: true });
      }

      await syncVipRole(request.log, user.discordId, guildId, intent);

      return reply.status(200).send({ ok: true });
    }
  );
};
