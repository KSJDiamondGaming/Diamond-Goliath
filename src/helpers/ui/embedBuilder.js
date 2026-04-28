const { EmbedBuilder } = require('discord.js');
const { COLORS, EMOJIS } = require('./uiConfig');

/* ---------------- BASE ---------------- */

function trim(text, max = 4096) {
  if (!text) return null;

  const value = String(text);
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

function safeFields(fields = []) {
  return fields
    .filter((field) => field && field.name && field.value)
    .map((field) => ({
      name: trim(field.name, 256),
      value: trim(field.value, 1024),
      inline: Boolean(field.inline),
    }));
}

function baseEmbed(options = {}) {
  const { color = COLORS.PRIMARY, timestamp = true } = options;

  const embed = new EmbedBuilder().setColor(color);

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

/* ---------------- GENERIC EMBED ---------------- */

function createEmbed({
  title = '',
  description = '',
  color = COLORS.PRIMARY,
  fields = [],
  footer = null,
  thumbnail = null,
  image = null,
  timestamp = true,
} = {}) {
  const embed = baseEmbed({ color, timestamp });

  if (title) embed.setTitle(trim(title, 256));
  if (description) embed.setDescription(trim(description, 4096));
  if (fields.length) embed.addFields(safeFields(fields));
  if (footer) embed.setFooter({ text: trim(footer, 2048) });
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);

  return embed;
}

/* ---------------- QUICK EMBEDS ---------------- */

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

function infoEmbed(titleOrDescription, descriptionOrOptions = {}, maybeOptions = {}) {
  const hasDescription = typeof descriptionOrOptions === 'string';

  return createEmbed({
    title: hasDescription ? titleOrDescription : `${EMOJIS.DASHBOARD} Info`,
    description: hasDescription ? descriptionOrOptions : titleOrDescription,
    color: COLORS.PRIMARY,
    ...(hasDescription ? maybeOptions : descriptionOrOptions),
  });
}

/* ---------------- PANEL EMBED ---------------- */

function createPanelEmbed(interaction, options = {}) {
  const {
    title,
    description,
    thumbnail,
    author,
    color = COLORS.PRIMARY,
    footerText,
    footerIcon,
    fields = [],
    image,
    timestamp = true,
  } = options;

  const embed = createEmbed({
    title,
    description,
    color,
    fields,
    thumbnail,
    image,
    timestamp,
  });

  if (author) {
    embed.setAuthor({
      name: trim(author.name, 256),
      iconURL: author.iconURL,
    });
  }

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
    text: trim(resolvedFooterText, 2048),
    iconURL: resolvedFooterIcon,
  });

  return embed;
}

/* ---------------- PANEL PRESETS ---------------- */

function createSuccessEmbed(interaction, options = {}) {
  return createPanelEmbed(interaction, {
    color: COLORS.SUCCESS,
    ...options,
  });
}

function createDangerEmbed(interaction, options = {}) {
  return createPanelEmbed(interaction, {
    color: COLORS.ERROR,
    ...options,
  });
}

function createWarningEmbed(interaction, options = {}) {
  return createPanelEmbed(interaction, {
    color: COLORS.WARNING,
    ...options,
  });
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  trim,
  safeFields,

  baseEmbed,
  createEmbed,

  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,

  createPanelEmbed,
  createSuccessEmbed,
  createDangerEmbed,
  createWarningEmbed,
};