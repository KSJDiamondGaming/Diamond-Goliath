const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const automod = require('../../../core/modules/automod');

function buildAutomodPanel(guild, memberDisplayName) {
  const guildId = guild.id;
  const config = automod.getGuildAutoModConfig(guildId);

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛡️ AutoMod Panel')
    .setDescription('Control automated moderation settings.')
    .addFields(
      { name: 'Anti-Spam', value: config.antiSpam.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
      { name: 'Anti-Link', value: config.antiLink.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
      { name: 'Anti-Invite', value: config.antiInvite.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
      { name: 'Caps Abuse', value: config.capsAbuse.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
      { name: 'Bad Words', value: config.badWords.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true },
      { name: 'Repeated Messages', value: config.repeatedMessages.enabled ? 'Enabled ✅' : 'Disabled ❌', inline: true }
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('automod:toggleSpam').setLabel('Spam').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('automod:toggleLink').setLabel('Link').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('automod:toggleInvite').setLabel('Invite').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('automod:toggleCaps').setLabel('Caps').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('automod:toggleWords').setLabel('Words').setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row],
  };
}

async function handleInteraction(interaction) {
  if (!interaction.isButton()) return false;

  const guildId = interaction.guild.id;
  const config = automod.getGuildAutoModConfig(guildId);

  const toggleMap = {
    'automod:toggleSpam': 'antiSpam',
    'automod:toggleLink': 'antiLink',
    'automod:toggleInvite': 'antiInvite',
    'automod:toggleCaps': 'capsAbuse',
    'automod:toggleWords': 'badWords',
  };

  const key = toggleMap[interaction.customId];
  if (!key) return false;

  config[key].enabled = !config[key].enabled;

  automod.saveGuildAutoModConfig(guildId, config);

  await interaction.update(
    buildAutomodPanel(interaction.guild, interaction.member.displayName)
  );

  return true;
}

module.exports = {
  buildAutomodPanel,
  handleInteraction,
};