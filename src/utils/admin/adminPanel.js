const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

/**
 * 🧠 MAIN HUB
 */
function buildAdminPanel(guild, memberDisplayName) {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛠️ KSJ Goliath Admin Hub')
    .setDescription('Control your entire server from one panel.')
    .addFields(
      { name: '⚙️ AutoMod', value: 'Filters & protection', inline: true },
      { name: '🎨 Embed', value: 'Create custom embeds', inline: true },
      { name: '📊 Stats', value: 'Server stats system', inline: true },
      { name: '📋 Logs', value: 'Set logs channel', inline: true },
      { name: '📌 Mod Log', value: 'Set mod log channel', inline: true },
      { name: '🧹 Purge', value: 'Bulk delete messages', inline: true }
    )
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:automod')
      .setLabel('AutoMod')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('admin:embed')
      .setLabel('Embed')
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('admin:stats')
      .setLabel('Stats')
      .setStyle(ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:setlogs')
      .setLabel('Set Logs')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('admin:setmodlog')
      .setLabel('Set Mod Log')
      .setStyle(ButtonStyle.Success),

    new ButtonBuilder()
      .setCustomId('admin:purge')
      .setLabel('Purge')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    components: [row1, row2],
  };
}

/**
 * 📋 CHANNEL PICKER PANEL
 */
function buildChannelPanel(type) {
  const isModLog = type === 'modlog';

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(isModLog ? '📌 Set Mod Log Channel' : '📋 Set Logs Channel')
    .setDescription('Select a channel below')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(isModLog ? 'admin:selectmodlog' : 'admin:selectlogs')
      .setPlaceholder('Choose a channel')
      .addChannelTypes(ChannelType.GuildText)
  );

  const back = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:home')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [row, back],
  };
}

/**
 * 🧹 PURGE MODAL
 */
function buildPurgeModal() {
  const modal = new ModalBuilder()
    .setCustomId('admin:purgeModal')
    .setTitle('Purge Messages');

  const input = new TextInputBuilder()
    .setCustomId('amount')
    .setLabel('Amount (1-100)')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(input));

  return modal;
}

module.exports = {
  buildAdminPanel,
  buildChannelPanel,
  buildPurgeModal,
};