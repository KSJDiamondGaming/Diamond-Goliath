const { EmbedBuilder } = require('discord.js');

function baseEmbed(options = {}) {
  const {
    color = '#5865F2',
    timestamp = true,
  } = options;

  const embed = new EmbedBuilder().setColor(color);

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

function successEmbed(description, options = {}) {
  return baseEmbed({
    color: '#57F287',
    timestamp: options.timestamp ?? true,
  }).setDescription(`✅ ${description}`);
}

function errorEmbed(description, options = {}) {
  return baseEmbed({
    color: '#ED4245',
    timestamp: options.timestamp ?? true,
  }).setDescription(`❌ ${description}`);
}

function infoEmbed(description, options = {}) {
  return baseEmbed({
    color: options.color || '#5865F2',
    timestamp: options.timestamp ?? true,
  }).setDescription(`ℹ️ ${description}`);
}

function createPanelEmbed(interaction, options = {}) {
  const {
    title = null,
    description = null,
    thumbnail = null,
    color = '#5865F2',
    footerText = null,
    footerIcon = null,
    timestamp = true,
  } = options;

  const embed = baseEmbed({ color, timestamp });

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);

  const resolvedFooterText =
    footerText ||
    interaction?.guild?.name ||
    interaction?.client?.user?.username ||
    'KSJ Goliath';

  const resolvedFooterIcon =
    footerIcon ||
    interaction?.guild?.iconURL?.({ dynamic: true }) ||
    interaction?.client?.user?.displayAvatarURL?.({ dynamic: true }) ||
    undefined;

  embed.setFooter({
    text: resolvedFooterText,
    iconURL: resolvedFooterIcon,
  });

  return embed;
}

module.exports = {
  baseEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  createPanelEmbed,
};