const { EmbedBuilder } = require('discord.js');

function getRequesterName(interaction) {
  return interaction.member?.displayName || interaction.user.username;
}

function createBaseEmbed(interaction, options = {}) {
  const {
    title = '📘 KSJ Goliath',
    description,
    color = '#5865F2',
    thumbnail,
    footerText,
    timestamp = true,
  } = options;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title);

  if (description) {
    embed.setDescription(description);
  }

  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  embed.setFooter({
    text: footerText || `Requested by ${getRequesterName(interaction)}`,
    iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
  });

  if (timestamp) {
    embed.setTimestamp();
  }

  return embed;
}

function createPanelEmbed(interaction, options = {}) {
  return createBaseEmbed(interaction, {
    color: '#5865F2',
    ...options,
  });
}

module.exports = {
  createBaseEmbed,
  createPanelEmbed,
  getRequesterName,
};