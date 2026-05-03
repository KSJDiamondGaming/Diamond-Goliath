const automodPanel = require('../functions/automod/automodPanel');
const embedPanel = require('../functions/embed/embedPanel');

const {
  buildAdminPanel,
  buildChannelPanel,
  buildComingSoonPanel,
  buildPurgeModal,
  LOG_TYPES,
} = require('../functions/admin/adminPanel');

const guildManager = require('../guild/guildManager');
const adminModule = require('../modules/admin/admin');

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function setLogChannel(guildId, type, channelId) {
  if (typeof guildManager.setLogChannelId === 'function') {
    return guildManager.setLogChannelId(guildId, type, channelId);
  }

  if (typeof guildManager.setLogChannel === 'function') {
    return guildManager.setLogChannel(guildId, type, channelId);
  }

  throw new Error('No guildManager log channel setter found.');
}

function toggleAdminLogger(guildId) {
  const current = adminModule.getAdminPanelState(guildId);
  const nextEnabled = !Boolean(current?.adminActionsEnabled);

  if (typeof adminModule.setAdminActionsEnabled === 'function') {
    adminModule.setAdminActionsEnabled(guildId, nextEnabled);
  } else if (typeof adminModule.updateAdminPanelState === 'function') {
    adminModule.updateAdminPanelState(guildId, {
      ...current,
      adminActionsEnabled: nextEnabled,
    });
  } else if (typeof adminModule.saveAdminPanelState === 'function') {
    adminModule.saveAdminPanelState(guildId, {
      ...current,
      adminActionsEnabled: nextEnabled,
    });
  } else {
    throw new Error('No admin logger state setter found.');
  }

  return nextEnabled;
}

module.exports = {
  name: 'interactionCreate',

  async execute(interaction, client) {
    try {
      if (!client) client = interaction.client;

      const memberDisplayName = getMemberDisplayName(interaction);

      /* ---------------- AUTOMOD INTERACTIONS ---------------- */

      const handledAutomod = await automodPanel.handleInteraction(interaction);
      if (handledAutomod) return;

      /* ---------------- EMBED STUDIO INTERACTIONS ---------------- */

      const handledEmbed = await embedPanel.handleInteraction(interaction);
      if (handledEmbed) return;

      /* ---------------- SLASH COMMANDS ---------------- */

      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          return await interaction.reply({
            content: '❌ Command not found.',
            ephemeral: true,
          });
        }

        return await command.execute(interaction, client);
      }

      /* ---------------- CHANNEL SELECT MENUS ---------------- */

      if (interaction.isChannelSelectMenu()) {
        const logType = Object.values(LOG_TYPES).find(
          (type) => type.selectId === interaction.customId
        );

        if (logType) {
          const channelId = interaction.values[0];

          setLogChannel(interaction.guild.id, logType.key, channelId);

          return await interaction.update(
            buildAdminPanel(interaction.guild, memberDisplayName)
          );
        }
      }

      /* ---------------- STRING SELECT MENUS ---------------- */

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'help-category-select') {
          const helpCommand = client.commands.get('help');

          if (helpCommand?.handleHelpSelectMenu) {
            return await helpCommand.handleHelpSelectMenu(interaction, client);
          }
        }

        return;
      }

      /* ---------------- BUTTONS ---------------- */

      if (interaction.isButton()) {
        if (interaction.customId === 'admin:home') {
          return await interaction.update(
            buildAdminPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:automod') {
          return await interaction.reply({
            ...automodPanel.buildAutomodPanel(
              interaction.guild,
              memberDisplayName
            ),
            ephemeral: true,
          });
        }

        if (interaction.customId === 'admin:embed') {
          return await interaction.reply({
            ...embedPanel.buildEmbedPanel(interaction, memberDisplayName),
            ephemeral: true,
          });
        }

        if (interaction.customId === 'admin:stats') {
          return await interaction.update(
            buildComingSoonPanel(
              '📊 Stats System',
              'The server stats system is ready to be wired next.'
            )
          );
        }

        if (interaction.customId === LOG_TYPES.logs.customId) {
          return await interaction.update(buildChannelPanel('logs'));
        }

        if (interaction.customId === LOG_TYPES.modlog.customId) {
          return await interaction.update(buildChannelPanel('modlog'));
        }

        if (interaction.customId === LOG_TYPES.adminlog.customId) {
          return await interaction.update(buildChannelPanel('adminlog'));
        }

        if (interaction.customId === LOG_TYPES.automodlog.customId) {
          return await interaction.update(buildChannelPanel('automodlog'));
        }

        if (interaction.customId === 'admin:toggleadminlogger') {
          toggleAdminLogger(interaction.guild.id);

          return await interaction.update(
            buildAdminPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:purge') {
          return await interaction.showModal(buildPurgeModal());
        }

        if (
          interaction.customId === 'help-back-home' ||
          interaction.customId === 'help-close'
        ) {
          const helpCommand = client.commands.get('help');

          if (helpCommand?.handleHelpButton) {
            return await helpCommand.handleHelpButton(interaction, client);
          }
        }

        console.log('⚠️ Unhandled button:', interaction.customId);
      }

      /* ---------------- MODALS ---------------- */

      if (interaction.isModalSubmit()) {
        if (interaction.customId === 'admin:purgeModal') {
          const rawAmount = interaction.fields.getTextInputValue('amount');
          const amount = Number(rawAmount);

          if (!Number.isInteger(amount) || amount < 1 || amount > 100) {
            return await interaction.reply({
              content: '❌ Please enter a number between 1 and 100.',
              ephemeral: true,
            });
          }

          const deleted = await interaction.channel.bulkDelete(amount, true);

          return await interaction.reply({
            content: `✅ Deleted ${deleted.size} message(s).`,
            ephemeral: true,
          });
        }
      }
    } catch (error) {
      console.error('❌ Interaction error:', error);

      const payload = {
        content: '❌ Something went wrong while handling this interaction.',
        embeds: [],
        components: [],
        ephemeral: true,
      };

      try {
        if (interaction.deferred || interaction.replied) {
          return await interaction.editReply(payload);
        }

        return await interaction.reply(payload);
      } catch (replyError) {
        console.error('❌ Failed to send interaction error response:', replyError);
      }
    }
  },
};