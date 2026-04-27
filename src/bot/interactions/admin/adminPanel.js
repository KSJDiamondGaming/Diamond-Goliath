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

const { getLogChannelId } = require('../../../core/guild/store');
const adminModule = require('../../../core/modules/admin');

/**
 * 🧠 MAIN HUB
 */
function buildAdminPanel(guild, memberDisplayName) {
  const guildId = guild?.id;

  const logsChannelId = getLogChannelId(guildId, 'general');
  const automodLogChannelId = getLogChannelId(guildId, 'automod');
  const adminLogChannelId = getLogChannelId(guildId, 'admin');
  const adminState = adminModule.getAdminPanelState(guildId);
  const adminActionLoggerEnabled = adminState.adminActionsEnabled;
  const modLogChannelId = getLogChannelId(guildId, 'moderation');

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🛠️ Admin Hub')
    .setDescription('Control your entire server from one panel.')
    .addFields(
      { name: '⚙️ AutoMod', value: 'Filters & protection', inline: true },
      { name: '🎨 Embed', value: 'Create custom embeds', inline: true },
      { name: '📊 Stats', value: 'Server stats system', inline: true },
      {
        name: '📋 Logs',
        value: logsChannelId ? `Set logs channel\nCurrent: <#${logsChannelId}>` : 'Set logs channel',
        inline: true,
      },
      {
        name: '📌 Mod Log',
        value: modLogChannelId ? `Set mod log channel\nCurrent: <#${modLogChannelId}>` : 'Set mod log channel',
        inline: true,
      },
      {
        name: '👑 Admin Log',
        value: adminLogChannelId ? `Set admin log channel\nCurrent: <#${adminLogChannelId}>` : 'Set admin log channel',
        inline: true,
      },
      {
        name: '🤖 AutoMod Log',
        value: automodLogChannelId ? `Set automod log channel\nCurrent: <#${automodLogChannelId}>` : 'Set automod log channel',
        inline: true,
      },
      {
        name: '🧾 Admin Logger',
        value: adminActionLoggerEnabled ? 'Enabled ✅' : 'Disabled ❌',
        inline: true,
      },
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
      .setLabel(logsChannelId ? 'Set Logs ✅' : 'Set Logs')
      .setStyle(logsChannelId ? ButtonStyle.Success : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('admin:setmodlog')
      .setLabel(modLogChannelId ? 'Set Mod Log ✅' : 'Set Mod Log')
      .setStyle(modLogChannelId ? ButtonStyle.Success : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('admin:setadminlog')
      .setLabel(adminLogChannelId ? 'Set Admin Log ✅' : 'Set Admin Log')
      .setStyle(adminLogChannelId ? ButtonStyle.Success : ButtonStyle.Primary)
  );

  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('admin:setautomodlog')
      .setLabel(automodLogChannelId ? 'Set AutoMod Log ✅' : 'Set AutoMod Log')
      .setStyle(automodLogChannelId ? ButtonStyle.Success : ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId('admin:toggleadminlogger')
      .setLabel(adminActionLoggerEnabled ? 'Admin Logger ON' : 'Admin Logger OFF')
      .setStyle(adminActionLoggerEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('admin:purge')
      .setLabel('Purge')
      .setStyle(ButtonStyle.Danger)
  );

  return {
    embeds: [embed],
    components: [row1, row2, row3],
  };
}

/**
 * 📋 CHANNEL PICKER PANEL
 */
function buildChannelPanel(type) {
  const panelMap = {
    logs: {
      title: '📋 Set Logs Channel',
      customId: 'admin:selectlogs',
    },
    modlog: {
      title: '📌 Set Mod Log Channel',
      customId: 'admin:selectmodlog',
    },
    adminlog: {
      title: '👑 Set Admin Log Channel',
      customId: 'admin:selectadminlog',
    },
    automodlog: {
      title: '🤖 Set AutoMod Log Channel',
      customId: 'admin:selectautomodlog',
    },
  };

  const selected = panelMap[type] || panelMap.logs;

  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle(selected.title)
    .setDescription('Select a channel below')
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId(selected.customId)
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