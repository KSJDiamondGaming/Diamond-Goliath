'use strict';

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');
const verificationManager = require('../../../modules/verification/verificationManager');
const verificationStore = require('../../../modules/verification/verificationStore');

const PAGES = new Set(['setup', 'panel', 'status']);

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName || interaction.user?.displayName || interaction.user?.username || 'Unknown User';
}

function cleanArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

function getConfig(guildId) {
  const modules = guildManager.getGuildSection(guildId, 'modules', {});
  const config = modules?.verification && typeof modules.verification === 'object' ? modules.verification : {};
  return {
    enabled: true,
    verificationChannelId: null,
    logChannelId: null,
    verifiedRoleIds: [],
    pendingRoleIds: [],
    dmOnVerify: true,
    removePendingRole: true,
    ...config,
  };
}

function saveConfig(guild, updater) {
  const current = getConfig(guild.id);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  guildManager.updateGuildSection(guild.id, 'modules', (modules = {}) => ({
    ...(modules && typeof modules === 'object' ? modules : {}),
    verification: {
      ...next,
      updatedAt: new Date().toISOString(),
    },
  }), {}, guild);
  verificationManager.configureVerification(guild.id, {
    enabled: next.enabled !== false,
    settings: {
      verifiedRoleId: cleanArray(next.verifiedRoleIds)[0] || null,
      unverifiedRoleId: cleanArray(next.pendingRoleIds)[0] || null,
      logChannelId: next.logChannelId || null,
      dmOnVerify: next.dmOnVerify !== false,
      removePendingRole: next.removePendingRole !== false,
    },
  }, { action: 'verification_admin_config_sync' });
  return getConfig(guild.id);
}

function resetConfig(guild) {
  guildManager.updateGuildSection(guild.id, 'modules', (modules = {}) => {
    const nextModules = { ...(modules && typeof modules === 'object' ? modules : {}) };
    delete nextModules.verification;
    return nextModules;
  }, {}, guild);
  verificationStore.saveVerificationSection(guild.id, verificationStore.defaultVerificationSection(), { action: 'verification_admin_reset' });
}

function formatChannel(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function formatRoles(ids = []) {
  const list = cleanArray(ids);
  return list.length ? list.map((id) => `<@&${id}>`).join(', ') : '`None`';
}

function latestPanel(guildId) {
  return verificationStore.getLatestPanel(guildId);
}

function template(guildId) {
  return verificationStore.getVerificationSection(guildId).panelTemplate || verificationStore.defaultPanelTemplate();
}

function navRows(page, config) {
  return [
    row(
      button('admin:verification:page:setup', '⚙️ Setup', page === 'setup' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      button('admin:verification:page:panel', '🎨 Panel Builder', page === 'panel' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      button('admin:verification:page:status', '🩺 Status', page === 'status' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      button(config.enabled !== false ? 'admin:verification:disable' : 'admin:verification:enable', config.enabled !== false ? '⏸️ Disable' : '▶️ Enable', config.enabled !== false ? ButtonStyle.Secondary : ButtonStyle.Success),
      button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
    ),
  ];
}

function panelSummary(guildId) {
  const panel = latestPanel(guildId);
  if (!panel) return '`No deployed panel yet.`';
  return [
    `**Latest Panel:** \`${panel.panelId}\``,
    `**Channel:** ${formatChannel(panel.channelId)}`,
    `**Message ID:** ${panel.messageId ? `\`${panel.messageId}\`` : '`Not deployed`'}`,
    `**Last Deployed:** ${panel.lastDeployedAt ? `<t:${Math.floor(new Date(panel.lastDeployedAt).getTime() / 1000)}:R>` : '`Never`'}`,
  ].join('\n');
}

function buildSetupPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const status = verificationManager.getVerificationStatus(guild.id);
  const panels = Object.values(status.panels || {});

  const embed = new EmbedBuilder()
    .setColor(config.enabled !== false ? 0x57f287 : 0x5865f2)
    .setTitle('✅ Verification · Setup')
    .setDescription([
      'Configure the channels, roles and verification behaviour.',
      '',
      `**Status:** ${config.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Verification Channel:** ${formatChannel(config.verificationChannelId)}`,
      `**Log Channel:** ${formatChannel(config.logChannelId)}`,
      `**Verified Roles:** ${formatRoles(config.verifiedRoleIds)}`,
      `**Pending Roles:** ${formatRoles(config.pendingRoleIds)}`,
      `**DM On Verify:** ${config.dmOnVerify !== false ? 'Yes ✅' : 'No ❌'}`,
      `**Remove Pending Role:** ${config.removePendingRole !== false ? 'Yes ✅' : 'No ❌'}`,
      '',
      `Panels: \`${panels.length}\` | Verified: \`${status.analytics?.verified || 0}\` | Failed: \`${status.analytics?.failed || 0}\``,
    ].join('\n'))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(new ChannelSelectMenuBuilder().setCustomId('admin:verification:channel').setPlaceholder('Verification channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new ChannelSelectMenuBuilder().setCustomId('admin:verification:logChannel').setPlaceholder('Log channel').setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setMinValues(0).setMaxValues(1)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:verification:verifiedRoles').setPlaceholder('Verified role(s)').setMinValues(0).setMaxValues(10)),
      row(new RoleSelectMenuBuilder().setCustomId('admin:verification:pendingRoles').setPlaceholder('Pending/unverified role(s)').setMinValues(0).setMaxValues(10)),
      row(
        button('admin:verification:export', '📤 Export', ButtonStyle.Secondary),
        button('admin:verification:resetAll', '♻️ Reset Module', ButtonStyle.Danger)
      ),
      ...navRows('setup', config),
    ],
  };
}

function buildPanelBuilderPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const currentTemplate = template(guild.id);
  const previewPanel = { panelId: 'preview', ...currentTemplate };

  const embed = new EmbedBuilder()
    .setColor(currentTemplate.color || 0x57f287)
    .setTitle('🎨 Verification · Panel Builder')
    .setDescription([
      'Edit, preview, deploy, redeploy or delete the verification panel.',
      '',
      `**Title:** ${currentTemplate.title}`,
      `**Button:** ${currentTemplate.buttonEmoji ? `${currentTemplate.buttonEmoji} ` : ''}${currentTemplate.buttonLabel} · \`${currentTemplate.buttonStyle}\``,
      `**Colour:** \`${currentTemplate.color}\``,
      `**Footer:** ${currentTemplate.footer || '`None`'}`,
      '',
      panelSummary(guild.id),
    ].join('\n'))
    .addFields({ name: 'Live Embed Preview', value: currentTemplate.description.slice(0, 1000) || '`No description.`' })
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed, verificationManager.buildVerificationEmbed(previewPanel)],
    components: [
      row(
        button('admin:verification:editEmbed', '✏️ Edit Embed', ButtonStyle.Primary),
        button('admin:verification:editButton', '🔘 Edit Button', ButtonStyle.Primary),
        button('admin:verification:preview', '👁️ Preview', ButtonStyle.Secondary),
        button('admin:verification:deploy', '🚀 Deploy', ButtonStyle.Success),
        button('admin:verification:redeploy', '🔄 Redeploy', ButtonStyle.Success)
      ),
      row(
        button('admin:verification:deleteLatest', '🗑️ Delete Latest', ButtonStyle.Danger),
        button('admin:verification:toggleDm', '📩 DM', ButtonStyle.Secondary),
        button('admin:verification:togglePending', '🧹 Pending', ButtonStyle.Secondary),
        button('admin:verification:resetTemplate', '♻️ Reset Design', ButtonStyle.Danger)
      ),
      row(new StringSelectMenuBuilder()
        .setCustomId('admin:verification:buttonStyle')
        .setPlaceholder('Button style')
        .addOptions([
          { label: 'Success', value: 'success', description: 'Green verification button' },
          { label: 'Primary', value: 'primary', description: 'Blue verification button' },
          { label: 'Secondary', value: 'secondary', description: 'Grey verification button' },
          { label: 'Danger', value: 'danger', description: 'Red verification button' },
        ])),
      ...navRows('panel', config),
    ],
  };
}

async function buildStatusPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const report = await verificationManager.buildHealthReport(guild);
  const status = verificationManager.getVerificationStatus(guild.id);

  const embed = new EmbedBuilder()
    .setColor(report.warnings.length ? 0xfaa61a : 0x57f287)
    .setTitle('🩺 Verification · Status')
    .setDescription([
      `**Overall:** ${report.warnings.length ? 'Needs attention ⚠️' : 'Healthy ✅'}`,
      `**Enabled:** ${report.enabled ? 'Yes ✅' : 'No ❌'}`,
      `**Verified Role:** ${report.hasVerifiedRole ? 'Found ✅' : 'Missing ❌'}`,
      `**Pending Role:** ${report.hasPendingRole ? 'Found ✅' : 'Not configured / missing ⚠️'}`,
      `**Log Channel:** ${report.hasLogChannel ? 'Configured ✅' : 'Not configured ⚠️'}`,
      '',
      '**Warnings**',
      report.warnings.length ? report.warnings.map((warning) => `• ${warning}`).join('\n') : 'None ✅',
      '',
      '**Panels**',
      report.panels.length ? report.panels.map((panel) => `• \`${panel.panelId}\` — ${panel.status}`).join('\n') : '`No panel records.`',
      '',
      `Verified: \`${status.analytics?.verified || 0}\` | Failed: \`${status.analytics?.failed || 0}\` | Already Verified: \`${status.analytics?.alreadyVerified || 0}\``,
    ].join('\n').slice(0, 4096))
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:statusRefresh', '🔄 Refresh Status', ButtonStyle.Primary),
        button('admin:verification:redeploy', '🔁 Repair/Redeploy Latest', ButtonStyle.Success),
        button('admin:verification:test', '🧪 Test Flow', ButtonStyle.Secondary),
        button('admin:verification:export', '📤 Export', ButtonStyle.Secondary)
      ),
      ...navRows('status', config),
    ],
  };
}

async function buildVerificationAdminPanel(guild, memberDisplayName = 'Unknown User', page = 'setup') {
  const safePage = PAGES.has(page) ? page : 'setup';
  if (safePage === 'panel') return buildPanelBuilderPage(guild, memberDisplayName);
  if (safePage === 'status') return buildStatusPage(guild, memberDisplayName);
  return buildSetupPage(guild, memberDisplayName);
}

function buildEmbedModal(guildId) {
  const current = template(guildId);
  return new ModalBuilder()
    .setCustomId('admin:verification:embedModal')
    .setTitle('Verification Embed')
    .addComponents(
      row(new TextInputBuilder().setCustomId('title').setLabel('Title').setStyle(TextInputStyle.Short).setMaxLength(100).setRequired(true).setValue(current.title || 'Server Verification')),
      row(new TextInputBuilder().setCustomId('description').setLabel('Description').setStyle(TextInputStyle.Paragraph).setMaxLength(1000).setRequired(true).setValue(current.description || 'Press the button below to verify.')),
      row(new TextInputBuilder().setCustomId('color').setLabel('Hex colour, e.g. #57f287').setStyle(TextInputStyle.Short).setMaxLength(7).setRequired(true).setValue(current.color || '#57f287')),
      row(new TextInputBuilder().setCustomId('footer').setLabel('Footer').setStyle(TextInputStyle.Short).setMaxLength(200).setRequired(false).setValue(current.footer || 'Goliath Verification')),
      row(new TextInputBuilder().setCustomId('imageUrl').setLabel('Image URL optional').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(false).setValue(current.imageUrl || ''))
    );
}

function buildButtonModal(guildId) {
  const current = template(guildId);
  return new ModalBuilder()
    .setCustomId('admin:verification:buttonModal')
    .setTitle('Verification Button')
    .addComponents(
      row(new TextInputBuilder().setCustomId('buttonLabel').setLabel('Button label').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(true).setValue(current.buttonLabel || 'Verify')),
      row(new TextInputBuilder().setCustomId('buttonEmoji').setLabel('Button emoji optional').setStyle(TextInputStyle.Short).setMaxLength(80).setRequired(false).setValue(current.buttonEmoji || '')),
      row(new TextInputBuilder().setCustomId('thumbnailUrl').setLabel('Thumbnail URL optional').setStyle(TextInputStyle.Short).setMaxLength(500).setRequired(false).setValue(current.thumbnailUrl || ''))
    );
}

async function safeUpdate(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(await payload);
    return true;
  }
  await interaction.update(await payload);
  return true;
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: 64 };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function deployLatestOrNew(interaction, redeploy = false) {
  const config = getConfig(interaction.guild.id);
  if (!config.verificationChannelId) throw new Error('Choose a verification channel first.');
  const channel = interaction.guild.channels.cache.get(config.verificationChannelId) || await interaction.guild.channels.fetch(config.verificationChannelId).catch(() => null);
  if (!channel?.send) throw new Error('Verification channel is not sendable.');
  const existing = redeploy ? latestPanel(interaction.guild.id) : null;
  return verificationManager.deployVerificationPanel(channel, {
    ...(template(interaction.guild.id) || {}),
    panelId: existing?.panelId,
    createdBy: interaction.user.id,
  }, { actorId: interaction.user.id });
}

function exportAttachment(guildId) {
  const data = {
    exportedAt: new Date().toISOString(),
    guildId,
    adminConfig: getConfig(guildId),
    moduleConfig: verificationStore.getVerificationSection(guildId),
  };
  return new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2), 'utf8'), { name: `goliath-verification-${guildId}.json` });
}

async function handleVerificationAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:verification')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:verification') return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'setup'));

    const pageMatch = customId.match(/^admin:verification:page:(setup|panel|status)$/);
    if (pageMatch) return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, pageMatch[1]));

    if (customId === 'admin:verification:editEmbed') {
      await interaction.showModal(buildEmbedModal(interaction.guild.id));
      return true;
    }

    if (customId === 'admin:verification:editButton') {
      await interaction.showModal(buildButtonModal(interaction.guild.id));
      return true;
    }

    if (interaction.isModalSubmit?.() && customId === 'admin:verification:embedModal') {
      verificationManager.updatePanelTemplate(interaction.guild.id, {
        title: interaction.fields.getTextInputValue('title'),
        description: interaction.fields.getTextInputValue('description'),
        color: interaction.fields.getTextInputValue('color'),
        footer: interaction.fields.getTextInputValue('footer'),
        imageUrl: interaction.fields.getTextInputValue('imageUrl'),
      }, { actorId: interaction.user.id });
      await interaction.reply({ content: '✅ Verification embed updated.', flags: 64 }).catch(() => null);
      return true;
    }

    if (interaction.isModalSubmit?.() && customId === 'admin:verification:buttonModal') {
      verificationManager.updatePanelTemplate(interaction.guild.id, {
        buttonLabel: interaction.fields.getTextInputValue('buttonLabel'),
        buttonEmoji: interaction.fields.getTextInputValue('buttonEmoji'),
        thumbnailUrl: interaction.fields.getTextInputValue('thumbnailUrl'),
      }, { actorId: interaction.user.id });
      await interaction.reply({ content: '✅ Verification button updated.', flags: 64 }).catch(() => null);
      return true;
    }

    if (interaction.isStringSelectMenu?.() && customId === 'admin:verification:buttonStyle') {
      verificationManager.updatePanelTemplate(interaction.guild.id, { buttonStyle: interaction.values?.[0] || 'success' }, { actorId: interaction.user.id });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'panel'));
    }

    if (interaction.isChannelSelectMenu?.()) {
      const value = interaction.values?.[0] || null;
      if (customId === 'admin:verification:channel') saveConfig(interaction.guild, { verificationChannelId: value });
      if (customId === 'admin:verification:logChannel') saveConfig(interaction.guild, { logChannelId: value });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'setup'));
    }

    if (interaction.isRoleSelectMenu?.()) {
      if (customId === 'admin:verification:verifiedRoles') saveConfig(interaction.guild, { verifiedRoleIds: cleanArray(interaction.values || []) });
      if (customId === 'admin:verification:pendingRoles') saveConfig(interaction.guild, { pendingRoleIds: cleanArray(interaction.values || []) });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'setup'));
    }

    if (customId === 'admin:verification:enable') saveConfig(interaction.guild, { enabled: true });
    if (customId === 'admin:verification:disable') saveConfig(interaction.guild, { enabled: false });
    if (customId === 'admin:verification:toggleDm') saveConfig(interaction.guild, (config) => ({ ...config, dmOnVerify: !config.dmOnVerify }));
    if (customId === 'admin:verification:togglePending') saveConfig(interaction.guild, (config) => ({ ...config, removePendingRole: !config.removePendingRole }));

    if (customId === 'admin:verification:resetTemplate') {
      verificationManager.updatePanelTemplate(interaction.guild.id, verificationStore.defaultPanelTemplate(), { actorId: interaction.user.id });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'panel'));
    }

    if (customId === 'admin:verification:resetAll') {
      await interaction.deferUpdate().catch(() => null);
      resetConfig(interaction.guild);
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'setup'));
    }

    if (customId === 'admin:verification:export') {
      const attachment = exportAttachment(interaction.guild.id);
      const payload = { content: '📤 Verification configuration export.', files: [attachment], flags: 64 };
      if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
      else await interaction.reply(payload).catch(() => null);
      return true;
    }

    if (customId === 'admin:verification:preview') {
      const preview = { panelId: 'preview', ...template(interaction.guild.id) };
      await replyEphemeral(interaction, '👁️ Verification preview:');
      await interaction.followUp({ embeds: [verificationManager.buildVerificationEmbed(preview)], components: verificationManager.buildVerificationRows(preview), flags: 64 }).catch(() => null);
      return true;
    }

    if (customId === 'admin:verification:deploy' || customId === 'admin:verification:redeploy') {
      await interaction.deferUpdate().catch(() => null);
      await deployLatestOrNew(interaction, customId === 'admin:verification:redeploy');
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'panel'));
    }

    if (customId === 'admin:verification:deleteLatest') {
      await interaction.deferUpdate().catch(() => null);
      const latest = latestPanel(interaction.guild.id);
      if (!latest) throw new Error('No verification panel exists yet.');
      await verificationManager.deleteVerificationPanel(interaction.guild, latest.panelId, { actorId: interaction.user.id });
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'panel'));
    }

    if (customId === 'admin:verification:statusRefresh') {
      return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'status'));
    }

    if (customId === 'admin:verification:test') {
      const report = await verificationManager.buildHealthReport(interaction.guild);
      await replyEphemeral(interaction, report.warnings.length ? `⚠️ Test found issues:\n${report.warnings.map((warning) => `• ${warning}`).join('\n')}` : '✅ Verification setup looks healthy.');
      return true;
    }

    return safeUpdate(interaction, buildVerificationAdminPanel(interaction.guild, memberDisplayName, 'setup'));
  } catch (error) {
    const payload = { content: `❌ Verification setup failed: ${error.message}`, flags: 64 };
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload).catch(() => null);
    else await interaction.reply(payload).catch(() => null);
    return true;
  }
}

module.exports = {
  buildVerificationAdminPanel,
  handleVerificationAdminInteraction,
};
