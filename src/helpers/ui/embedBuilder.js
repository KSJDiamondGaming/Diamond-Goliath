const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../utility/uiConfig');

function createEmbed({
  title = '',
  description = '',
  color = COLORS.PRIMARY,
  fields = [],
  footer = null,
  thumbnail = null,
  timestamp = true,
} = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description);

  if (timestamp) {
    embed.setTimestamp();
  }

  if (fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

function successEmbed(description, options = {}) {
  return createEmbed({
    title: `${EMOJIS.SUCCESS} Success`,
    description,
    color: COLORS.SUCCESS,
    ...options,
  });
}

function errorEmbed(description, options = {}) {
  return createEmbed({
    title: `${EMOJIS.ERROR} Error`,
    description,
    color: COLORS.ERROR,
    ...options,
  });
}

function warningEmbed(description, options = {}) {
  return createEmbed({
    title: `${EMOJIS.WARNING} Warning`,
    description,
    color: COLORS.WARNING,
    ...options,
  });
}

function infoEmbed(title, description, options = {}) {
  return createEmbed({
    title,
    description,
    color: COLORS.PRIMARY,
    ...options,
  });
}

module.exports = {
  createEmbed,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,
};