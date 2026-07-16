'use strict';

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ChannelSelectMenuBuilder, ChannelType, RoleSelectMenuBuilder,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder,
} = require('discord.js');

const social = require('./social');
const socialHealth = require('./socialHealth');

function row(...components) { return new ActionRowBuilder().addComponents(...components); }
function button(customId, label, style = ButtonStyle.Primary) { return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style); }
function displayName(interaction) { return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User'; }
function formatChannel(id) { return id ? `<#${id}>` : '`Not set`'; }
function formatRoles(ids = []) { return ids.length ? ids.map((id) => `<@&${id}>`).join(', ') : '`None`'; }

function getSection(guildId) { return social.store.getSocialSection(guildId); }
function accounts(section) { return Object.values(section.accounts || {}); }
function defaultAlertChannel(section) { return section.alertsChannelId || accounts(section)[0]?.alertChannelId || null; }

function accountSelector(section) {
  const items = accounts(section).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId('admin:social:account').setPlaceholder(items.length ? 'Manage a social account' : 'No social accounts configured').setMinValues(1).setMaxValues(1).setDisabled(!items.length);
  for (const account of items) {
    menu.addOptions(new StringSelectMenuOptionBuilder().setLabel(String(account.displayName || account.username || account.platform).slice(0, 100)).setDescription(`${account.platform} · ${account.username || account.externalId || 'No identifier'}`.slice(0, 100)).setValue(account.accountId));
  }
  return menu;
}

function buildSocialAdminPanel(guild, requestedBy = 'Unknown User') {
  const section = getSection(guild.id);
  const list = accounts(section);
  const overview = social.getOverview(guild.id);
  const providers = social.providers.listProviders();
  const providerSummary = providers.map((provider) => `${provider.label}: ${provider.status}`).join(' · ');

  const embed = new EmbedBuilder()
    .setColor(section.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('📣 Social Alerts')
    .setDescription([
      'Create and manage creator alerts using native Discord controls.', '',
      `**Status:** ${section.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Default Alert Channel:** ${formatChannel(defaultAlertChannel(section))}`,
      `**Manager Roles:** ${formatRoles(section.managerRoleIds || [])}`,
      `**Accounts:** ${overview.accountCount} total · ${overview.enabledAccountCount} enabled`,
      `**Alerts Sent:** ${overview.analytics.alertsSent || 0} · **Errors:** ${overview.analytics.errors || 0}`, '',
      `**Providers:** ${providerSummary || 'None'}`,
    ].join('\n'))
    .setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp();

  return { embeds: [embed], components: [
    row(new ChannelSelectMenuBuilder().setCustomId('admin:social:alertsChannel').setPlaceholder('Default alert channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
    row(new RoleSelectMenuBuilder().setCustomId('admin:social:managerRoles').setPlaceholder('Manager roles').setMinValues(0).setMaxValues(10)),
    row(accountSelector(section)),
    row(button('admin:social:create', '➕ Add Account', ButtonStyle.Success), button('admin:social:checkAll', '🔄 Check Now', ButtonStyle.Primary), button(section.enabled !== false ? 'admin:social:disable' : 'admin:social:enable', section.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary)),
    row(button('admin:social:health', '🩺 Health', ButtonStyle.Secondary), button('admin:social:repair', '🛠️ Repair', ButtonStyle.Primary), button('admin:social:export', '📤 Export', ButtonStyle.Secondary), button('admin:social:reset', '🗑️ Reset', ButtonStyle.Danger), button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)),
  ] };
}

function buildAccountPanel(guild, account, requestedBy) {
  const embed = new EmbedBuilder().setColor(account.enabled !== false ? 0x57f287 : 0x5865f2).setTitle(`📣 ${account.displayName || account.username}`)
    .setDescription([
      `**Platform:** ${account.platform}`,
      `**Identifier:** ${account.username || account.externalId || 'Not set'}`,
      `**Alert Channel:** ${formatChannel(account.alertChannelId)}`,
      `**Status:** ${account.enabled !== false ? 'Enabled' : 'Disabled'}`,
      `**Provider:** ${account.lastSeen?.lastProviderStatus || 'Not checked'}`,
      `**Last Error:** ${account.lastSeen?.lastProviderError || 'None'}`,
      `**Last Alert:** ${account.lastSeen?.lastAlertAt || 'Never'}`,
    ].join('\n')).setFooter({ text: `Requested by ${requestedBy}` }).setTimestamp();
  const id = account.accountId;
  return { embeds: [embed], components: [
    row(button(`admin:social:test:${id}`, '🧪 Test Alert', ButtonStyle.Primary), button(`admin:social:check:${id}`, '🔄 Check Provider', ButtonStyle.Secondary), button(`admin:social:toggleAccount:${id}`, account.enabled !== false ? '⏸️ Disable' : '▶️ Enable', ButtonStyle.Secondary), button(`admin:social:delete:${id}`, '🗑️ Delete', ButtonStyle.Danger)),
    row(button('admin:social', '⬅️ Social Alerts', ButtonStyle.Secondary)),
  ] };
}

function creationModal() {
  return new ModalBuilder().setCustomId('admin:social:createSubmit').setTitle('Add Social Account').addComponents(
    row(new TextInputBuilder().setCustomId('platform').setLabel('Platform').setPlaceholder('twitch, youtube, tiktok, kick, instagram or x').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)),
    row(new TextInputBuilder().setCustomId('identifier').setLabel('Username, channel ID or URL').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(500)),
    row(new TextInputBuilder().setCustomId('name').setLabel('Display name').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)),
  );
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

async function handleSocialAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:social')) return false;
  const requestedBy = displayName(interaction);
  const actorId = interaction.user?.id || null;

  try {
    if (customId === 'admin:social') return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy));
    if (customId === 'admin:social:create') { await interaction.showModal(creationModal()); return true; }
    if (customId === 'admin:social:createSubmit' && interaction.isModalSubmit?.()) {
      const platform = interaction.fields.getTextInputValue('platform').trim().toLowerCase();
      if (!social.providers.getProvider(platform)) throw new Error('Unsupported platform.');
      const identifier = interaction.fields.getTextInputValue('identifier').trim();
      const name = interaction.fields.getTextInputValue('name').trim();
      const section = getSection(interaction.guild.id);
      social.addAccount(interaction.guild.id, { platform, username: identifier, displayName: name || identifier, alertChannelId: defaultAlertChannel(section), createdBy: actorId }, { actorId, action: 'social_discord_account_create' });
      await interaction.reply({ content: 'Social account created.', flags: 64 });
      return true;
    }
    if (interaction.isChannelSelectMenu?.() && customId === 'admin:social:alertsChannel') {
      const channelId = interaction.values?.[0] || null;
      social.store.updateSocialSection(interaction.guild.id, (section) => ({ ...section, alertsChannelId: channelId, accounts: Object.fromEntries(Object.entries(section.accounts || {}).map(([id, account]) => [id, { ...account, alertChannelId: channelId }])) }), { actorId });
      return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy));
    }
    if (interaction.isRoleSelectMenu?.() && customId === 'admin:social:managerRoles') {
      social.store.updateSocialSection(interaction.guild.id, (section) => ({ ...section, managerRoleIds: [...new Set(interaction.values || [])] }), { actorId });
      return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy));
    }
    if (interaction.isStringSelectMenu?.() && customId === 'admin:social:account') {
      const account = getSection(interaction.guild.id).accounts[interaction.values[0]];
      if (!account) throw new Error('Social account not found.');
      return safeUpdate(interaction, buildAccountPanel(interaction.guild, account, requestedBy));
    }
    if (customId === 'admin:social:enable' || customId === 'admin:social:disable') {
      social.setEnabled(interaction.guild.id, customId.endsWith(':enable'), { actorId });
      return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy));
    }
    if (customId === 'admin:social:checkAll') {
      await interaction.deferReply({ flags: 64 });
      const result = await social.scheduler.runSocialCheck(interaction.client, { guildIds: [interaction.guild.id] });
      await interaction.editReply(`Social check complete. Accounts checked: **${result.accountCount || 0}**.`); return true;
    }
    if (customId === 'admin:social:health') {
      await interaction.deferReply({ flags: 64 }); const health = await socialHealth.buildHealth(interaction.guild);
      await interaction.editReply(`**Social Health:** ${health.healthy ? 'Healthy ✅' : 'Needs attention ⚠️'}\n${health.issues.length ? health.issues.slice(0, 10).map((i) => `• ${i.code}${i.accountId ? ` — ${i.accountId}` : ''}`).join('\n') : '• No issues found.'}`); return true;
    }
    if (customId === 'admin:social:repair') {
      await interaction.deferReply({ flags: 64 }); const result = await socialHealth.repair(interaction.guild, { actorId });
      await interaction.editReply(`Repair complete. Checked: **${result.repaired.length}** · Failed: **${result.failed.length}**.`); return true;
    }
    if (customId === 'admin:social:export') {
      const data = socialHealth.exportConfig(interaction.guild.id); const file = new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name: `social-${interaction.guild.id}.json` });
      await interaction.reply({ content: 'Social Alerts configuration export.', files: [file], flags: 64 }); return true;
    }
    if (customId === 'admin:social:reset') return safeUpdate(interaction, { content: 'Reset Social Alerts and remove all configured accounts?', embeds: [], components: [row(button('admin:social:resetConfirm', 'Confirm Reset', ButtonStyle.Danger), button('admin:social', 'Cancel', ButtonStyle.Secondary))] });
    if (customId === 'admin:social:resetConfirm') { socialHealth.reset(interaction.guild.id, { actorId }); return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy)); }

    const [action, accountId] = customId.replace('admin:social:', '').split(':');
    if (accountId) {
      const account = getSection(interaction.guild.id).accounts[accountId];
      if (!account) throw new Error('Social account not found.');
      if (action === 'test') { await interaction.deferReply({ flags: 64 }); const result = await social.sendTestAlert(interaction.guild.id, accountId, interaction.client, { actorId }); if (!result.success) throw new Error(result.error); await interaction.editReply('Test alert sent.'); return true; }
      if (action === 'check') { await interaction.deferReply({ flags: 64 }); const result = await social.providers.checkAccount(account); social.updateAccount(interaction.guild.id, accountId, { lastSeen: { ...(account.lastSeen || {}), lastCheckedAt: result.checkedAt || new Date().toISOString(), lastProviderStatus: result.providerStatus || result.status || 'unknown', lastProviderError: result.success ? '' : result.error || '' } }, { actorId }); await interaction.editReply(`Provider check: **${result.providerStatus || result.status || 'unknown'}**${result.error ? `\n${result.error}` : ''}`); return true; }
      if (action === 'toggleAccount') { const updated = social.updateAccount(interaction.guild.id, accountId, { enabled: account.enabled === false }, { actorId }); return safeUpdate(interaction, buildAccountPanel(interaction.guild, updated, requestedBy)); }
      if (action === 'delete') { social.removeAccount(interaction.guild.id, accountId, { actorId }); return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy)); }
    }

    return safeUpdate(interaction, buildSocialAdminPanel(interaction.guild, requestedBy));
  } catch (error) {
    const payload = { content: `❌ Social Alerts setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null); else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = { buildSocialAdminPanel, handleSocialAdminInteraction };
