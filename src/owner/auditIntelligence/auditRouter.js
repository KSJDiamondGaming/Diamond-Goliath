'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { buildAuditEmbed } = require('./auditEmbeds');

function slug(value) {
  return String(value || 'guild')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'guild';
}

function getOwnerAuditGuildId() {
  return String(process.env.OWNER_AUDIT_GUILD_ID || '').trim();
}

async function ensureAuditChannel(client, sourceGuild) {
  const ownerGuildId = getOwnerAuditGuildId();
  if (!ownerGuildId || !client?.guilds?.cache) return null;
  const ownerGuild = client.guilds.cache.get(ownerGuildId) || await client.guilds.fetch(ownerGuildId).catch(() => null);
  if (!ownerGuild) return null;

  const categoryId = String(process.env.OWNER_AUDIT_CATEGORY_ID || '').trim();
  let category = categoryId ? ownerGuild.channels.cache.get(categoryId) : null;
  if (!category && process.env.OWNER_AUDIT_AUTO_PROVISION === 'true') {
    category = ownerGuild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name.toLowerCase() === 'goliath audit') || null;
    if (!category) {
      category = await ownerGuild.channels.create({
        name: 'Goliath Audit',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: ownerGuild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
        reason: 'Goliath owner audit category provisioning',
      });
    }
  }

  const marker = `GOLIATH_AUDIT_GUILD:${sourceGuild.id}`;
  let channel = ownerGuild.channels.cache.find((item) => item.type === ChannelType.GuildText && String(item.topic || '').includes(marker)) || null;
  if (!channel && process.env.OWNER_AUDIT_AUTO_PROVISION === 'true') {
    channel = await ownerGuild.channels.create({
      name: slug(sourceGuild.name),
      type: ChannelType.GuildText,
      parent: category?.id || null,
      topic: `${marker} • ${sourceGuild.name} • ${sourceGuild.id}`.slice(0, 1024),
      permissionOverwrites: [{ id: ownerGuild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] }],
      reason: `Goliath audit mirror for ${sourceGuild.name}`,
    });
  }
  return channel;
}

async function deliver(client, sourceGuild, event) {
  if (!sourceGuild || sourceGuild.id === getOwnerAuditGuildId()) return false;
  const channel = await ensureAuditChannel(client, sourceGuild);
  if (!channel?.isTextBased?.()) return false;
  await channel.send({ embeds: [buildAuditEmbed(event)], allowedMentions: { parse: [] } });
  return true;
}

module.exports = { deliver, ensureAuditChannel, getOwnerAuditGuildId };
