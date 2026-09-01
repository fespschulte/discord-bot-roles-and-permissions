import { env } from "../env";
import { db } from "./connection";
import schema from "./schema";

const GUILD_ID = env.DISCORD_GUILD_ID || "default-guild";
const TEST_EMAIL = "fschultepinto@gmail.com";

async function seed() {
  // Cria uma assinatura ativa
  await db
    .insert(schema.subscriptions)
    .values({
      email: TEST_EMAIL,
      guildId: GUILD_ID,
      subscriptionId: "sub_test_1",
      status: "ACTIVE",
      planName: "VIP Mensal",
      productName: "VIP",
      lastUpdate: new Date(),
    })
    .onConflictDoNothing();

  console.log(
    "Seed concluído! Assinatura de teste criada (sem vínculo Discord)."
  );
  process.exit(0);
}

seed().catch((err) => {
  console.error("Erro ao rodar seed:", err);
  process.exit(1);
});
