import { Client, GuildMember, Role } from "discord.js";
import { VIP_ROLE_NAME } from "./bot";

// Singleton client instance (should be initialized in bot.ts)
let client: Client;
export function setDiscordClient(c: Client) {
  client = c;
}

export async function addVipRole(discordId: string, guildId: string) {
  if (!client) throw new Error("Discord client not set");
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  let vipRole = guild.roles.cache.find((role) => role.name === VIP_ROLE_NAME);
  if (!vipRole) {
    vipRole = await guild.roles.create({ name: VIP_ROLE_NAME, color: "Gold" });
  }
  await member.roles.add(vipRole);
}

export async function removeVipRole(discordId: string, guildId: string) {
  if (!client) throw new Error("Discord client not set");
  const guild = await client.guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  const vipRole = guild.roles.cache.find((role) => role.name === VIP_ROLE_NAME);
  if (vipRole) {
    await member.roles.remove(vipRole);
  }
}
