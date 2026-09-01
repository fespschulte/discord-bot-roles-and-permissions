import { Client, Events, GatewayIntentBits } from "discord.js";
import { setDiscordClient } from "../bot/roles";
import { sql } from "../db/connection";
import { env } from "../env";
import { reconcileRoles } from "../services/reconciliation";

// Standalone run of the sweep the bot performs on startup, for manual use or a cron entry.
// It uses its own short-lived client so it can exit instead of holding the gateway open.
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

client.once(Events.ClientReady, async () => {
  setDiscordClient(client);

  let exitCode = 0;
  try {
    await reconcileRoles();
  } catch (error) {
    console.error("[Reconcile] Run failed:", error);
    exitCode = 1;
  } finally {
    await client.destroy();
    await sql.end();
    process.exit(exitCode);
  }
});

client.login(env.DISCORD_TOKEN).catch((error) => {
  console.error("[Reconcile] Could not connect to Discord:", error);
  process.exit(1);
});
