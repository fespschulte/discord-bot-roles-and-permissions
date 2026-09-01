import {
  type ChatInputCommandInteraction,
  Client,
  Events,
  GatewayIntentBits,
  type Interaction,
  REST,
  Routes,
  SlashCommandBuilder,
  type SlashCommandStringOption,
} from "discord.js";
import { env } from "../env";
import { reconcileRoles } from "../services/reconciliation";
import {
  findActiveSubscriptionByEmail,
  findUserByEmailAndGuild,
  linkDiscordToEmail,
} from "../services/subscriptionService";
import { addVipRole, setDiscordClient, VIP_ROLE_NAME } from "./roles";
import { markBotReady } from "./state";

const RECONCILE_INTERVAL_MS = env.RECONCILE_INTERVAL_MINUTES * 60 * 1000;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

const commands = [
  new SlashCommandBuilder()
    .setName("link")
    .setDescription("Vincule seu email Hotmart à sua conta Discord")
    .addStringOption((option: SlashCommandStringOption) =>
      option
        .setName("email")
        .setDescription("Seu email cadastrado na Hotmart")
        .setRequired(true)
    )
    .toJSON(),
];

async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(
      env.DISCORD_CLIENT_ID,
      env.DISCORD_GUILD_ID
    ),
    { body: commands }
  );
}

async function handleLink(interaction: ChatInputCommandInteraction) {
  const email = interaction.options.getString("email", true);
  const guildId = env.DISCORD_GUILD_ID;

  // Deferred first: the lookups and Discord calls below can exceed the 3 second window
  // Discord allows for an initial interaction response.
  await interaction.deferReply({ ephemeral: true });

  const subscription = await findActiveSubscriptionByEmail(email, guildId);
  if (!subscription) {
    await interaction.editReply(
      "Não encontramos assinatura ativa para o email informado."
    );
    return;
  }

  const existingLink = await findUserByEmailAndGuild(email, guildId);
  if (existingLink && existingLink.discordId !== interaction.user.id) {
    await interaction.editReply(
      "Este email já está vinculado a outra conta do Discord. Se você acredita que isso é um erro, entre em contato com a administração."
    );
    return;
  }

  await linkDiscordToEmail(interaction.user.id, email, guildId);
  await addVipRole(interaction.user.id, guildId);

  await interaction.editReply(
    `Assinatura ativa encontrada! Você agora é um ${VIP_ROLE_NAME}.`
  );
}

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== "link") {
    return;
  }

  try {
    await handleLink(interaction);
  } catch (error) {
    console.error("[Bot] /link failed:", error);
    const message =
      "Não foi possível concluir o vínculo agora. Tente novamente em alguns minutos.";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({ content: message, ephemeral: true });
    }
  }
});

function runReconciliation() {
  reconcileRoles().catch((error) => {
    console.error("[Bot] Reconciliation run failed:", error);
  });
}

client.once(Events.ClientReady, () => {
  setDiscordClient(client);
  markBotReady();
  console.log(`[Bot] Connected as ${client.user?.tag}`);

  // Catch up on anything missed while the gateway was down, then keep drift in check.
  runReconciliation();
  setInterval(runReconciliation, RECONCILE_INTERVAL_MS);
});

export async function startBot() {
  try {
    await registerCommands();
    console.log("[Bot] Slash command /link registered");
  } catch (error) {
    // A failed registration leaves the bot usable for existing commands, so keep going.
    console.error("[Bot] Failed to register slash commands:", error);
  }

  await client.login(env.DISCORD_TOKEN);
}
