'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
} = require('discord.js');

const socialStore = require('../../../modules/social/socialStore');
const socialManager = require('../../../modules/social/socialManager');

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function formatChannel(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function formatRoles(ids = []) {
  const list = Array.isArray(ids) ? ids.filter(Boolean) : [];
  return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function getAdminDefaults(section) {
  const accounts = Object.values(section.accounts || {});
  const firstAccount = accounts[0] || null;
  return {
    alertsChannelId: section.alertsChannelId || firstAccount?.alertChannelId || null,
    logChannelId: section.logChannelId || section.settings?.logChannelId || null,
    managerRoleIds: section.managerRoleIds || [],
    accounts,
  };
}

function platformEnabled(section, platform) {
  if (typeof section[platform] === 'boolean') return section[platform];
  return section.providers?.[platform]?.enabled !== false;
}

function buildSocialAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const section = socialStore.getSocialSection(guild.id);
  const defaults = getAdminDefaults(section);
  const overview = socialManager.getOverview(guild.id);

  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('📣 Social Alerts')
    .setDescription([
      'Configure creator alerts for supported platforms.',
      '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Alert Channel:** ${formatChannel(defaults.alertsChannelId)}`,
      `**Log Channel:** ${formatChannel(defaults.logChannelId)}`,
      `**Manager Roles:** ${formatRoles(defaults.managerRoleIds)}`,
      '',
      `**Twitch:** ${platformEnabled(section, 'twitch') ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**YouTube:** ${platformEnabled(section, 'youtube') ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**TikTok:** ${platformEnabled(section, 'tiktok') ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Kick:** ${platformEnabled(section, 'kick') ? 'Enabled ✅' : 'Disabled ❌'}`,
      '',
      `Accounts: \`${overview.accountCount}\` | Enabled Accounts: \`${overview.enabledAccountCount}\` | Alerts Sent: \`${overview.analytics.alertsSent || 0}\``,
      '',
      '**First Account**',
      defaults.accounts[0] ? `${defaults.accounts[0].displayName} · ${defaults.accounts[0].platform} · \`${defaults.accounts[0].accountId}\`` : '`No accounts yet. Use Create Test Account.`',
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:social:alertsChannel').setPlaceholder('Alert channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new ChannelSelectMenuBuilder().setCustomId('admin:social:logChannel').setPlaceholder('Log channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:social:managerRoles').setPlaceholder('Manager roles').setMinValues(0).setMaxValues(10)),
      row(
        button('admin:social:createTest', '➕ Test Account', ButtonStyle.Success),
        button('admin:social:sendTest', '🧪 Send Test', ButtonStyle.Primary),
        button(section.enabled !== false ? 'admin:social:disable' : 'admin:social:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary)
      ),
      row(
        button('admin:social:toggle:twitch', '🟣 Twitch', ButtonStyle.Secondary),
        button('admin:social:toggle:youtube', '▶️ YouTube', ButtonStyle.Secondary),
        button('admin:social:toggle:tiktok', '🎵 TikTok', ButtonStyle.Secondary),
        button('admin:social:toggle:kick', '🟢 Kick', ButtonStyle.Secondary),
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

function save(guild, updater) {
  return socialStore.updateSocialSection(guild.id, updater, guild);
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }
  await interaction.update(payload);
  return true;
}

function applyAlertChannelToAccounts(section, channelId) {
  const accounts = { ...(section.accounts || {}) };
  for (const accountId of Object.keys(accounts)) {
    accounts[accountId] = { ...accounts[accountId], alertChannelId: channelId };
  }
  return accounts;
}

function toggleProvider(section, platform) {
  const providers = { ...(section.providers || {}) };
  const current = providers[platform] || { enabled: true, status: 'not_configured' };
  providers[platform] = { ...current, enabled: current.enabled === false };
  return {
    ...section,
    [platform]: providers[platform].enabled,
    providers,
  };
}

async function handleSocialAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:social')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:social') return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, memberDisplayName));

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      const prop = customId.split(':')[2];
      if (prop === 'alertsChannel') {
        save(interaction.guild, (section) => ({
          ...section,
          alertsChannelId: value,
          accounts: applyAlertChannelToAccounts(section, value),
        }));
      }
      if (prop === 'logChannel') save(interaction.guild, (section) => ({ ...section, logChannelId: value, settings: { ...(section.settings || {}), logChannelId: value } }));
      return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, memberDisplayName));
    }

    if (interaction.isRoleSelectMenu?.() && customId === 'admin:social:managerRoles') {
      save(interaction.guild, (section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }));
      return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, memberDisplayName));
    }

    if (customId === 'admin:social:enable') socialManager.setEnabled(interaction.guild.id, true, interaction.guild);
    if (customId === 'admin:social:disable') socialManager.setEnabled(interaction.guild.id, false, interaction.guild);

    if (customId.startsWith('admin:social:toggle:')) {
      const platform = customId.split(':')[3];
      save(interaction.guild, (section) => toggleProvider(section, platform));
    }

    if (customId === 'admin:social:createTest') {
      const section = socialStore.getSocialSection(interaction.guild.id);
      const defaults = getAdminDefaults(section);
      socialManager.addAccount(interaction.guild.id, {
        platform: 'twitch',
        displayName: 'Test Creator',
        username: 'testcreator',
        alertChannelId: defaults.alertsChannelId,
        mentionMode: 'none',
        alertTypes: ['live'],
        createdBy: interaction.user.id,
      }, interaction.guild);
    }

    if (customId === 'admin:social:sendTest') {
      await interaction.deferUpdate().catch(() => null);
      const accounts = Object.values(socialStore.getSocialSection(interaction.guild.id).accounts || {});
      if (!accounts.length) throw new Error('Create a test account first.');
      const result = await socialManager.sendTestAlert(interaction.guild.id, accounts[0].accountId, interaction.client, { actorId: interaction.user.id });
      if (!result.success) throw new Error(result.error || 'Test alert failed.');
      return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, memberDisplayName));
    }

    return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, memberDisplayName));
  } catch (error) {
    const payload = { content: `❌ Social Alerts setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildSocialAdminPanel,
  handleSocialAdminInteraction,
};
