import type { Client, Guild, Role } from "discord.js";

export const VIP_ROLE_NAME = "KNLHA MASTER";

// Set once the gateway is ready so the HTTP side can reuse the same connection instead of
// opening a second one.
let client: Client | undefined;

export function setDiscordClient(connectedClient: Client) {
  client = connectedClient;
}

function requireClient(): Client {
  if (!client) {
    throw new Error("Discord client not set");
  }
  return client;
}

// roles.fetch() rather than roles.cache: on a cache miss a name lookup would silently
// create a second role with the same name.
async function findVipRole(guild: Guild): Promise<Role | undefined> {
  const roles = await guild.roles.fetch();
  return roles.find((role) => role.name === VIP_ROLE_NAME) ?? undefined;
}

export async function addVipRole(discordId: string, guildId: string) {
  const guild = await requireClient().guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  const vipRole =
    (await findVipRole(guild)) ??
    (await guild.roles.create({ name: VIP_ROLE_NAME, color: "Gold" }));
  await member.roles.add(vipRole);
}

export async function removeVipRole(discordId: string, guildId: string) {
  const guild = await requireClient().guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  const vipRole = await findVipRole(guild);
  if (vipRole) {
    await member.roles.remove(vipRole);
  }
}

export async function memberHasVipRole(
  discordId: string,
  guildId: string
): Promise<boolean> {
  const guild = await requireClient().guilds.fetch(guildId);
  const member = await guild.members.fetch(discordId);
  const vipRole = await findVipRole(guild);
  return vipRole ? member.roles.cache.has(vipRole.id) : false;
}
