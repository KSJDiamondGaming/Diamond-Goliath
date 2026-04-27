const { EmbedBuilder } = require('discord.js');

/* ---------------- BASE ---------------- */

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

/* ---------------- SAFE HELPERS ---------------- */

function trim(text, max = 4096) {
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function safeFields(fields = []) {
  return fields
    .filter(f => f && f.name && f.value)
    .map(f => ({
      name: trim(String(f.name), 256),
      value: trim(String(f.value), 1024),
      inline: Boolean(f.inline),
    }));
}

/* ---------------- QUICK EMBEDS ---------------- */

function successEmbed(description, options = {}) {
  return baseEmbed({
    color: '#57F287',
    timestamp: options.timestamp ?? true,
  }).setDescription(`✅ ${trim(description)}`);
}

function errorEmbed(description, options = {}) {
  return baseEmbed({
    color: '#ED4245',
    timestamp: options.timestamp ?? true,
  }).setDescription(`❌ ${trim(description)}`);
}

function infoEmbed(description, options = {}) {
  return baseEmbed({
    color: options.color || '#5865F2',
    timestamp: options.timestamp ?? true,
  }).setDescription(`ℹ️ ${trim(description)}`);
}

/* ---------------- MAIN PANEL BUILDER ---------------- */

function createPanelEmbed(interaction, options = {}) {
  const {
    title,
    description,
    thumbnail,
    author,
    color = '#5865F2',
    footerText,
    footerIcon,
    fields = [],
    image,
    timestamp = true,
  } = options;

  const embed = baseEmbed({ color, timestamp });

  if (title) embed.setTitle(trim(title, 256));
  if (description) embed.setDescription(trim(description, 4096));
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);

  if (author) {
    embed.setAuthor({
      name: trim(author.name, 256),
      iconURL: author.iconURL,
    });
  }

  if (fields.length) {
    embed.addFields(safeFields(fields));
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

/* ---------------- MODERATION PRESETS ---------------- */

function createSuccessEmbed(interaction, options = {}) {
  return createPanelEmbed(interaction, {
    color: '#57F287',
    ...options,
  });
}

function createDangerEmbed(interaction, options = {}) {
  return createPanelEmbed(interaction, {
    color: '#ED4245',
    ...options,
  });
}

function createWarningEmbed(interaction, options = {}) {
  return createPanelEmbed(interaction, {
    color: '#FEE75C',
    ...options,
  });
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  baseEmbed,
  successEmbed,
  errorEmbed,
  infoEmbed,
  createPanelEmbed,
  createSuccessEmbed,
  createDangerEmbed,
  createWarningEmbed,
};