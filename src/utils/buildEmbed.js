const { EmbedBuilder } = require('discord.js');
const getEmbedConfig = require('./getEmbedConfig');
const replacePlaceholders = require('./replacePlaceholders');

module.exports = function buildEmbed(guildId, options = {}) {
  const config = getEmbedConfig(guildId);
  const placeholders = options.placeholders || {};

  const title = replacePlaceholders(
    options.title || config.defaultTitle || null,
    placeholders
  );

  const description = replacePlaceholders(
    options.description || '',
    placeholders
  );

  const footerText = replacePlaceholders(
    options.footerText || config.footerText || null,
    placeholders
  );

  const embed = new EmbedBuilder();

  if (title) embed.setTitle(title);
  if (description) embed.setDescription(description);

  embed.setColor(options.color || config.color || '#2b2d31');

  if (options.thumbnail) {
    embed.setThumbnail(options.thumbnail);
  }

  if (options.image) {
    embed.setImage(options.image);
  }

  if (Array.isArray(options.fields) && options.fields.length > 0) {
    embed.addFields(
      options.fields.map((field) => ({
        name: replacePlaceholders(field.name, placeholders),
        value: replacePlaceholders(field.value, placeholders),
        inline: field.inline ?? false,
      }))
    );
  }

  if (footerText) {
    embed.setFooter({
      text: footerText,
      iconURL: options.footerIcon || config.footerIcon || undefined,
    });
  }

  embed.setTimestamp();

  return embed;
};