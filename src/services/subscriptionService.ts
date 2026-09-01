import { and, eq } from "drizzle-orm";
import { db } from "../db/connection";
import schema from "../db/schema";
import type { SubscriptionStatus } from "../utils/subscriptionStatus";

export function findActiveSubscriptionByEmail(email: string, guildId: string) {
  return db.query.subscriptions.findFirst({
    where: and(
      eq(schema.subscriptions.email, email),
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
  return db
    .insert(schema.users)
    .values({
      discordId,
      email,
      guildId,
      lastUpdate: new Date(),
    })
    .onConflictDoUpdate({
      target: [schema.users.discordId, schema.users.guildId],
      set: { email, lastUpdate: new Date() },
    });
}

export function findUserByEmailAndGuild(email: string, guildId: string) {
  return db.query.users.findFirst({
    where: and(
      eq(schema.users.email, email),
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
      email,
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
