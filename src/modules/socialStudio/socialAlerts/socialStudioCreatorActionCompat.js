'use strict';

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const store = require('./socialStudioStore');

const P = 'social:';
const sessions = new Map();

function key(interaction) {
  return `${interaction.guildId}:${interaction.user?.id || 'unknown'}`;
}

function setCreator(interaction, creatorId) {
  if (!interaction?.guildId || !interaction?.user?.id) return;
  if (creatorId) sessions.set(key(interaction), String(creatorId));
}

function selectedCreatorId(interaction) {
  return sessions.get(key(interaction)) || null;
}

function who(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(id, label, style = ButtonStyle.Secondary) {
  return new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
}

function profilePayload(interaction, creator) {
  const config = store.getConfig(interaction.guildId);
  const linked = (creator.accountIds || [])
    .map((id) => config.accounts?.[id])
    .filter(Boolean);
  const platforms = [...new Set(linked.map((account) => account.platform).filter(Boolean))];
  const color = platforms.length === 1
    ? {
        twitch: 0x9146FF,
        youtube: 0xFF0000,
        tiktok: 0x2F3136,
        kick: 0x53FC18,
        facebook: 0x1877F2,
        instagram: 0xE1306C,
        x: 0xFFFFFF,
      }[platforms[0]] || 0x5865F2
    : (config.enabled ? 0x5865F2 : 0x747F8D);

  const description = [
    `👤 **${creator.displayName || 'Unnamed creator'}**`,
    '',
    '**Profile**',
    `Status: ${creator.enabled === false ? '⏸️ Paused' : '🟢 Monitoring'}`,
    `Group / Team: ${creator.group || 'Not set'}`,
    `Tags: ${creator.tags?.length ? creator.tags.join(', ') : 'None'}`,
    `Profile Notes: ${creator.notes || 'None'}`,
    `🔒 Admin Notes: ${creator.adminNotes || 'None'}`,
  ].join('\n');

  return {
    embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle('📝 Manage Profile')
      .setDescription(description)
      .setFooter({ text: `Requested by ${who(interaction)}` })
      .setTimestamp()],
    components: [
      row(
        button(`${P}creator:edit`, '📝 Edit Profile'),
        button(`${P}creator:clear`, '🔄 Clear'),
        button(`${P}creator:profile:toggle`, creator.enabled === false ? '▶️ Resume' : '⏸️ Pause', creator.enabled === false ? ButtonStyle.Success : ButtonStyle.Secondary),
        button(`${P}creator:delete`, '🗑️ Delete', ButtonStyle.Danger),
      ),
      row(
        button(`${P}creators`, '⬅️ Back'),
        button(`${P}settings`, '⚙️ Settings'),
      ),
    ],
  };
}

function creatorsPayload(interaction, message) {
  const config = store.getConfig(interaction.guildId);
  const creators = Object.values(config.creators || {});
  return {
    content: message || null,
    embeds: [new EmbedBuilder()
      .setColor(config.enabled ? 0x5865F2 : 0x747F8D)
      .setTitle('👥 Creator Profiles')
      .setDescription(creators.length
        ? `Profile action completed.\n\n**Profiles remaining:** ${creators.length}\n\nSelect a creator again to continue managing profiles.`
        : 'Profile action completed.\n\nThere are no creator profiles remaining.')
      .setFooter({ text: `Requested by ${who(interaction)}` })
      .setTimestamp()],
    components: [row(button(`${P}creators`, '🔄 Refresh Profiles', ButtonStyle.Primary), button(`${P}settings`, '⚙️ Settings'))],
  };
}

function capture(interaction) {
  const id = String(interaction?.customId || '');
  if (id !== `${P}creator:select`) return false;
  const creatorId = interaction.values?.[0];
  if (creatorId) setCreator(interaction, creatorId);
  return false;
}

async function handle(interaction) {
  const id = String(interaction?.customId || '');
  capture(interaction);
  if (id !== `${P}creator:clear` && id !== `${P}creator:delete`) return false;

  const creatorId = selectedCreatorId(interaction);
  if (!creatorId) throw new Error('Select a creator profile first.');
  const creator = store.getCreator(interaction.guildId, creatorId);
  if (!creator) {
    sessions.delete(key(interaction));
    throw new Error('The selected creator profile no longer exists.');
  }

  if (id === `${P}creator:clear`) {
    const updated = store.updateCreator(interaction.guildId, creatorId, (current) => ({
      ...current,
      group: '',
      tags: [],
      notes: '',
      adminNotes: '',
    }), { actorId: interaction.user?.id || null, guild: interaction.guild });
    if (interaction.deferred || interaction.replied) await interaction.editReply(profilePayload(interaction, updated));
    else await interaction.update(profilePayload(interaction, updated));
    return true;
  }

  const deleted = store.deleteCreator(interaction.guildId, creatorId, {
    actorId: interaction.user?.id || null,
    guild: interaction.guild,
  });
  sessions.delete(key(interaction));
  if (!deleted) throw new Error('The selected creator profile no longer exists.');
  const payload = creatorsPayload(interaction, `✅ Deleted **${creator.displayName || creatorId}** and its linked Social Studio accounts.`);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

module.exports = {
  capture,
  handle,
};
