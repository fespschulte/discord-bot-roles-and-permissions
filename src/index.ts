import { startBot } from "./bot/bot";
import { env } from "./env";
import { buildApp } from "./server";

async function main() {
  const app = buildApp();

  // Binding 0.0.0.0 rather than Fastify's localhost default, so the webhook is reachable
  // when the service runs in a container.
  await app.listen({ port: env.PORT, host: "0.0.0.0" });

  await startBot();
}

main().catch((error) => {
  console.error("[Startup] Failed to start:", error);
  process.exit(1);
});
