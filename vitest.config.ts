import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    // src/env.ts validates configuration at import time, so the suite supplies its own
    // values instead of depending on a developer's .env.
    env: {
      DATABASE_URL: "postgresql://test:test@localhost:5432/test",
      DISCORD_TOKEN: "test-token",
      DISCORD_CLIENT_ID: "test-client-id",
      DISCORD_GUILD_ID: "test-guild-id",
      HOTMART_WEBHOOK_SECRET: "test-hottok",
    },
  },
});
