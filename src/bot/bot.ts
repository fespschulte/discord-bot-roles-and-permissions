import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  Events,
  ChatInputCommandInteraction,
  Interaction,
  SlashCommandStringOption,
  GuildMember,
} from "discord.js";
import { db } from "../db/connection";
import schema from "../db/schema";
import "dotenv/config";
import { setDiscordClient } from "./roles";
import { and, eq } from "drizzle-orm";
import {
  findActiveSubscriptionByEmail,
  findUserByEmailAndGuild,
  linkDiscordToEmail,
} from "../services/subscriptionService";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

const DISCORD_TOKEN = process.env.DISCORD_TOKEN!;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const GUILD_ID = process.env.DISCORD_GUILD_ID!;
export const VIP_ROLE_NAME = "KNLHA MASTER";

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

const rest = new REST({ version: "10" }).setToken(DISCORD_TOKEN);
(async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
      body: commands,
    });
    console.log("Comando /link registrado com sucesso!");
  } catch (error) {
    console.error("Erro ao registrar comando:", error);
  }
})();

client.once(Events.ClientReady, () => {
  setDiscordClient(client);
  console.log(`Bot conectado como ${client.user?.tag}`);
});

client.on(Events.InteractionCreate, async (interaction: Interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "link") {
    const email = interaction.options.getString("email");
    if (!email) {
      await interaction.reply({ content: "Email inválido.", ephemeral: true });
      return;
    }
    const subscription = await findActiveSubscriptionByEmail(email, GUILD_ID);
    if (subscription) {
      const existingLink = await findUserByEmailAndGuild(email, GUILD_ID);
      if (existingLink && existingLink.discordId !== interaction.user.id) {
        await interaction.reply({
          content:
            "Este email já está vinculado a outra conta do Discord. Se você acredita que isso é um erro, entre em contato com a administração.",
          ephemeral: true,
        });
        return;
      }
      await linkDiscordToEmail(interaction.user.id, email, GUILD_ID);
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(interaction.user.id);
      let vipRole = guild.roles.cache.find(
        (role) => role.name === VIP_ROLE_NAME
      );
      if (!vipRole) {
        vipRole = await guild.roles.create({
          name: VIP_ROLE_NAME,
          color: "Gold",
        });
      }
      await member.roles.add(vipRole);
      await interaction.reply({
        content: `Assinatura ativa encontrada! Você agora é um ${VIP_ROLE_NAME}.`,
        ephemeral: true,
      });
    } else {
      await interaction.reply({
        content: `Não encontramos assinatura ativa para o email informado.`,
        ephemeral: true,
      });
    }
  }
});

export function startBot() {
  client.login(DISCORD_TOKEN);
}
