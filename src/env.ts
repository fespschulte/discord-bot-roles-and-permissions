import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  DISCORD_TOKEN: z.string(),
  DISCORD_CLIENT_ID: z.string(),
  DISCORD_GUILD_ID: z.string(),
  HOTMART_WEBHOOK_SECRET: z.string(),
  RECONCILE_INTERVAL_MINUTES: z.coerce.number().int().positive().default(15),
});

export const env = envSchema.parse(process.env);
