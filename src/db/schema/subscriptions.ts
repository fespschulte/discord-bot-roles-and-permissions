import {
  boolean as pgBoolean,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "ACTIVE",
  "INACTIVE",
  "DELAYED",
  "CANCELLED_BY_CUSTOMER",
  "CANCELLED_BY_SELLER",
  "CANCELLED_BY_ADMIN",
  "STARTED",
  "OVERDUE",
]);

export const subscriptions = pgTable(
  "subscriptions",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    guildId: text("guild_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    subscriberCode: text("subscriber_code"),
    planName: text("plan_name"),
    planCode: text("plan_code"),
    productName: text("product_name"),
    productId: text("product_id"),
    status: subscriptionStatusEnum("status").notNull(),
    billingType: text("billing_type"),
    adoptionDate: timestamp("adoption_date", { withTimezone: true }),
    cancellationDate: timestamp("cancellation_date", { withTimezone: true }),
    dateNextCharge: timestamp("date_next_charge", { withTimezone: true }),
    hasUnpaidRecurrency: pgBoolean("has_unpaid_recurrency"),
    lastUpdate: timestamp("last_update", { withTimezone: true }),
  },
  (table) => ({
    subscriptionGuildUnique: unique().on(table.subscriptionId, table.guildId),
  })
);
