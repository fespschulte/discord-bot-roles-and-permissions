import { and, eq } from "drizzle-orm";
import { db } from "../db/connection";
import schema from "../db/schema";
import type { SubscriptionStatus } from "../utils/subscriptionStatus";

// Every lookup and write goes through this. Without it, case variants of the same address
// would bypass the unique constraint on (email, guild_id).
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function findActiveSubscriptionByEmail(email: string, guildId: string) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(schema.subscriptions.email, normalizeEmail(email)),
      eq(schema.subscriptions.guildId, guildId),
      eq(schema.subscriptions.status, "ACTIVE")
    ),
  });
}

export function linkDiscordToEmail(
  discordId: string,
  email: string,
  guildId: string
) {
  const normalizedEmail = normalizeEmail(email);
  return db
    .insert(schema.users)
    .values({
      discordId,
      email: normalizedEmail,
      guildId,
      lastUpdate: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.users.discordId, schema.users.guildId],
      set: { email: normalizedEmail, lastUpdate: new Date() },
    });
}

export function findUserByEmailAndGuild(email: string, guildId: string) {
  return db.query.users.findFirst({
    where: and(
      eq(schema.users.email, normalizeEmail(email)),
      eq(schema.users.guildId, guildId)
    ),
  });
}

export type UpsertSubscriptionInput = {
  email: string;
  guildId: string;
  subscriptionId: string;
  status: SubscriptionStatus;
  cancellationDate?: Date;
  dateNextCharge?: Date;
  planName?: string;
  productName?: string;
  subscriberCode?: string;
};

export function updateOrInsertSubscription({
  email,
  guildId,
  subscriptionId,
  status,
  cancellationDate,
  dateNextCharge,
  planName,
  productName,
  subscriberCode,
}: UpsertSubscriptionInput) {
  return db
    .insert(schema.subscriptions)
    .values({
      email: normalizeEmail(email),
      guildId,
      subscriptionId,
      status,
      cancellationDate,
      dateNextCharge,
      planName,
      productName,
      subscriberCode,
      lastUpdate: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        schema.subscriptions.subscriptionId,
        schema.subscriptions.guildId,
      ],
      set: {
        status,
        cancellationDate,
        dateNextCharge,
        planName,
        productName,
        subscriberCode,
        lastUpdate: new Date(),
      },
    });
}
