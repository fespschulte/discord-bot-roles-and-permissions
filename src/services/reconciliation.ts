import { asc, eq } from "drizzle-orm";
import { addVipRole, memberHasVipRole, removeVipRole } from "../bot/roles";
import { db } from "../db/connection";
import schema from "../db/schema";
import { shouldHaveVipAccess } from "../domain/entitlement";
import { env } from "../env";
import { parseSubscriptionStatus } from "../utils/subscriptionStatus";

export type ReconcileResult = {
  checked: number;
  granted: number;
  revoked: number;
  failed: number;
};

// A webhook whose Discord call failed is never retried, so the database and Discord can
// drift. This forces Discord back into agreement with the stored subscriptions.
export async function reconcileRoles(
  guildId: string = env.DISCORD_GUILD_ID
): Promise<ReconcileResult> {
  const result: ReconcileResult = {
    checked: 0,
    granted: 0,
    revoked: 0,
    failed: 0,
  };

  const [linkedUsers, subscriptions] = await Promise.all([
    db
      .select({
        discordId: schema.users.discordId,
        email: schema.users.email,
      })
      .from(schema.users)
      .where(eq(schema.users.guildId, guildId)),
    db
      .select({
        email: schema.subscriptions.email,
        status: schema.subscriptions.status,
      })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.guildId, guildId))
      .orderBy(asc(schema.subscriptions.lastUpdate)),
  ]);

  // Ordered oldest first, so the last write for an address wins. A stale row must never keep
  // a cancelled member entitled.
  const statusByEmail = new Map(
    subscriptions.map((subscription) => [
      subscription.email,
      parseSubscriptionStatus(subscription.status),
    ])
  );

  for (const user of linkedUsers) {
    result.checked += 1;
    const status = statusByEmail.get(user.email);
    const shouldHaveRole = status !== undefined && shouldHaveVipAccess(status);

    try {
      // biome-ignore lint/nursery/noAwaitInLoop: sequential on purpose, so a large guild does not fire hundreds of concurrent Discord requests into a rate limit
      const hasRole = await memberHasVipRole(user.discordId, guildId);
      if (shouldHaveRole && !hasRole) {
        await addVipRole(user.discordId, guildId);
        result.granted += 1;
      } else if (!shouldHaveRole && hasRole) {
        await removeVipRole(user.discordId, guildId);
        result.revoked += 1;
      }
    } catch (error) {
      // Most often a member who left the guild. One failure must not stop the sweep.
      result.failed += 1;
      console.error(
        `[Reconcile] Failed for discordId=${user.discordId}:`,
        error
      );
    }
  }

  console.log(
    `[Reconcile] checked=${result.checked} granted=${result.granted} revoked=${result.revoked} failed=${result.failed}`
  );

  return result;
}
