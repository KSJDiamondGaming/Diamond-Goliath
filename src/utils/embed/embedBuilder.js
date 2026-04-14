const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('../utility/uiConfig');

// 🎯 Base Embed
function createEmbed({
  title = '',
  description = '',
  color = COLORS.PRIMARY,
  fields = [],
  footer = null,
  thumbnail = null
} = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (fields.length) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

// ✅ Success Embed
function successEmbed(description, options = {}) {
  return createEmbed({
    title: `${EMOJIS.SUCCESS} Success`,
    description,
    color: COLORS.SUCCESS,
    ...options
  });
}

// ❌ Error Embed
function errorEmbed(description, options = {}) {
  return createEmbed({
    title: `${EMOJIS.ERROR} Error`,
    description,
    color: COLORS.ERROR,
    ...options
  });
}

// ⚠️ Warning Embed
function warningEmbed(description, options = {}) {
  return createEmbed({
    title: `${EMOJIS.WARNING} Warning`,
    description,
    color: COLORS.WARNING,
    ...options
  });
}

// ℹ️ Info Embed
function infoEmbed(title, description, options = {}) {
  return createEmbed({
    title,
    description,
    color: COLORS.PRIMARY,
    ...options
  });
}

module.exports = {
  createEmbed,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed
};