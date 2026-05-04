const automodPanel = require('../../functions/automod/automodPanel');
const embedPanel = require('../../functions/embed/embedPanel');

const {
  buildAdminPanel,
  buildModulesPanel,
  buildAutoRolesPanel,
  buildLogsPanel,
  buildChannelPanel,
  buildComingSoonPanel,
  buildPurgeModal,
  LOG_TYPES,
} = require('../../functions/admin/adminPanel');

const guildManager = require('../../guild/guildManager');
const adminModule = require('../../modules/admin/admin');

const LOG_EVENT_GROUPS = {
  members: ['memberJoin', 'memberLeave', 'memberUpdate'],
  messages: ['messageDelete', 'messageEdit'],
  roles: ['roleCreate', 'roleDelete', 'roleUpdate'],
  channels: ['channelCreate', 'channelDelete', 'channelUpdate'],
  voice: ['voiceJoin', 'voiceLeave', 'voiceMove'],
};

const MODULE_COMING_SOON = [
  'admin:sticky',
  'admin:suggestions',
  'admin:tickets',
  'admin:giveaways',
  'admin:fun',
  'admin:polls',
];

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

function getAutoRolesConfig(guildId) {
  return guildManager.getGuildSection(guildId, 'autoRoles', {
    enabled: false,
    roleIds: [],
  });
}

function saveAutoRolesConfig(guildId, config) {
  if (typeof guildManager.replaceGuildSection !== 'function') {
    throw new Error('guildManager.replaceGuildSection is not available.');
  }

  guildManager.replaceGuildSection(guildId, 'autoRoles', {
    enabled: Boolean(config.enabled),
    roleIds: Array.isArray(config.roleIds) ? config.roleIds : [],
  });
}

function toggleLogGroup(guildId, groupName) {
  const events = LOG_EVENT_GROUPS[groupName];

  if (!events) {
    throw new Error(`Unknown log group: ${groupName}`);
  }

  if (typeof guildManager.toggleLogEvents !== 'function') {
    throw new Error('guildManager.toggleLogEvents is not available.');
  }

  return guildManager.toggleLogEvents(guildId, events);
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

      const handledAutomod = await automodPanel.handleInteraction(interaction);
      if (handledAutomod) return;

      const handledEmbed = await embedPanel.handleInteraction(interaction);
      if (handledEmbed) return;

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

      if (interaction.isChannelSelectMenu()) {
        const logType = Object.values(LOG_TYPES).find(
          (type) => type.selectId === interaction.customId
        );

        if (logType) {
          setLogChannel(interaction.guild.id, logType.key, interaction.values[0]);

          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
          );
        }
      }

      if (interaction.isRoleSelectMenu()) {
        if (interaction.customId === 'admin:autoRoles:select') {
          const current = getAutoRolesConfig(interaction.guild.id);

          saveAutoRolesConfig(interaction.guild.id, {
            ...current,
            roleIds: interaction.values,
          });

          return await interaction.update(
            buildAutoRolesPanel(interaction.guild, memberDisplayName)
          );
        }
      }

      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'help-category-select') {
          const helpCommand = client.commands.get('help');

          if (helpCommand?.handleHelpSelectMenu) {
            return await helpCommand.handleHelpSelectMenu(interaction, client);
          }
        }

        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId === 'admin:home') {
          return await interaction.update(
            buildAdminPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:modules') {
          return await interaction.update(
            buildModulesPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:adminpanel') {
          return await interaction.update(
            buildComingSoonPanel(
              '👑 Admin',
              'Admin-only modules and server management tools will live here.'
            )
          );
        }

        if (interaction.customId === 'admin:modpanel') {
          return await interaction.update(
            buildComingSoonPanel(
              '🛡️ Mod Panel',
              'Moderator tools will be grouped here.'
            )
          );
        }

        if (MODULE_COMING_SOON.includes(interaction.customId)) {
          return await interaction.update(
            buildComingSoonPanel(
              '🧩 Module Coming Soon',
              'This module is ready to be built next.'
            )
          );
        }

        if (interaction.customId === 'admin:logs') {
          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:logs:members') {
          toggleLogGroup(interaction.guild.id, 'members');

          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:logs:messages') {
          toggleLogGroup(interaction.guild.id, 'messages');

          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:logs:roles') {
          toggleLogGroup(interaction.guild.id, 'roles');

          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:logs:channels') {
          toggleLogGroup(interaction.guild.id, 'channels');

          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:logs:voice') {
          toggleLogGroup(interaction.guild.id, 'voice');

          return await interaction.update(
            buildLogsPanel(interaction.guild, memberDisplayName)
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

        if (interaction.customId === 'admin:autoRoles') {
          return await interaction.update(
            buildAutoRolesPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:autoRoles:toggle') {
          const current = getAutoRolesConfig(interaction.guild.id);

          saveAutoRolesConfig(interaction.guild.id, {
            ...current,
            enabled: !current.enabled,
          });

          return await interaction.update(
            buildAutoRolesPanel(interaction.guild, memberDisplayName)
          );
        }

        if (interaction.customId === 'admin:autoRoles:clear') {
          const current = getAutoRolesConfig(interaction.guild.id);

          saveAutoRolesConfig(interaction.guild.id, {
            ...current,
            roleIds: [],
          });

          return await interaction.update(
            buildAutoRolesPanel(interaction.guild, memberDisplayName)
          );
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
            buildLogsPanel(interaction.guild, memberDisplayName)
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