import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    discordId: text("discord_id").notNull(),
    guildId: text("guild_id").notNull(),
    email: text("email").notNull(),
    hotmartUserId: text("hotmart_user_id"),
    name: text("name"),
    phone: text("phone"),
    status: text("status"),
    lastUpdate: timestamp("last_update", { withTimezone: true }),
  },
  (table) => ({
    discordGuildUnique: unique().on(table.discordId, table.guildId),
  })
);
