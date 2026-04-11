const { EmbedBuilder } = require('discord.js');

const EMBED_COLORS = {
  primary: '#5865F2',
  success: '#57F287',
  warning: '#FEE75C',
  danger: '#ED4245',
  neutral: '#2B2D31',
};

function getRequesterName(interaction) {
  return interaction.member?.displayName || interaction.user.username;
}

function applyDefaultFooter(embed, interaction, footerText) {
  embed.setFooter({
    text: footerText || `Requested by ${getRequesterName(interaction)}`,
    iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
  });

  return embed;
}

function createBaseEmbed(interaction, options = {}) {
  const {
    title = '📘 KSJ Goliath',
    description = null,
    color = EMBED_COLORS.primary,
    thumbnail = null,
    image = null,
    footerText = null,
    author = null,
    timestamp = true,
  } = options;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title);

  if (description) embed.setDescription(description);
  if (thumbnail) embed.setThumbnail(thumbnail);
  if (image) embed.setImage(image);

  if (author?.name) {
    embed.setAuthor({
      name: author.name,
      iconURL: author.iconURL || undefined,
      url: author.url || undefined,
    });
  }

  applyDefaultFooter(embed, interaction, footerText);

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

function createPanelEmbed(interaction, options = {}) {
  return createBaseEmbed(interaction, {
    color: EMBED_COLORS.primary,
    ...options,
  });
}

function createSuccessEmbed(interaction, options = {}) {
  return createBaseEmbed(interaction, {
    title: '✅ Success',
    color: EMBED_COLORS.success,
    ...options,
  });
}

function createWarningEmbed(interaction, options = {}) {
  return createBaseEmbed(interaction, {
    title: '⚠️ Warning',
    color: EMBED_COLORS.warning,
    ...options,
  });
}

function createDangerEmbed(interaction, options = {}) {
  return createBaseEmbed(interaction, {
    title: '❌ Error',
    color: EMBED_COLORS.danger,
    ...options,
  });
}

module.exports = {
  EMBED_COLORS,
  getRequesterName,
  createBaseEmbed,
  createPanelEmbed,
  createSuccessEmbed,
  createWarningEmbed,
  createDangerEmbed,
};