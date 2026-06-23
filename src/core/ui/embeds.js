const {
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

/* ---------------- CONFIG ---------------- */

const COLORS = {
  PRIMARY: '#5865F2',
  SUCCESS: '#57F287',
  WARNING: '#FEE75C',
  ERROR: '#ED4245',
  DANGER: '#ED4245',
  SOFT_PURPLE: '#DC92FF',
};

const EMOJIS = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️',
  DASHBOARD: '📊',
  LOADING: '📡',
};

/* ---------------- SAFETY ---------------- */

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

/* ---------------- EMBEDS ---------------- */

function getBotIcon(client) {
  return client?.user?.displayAvatarURL?.({ dynamic: true }) || null;
}

function baseEmbed(clientOrOptions = {}, maybeColor = COLORS.PRIMARY) {
  const isClient = clientOrOptions?.user;

  const options = isClient
    ? { client: clientOrOptions, color: maybeColor, timestamp: true }
    : clientOrOptions;

  const {
    client = null,
    color = COLORS.PRIMARY,
    timestamp = true,
    footer = true,
  } = options;

  const embed = new EmbedBuilder().setColor(color);

  if (timestamp) embed.setTimestamp();

  if (footer && client?.user) {
    embed.setFooter({
      text: `${client.user.username} • Goliath`,
      iconURL: getBotIcon(client),
    });
  }

  return embed;
}

function createEmbed({
  title = '',
  description = '',
  color = COLORS.PRIMARY,
  fields = [],
  footer = null,
  footerIcon = null,
  thumbnail = null,
  image = null,
  timestamp = true,
} = {}) {
  const embed = baseEmbed({ color, timestamp, footer: false });

  if (title) embed.setTitle(trim(title, 256));
  if (description) embed.setDescription(trim(description, 4096));
  if (fields.length) embed.addFields(safeFields(fields));
  if (footer) {
    embed.setFooter({
      text: trim(footer, 2048),
      iconURL: footerIcon || undefined,
    });
  }
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);

  return embed;
}

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
    'Goliath';

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

/* ---------------- QUICK EMBEDS ---------------- */

function loadingEmbed(client, text = '`📡` Loading...') {
  return baseEmbed(client).setDescription(text);
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

function infoEmbed(titleOrDescription, descriptionOrOptions = {}, maybeOptions = {}) {
  const hasDescription = typeof descriptionOrOptions === 'string';

  return createEmbed({
    title: hasDescription ? titleOrDescription : `${EMOJIS.DASHBOARD} Info`,
    description: hasDescription ? descriptionOrOptions : titleOrDescription,
    color: COLORS.PRIMARY,
    ...(hasDescription ? maybeOptions : descriptionOrOptions),
  });
}

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

/* ---------------- STATUS HELPERS ---------------- */

function statusText(ms) {
  if (ms < 100) return '🟢 Excellent';
  if (ms < 200) return '🟡 Good';
  if (ms < 400) return '🟠 Moderate';
  return '🔴 High';
}

function formatUptime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor(totalSeconds / 3600) % 24;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const seconds = Math.floor(totalSeconds % 60);

  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

/* ---------------- BUTTONS ---------------- */

function createButton({
  id,
  label,
  style = ButtonStyle.Secondary,
  emoji = null,
  disabled = false,
}) {
  const button = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(disabled);

  if (emoji) button.setEmoji(emoji);

  return button;
}

function createPrimaryButton(id, label, emoji = null, disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Primary,
    emoji,
    disabled,
  });
}

function createSecondaryButton(id, label, emoji = null, disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Secondary,
    emoji,
    disabled,
  });
}

function createSuccessButton(id, label, emoji = '✅', disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Success,
    emoji,
    disabled,
  });
}

function createDangerButton(id, label, emoji = '⚠️', disabled = false) {
  return createButton({
    id,
    label,
    style: ButtonStyle.Danger,
    emoji,
    disabled,
  });
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  COLORS,
  EMOJIS,

  trim,
  safeFields,

  baseEmbed,
  createEmbed,
  createPanelEmbed,

  loadingEmbed,
  successEmbed,
  errorEmbed,
  warningEmbed,
  infoEmbed,

  createSuccessEmbed,
  createDangerEmbed,
  createWarningEmbed,

  statusText,
  formatUptime,

  createButton,
  createPrimaryButton,
  createSecondaryButton,
  createSuccessButton,
  createDangerButton,
};
