import type { FastifyBaseLogger } from "fastify";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { addVipRole, removeVipRole } from "../../bot/roles";
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
    },
    async (request, reply) => {
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
