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
  PermissionFlagsBits,
} = require('discord.js');

const guildManager = require('../../core/guild/guildManager');
const verificationManager = require('./verificationManager');
const verificationStore = require('./verificationStore');

const NAV_PAGES = ['overview', 'workflow', 'roles', 'requirements', 'messages', 'panel'];
const PAGES = [...NAV_PAGES, 'settings', 'status'];
const PANEL_LIMIT = 25;

const WORKFLOW_TOGGLES = new Set([
  'waitForDiscordScreening',
  'skipScreeningIfUnavailable',
  'logScreeningCompletion',
  'usePendingRoles',
  'assignPendingRoles',
  'requirePendingRole',
  'removePendingRoles',
]);

const REQUIREMENT_TOGGLES = new Set([
  'blockBots',
  'allowStaffBypass',
  'allowReverification',
]);

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
}

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

function cleanArray(value) {
  return Array.isArray(value)
    ? [...new Set(value.filter(Boolean))]
    : [];
}

function getConfig(guildId) {
  const section = verificationManager.getVerificationStatus(guildId);
  return {
    enabled: guildManager.isModuleEnabled(guildId, 'verification'),
    ...section.settings,
  };
}

function saveConfig(guild, updater) {
  const current = verificationManager.getVerificationStatus(guild.id);
  const currentSettings = { ...(current.settings || {}) };
  const input = typeof updater === 'function'
    ? updater(currentSettings)
    : { ...(updater || {}) };
  const next = verificationStore.normalizeSettings({
    ...currentSettings,
    ...input,
  });

  verificationManager.configureVerification(
    guild.id,
    { settings: next },
    { action: 'verification_admin_config_sync' }
  );

  return getConfig(guild.id);
}

function resetConfig(guild) {
  verificationStore.saveVerificationSection(
    guild.id,
    verificationStore.defaultVerificationSection(),
    { action: 'verification_admin_reset' }
  );
}

function yesNo(value) {
  return value ? 'Yes ✅' : 'No ❌';
}

function formatChannel(id) {
  return id ? `<#${id}>` : '`Not set`';
}

function formatDate(value) {
  const time = value ? Math.floor(new Date(value).getTime() / 1000) : 0;
  return Number.isFinite(time) && time > 0
    ? `<t:${time}:f>`
    : '`Unknown`';
}

function formatRoles(guild, ids = []) {
  if (!Array.isArray(ids) || !ids.length) return 'None';

  return ids.map((id) => {
    const role = guild.roles.cache.get(id);
    return role ? `<@&${role.id}> (${role.name})` : `Unknown (${id})`;
  }).join(', ');
}

function latestPanel(guildId) {
  return verificationStore.getLatestPanel(guildId);
}

function panelTemplate(guildId) {
  const section = verificationStore.getVerificationSection(guildId);
  return section.panelTemplate || verificationStore.defaultPanelTemplate();
}

function getSavedPanelsFromSection(section) {
  return Object.values(section.panels || {}).sort((a, b) => (
    new Date(b.updatedAt || b.createdAt || 0)
    - new Date(a.updatedAt || a.createdAt || 0)
  ));
}

function navRow(page) {
  const index = Math.max(0, NAV_PAGES.indexOf(page));
  const backTarget = index > 0
    ? `admin:verification:page:${NAV_PAGES[index - 1]}`
    : 'admin:modules';

  const components = [
    button(backTarget, '⬅️ Back', ButtonStyle.Secondary),
    button('admin:verification:page:settings', '⚙️ Settings', ButtonStyle.Secondary),
  ];

  if (index < NAV_PAGES.length - 1) {
    components.push(
      button(
        `admin:verification:page:${NAV_PAGES[index + 1]}`,
        'Next ➡️',
        ButtonStyle.Secondary
      )
    );
  }

  return row(...components);
}

function baseEmbed(title, description, memberDisplayName, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setFooter({ text: `Requested by ${memberDisplayName}` })
    .setTimestamp();
}

function buildOverviewPage(guild, memberDisplayName) {
  const section = verificationManager.getVerificationStatus(guild.id);
  const config = {
    enabled: guildManager.isModuleEnabled(guild.id, 'verification'),
    ...section.settings,
  };
  const panels = Object.values(section.panels || {});

  const embed = baseEmbed(
    '✅ Verification · Overview',
    [
      'Flexible server verification with every stage optional.',
      '',
      `**Module:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Discord Screening:** ${verificationManager.hasDiscordScreening(guild) ? 'Detected ✅' : 'Not configured'}`,
      `**Wait for Screening:** ${yesNo(config.waitForDiscordScreening)}`,
      `**Method:** \`${config.method}\``,
      `**Verification Channel:** ${formatChannel(config.verificationChannelId)}`,
      `**Verified Roles:** ${formatRoles(guild, config.verifiedRoleIds)}`,
      `**Pending Roles Enabled:** ${yesNo(config.usePendingRoles)}`,
      `**Pending Roles:** ${formatRoles(guild, config.pendingRoleIds)}`,
      `**DM on Success:** ${yesNo(config.dmOnVerify)}`,
      '',
      `Panels: \`${panels.length}\` | Verified: \`${section.analytics?.verified || 0}\` | Failed: \`${section.analytics?.failed || 0}\``,
    ].join('\n'),
    memberDisplayName,
    config.enabled ? 0x57f287 : 0x5865f2
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:page:workflow', '🔀 Workflow'),
        button('admin:verification:page:roles', '🎭 Roles'),
        button('admin:verification:page:requirements', '🔒 Requirements'),
        button('admin:verification:page:messages', '💬 Messages'),
        button('admin:verification:page:panel', '🎨 Panel')
      ),
      navRow('overview'),
    ],
  };
}

function buildWorkflowPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const embed = baseEmbed(
    '🔀 Verification · Workflow',
    [
      `**Discord Screening Detected:** ${verificationManager.hasDiscordScreening(guild) ? 'Yes ✅' : 'No'}`,
      `**Wait for Screening:** ${yesNo(config.waitForDiscordScreening)}`,
      `**Skip if Unavailable:** ${yesNo(config.skipScreeningIfUnavailable)}`,
      `**Log Screening Completion:** ${yesNo(config.logScreeningCompletion)}`,
      '',
      `**Use Pending Roles:** ${yesNo(config.usePendingRoles)}`,
      `**Assign Pending Roles:** ${yesNo(config.assignPendingRoles)}`,
      `**Assignment Timing:** \`${config.pendingRoleTiming}\``,
      `**Require Pending Role:** ${yesNo(config.requirePendingRole)}`,
      `**Remove Pending Roles:** ${yesNo(config.removePendingRoles)}`,
      '',
      'Selecting a pending role does not automatically enable, assign, require or remove it.',
    ].join('\n'),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:toggle:waitForDiscordScreening', '📜 Wait Screening', ButtonStyle.Secondary),
        button('admin:verification:toggle:skipScreeningIfUnavailable', '⏭️ Skip Missing', ButtonStyle.Secondary),
        button('admin:verification:toggle:logScreeningCompletion', '📝 Log Screening', ButtonStyle.Secondary)
      ),
      row(
        button('admin:verification:toggle:usePendingRoles', '🎭 Use Pending', ButtonStyle.Secondary),
        button('admin:verification:toggle:assignPendingRoles', '➕ Auto Assign', ButtonStyle.Secondary),
        button('admin:verification:toggle:requirePendingRole', '🔒 Require Pending', ButtonStyle.Secondary),
        button('admin:verification:toggle:removePendingRoles', '🧹 Remove Pending', ButtonStyle.Secondary)
      ),
      row(
        new StringSelectMenuBuilder()
          .setCustomId('admin:verification:pendingTiming')
          .setPlaceholder('Pending-role assignment timing')
          .addOptions([
            {
              label: 'On Join',
              value: 'on_join',
              description: 'Assign immediately when the member joins',
            },
            {
              label: 'After Discord Screening',
              value: 'after_screening',
              description: 'Wait until member.pending becomes false',
            },
            {
              label: 'Manual Only',
              value: 'manual',
              description: 'Never assign automatically',
            },
          ])
      ),
      navRow('workflow'),
    ],
  };
}

function buildRolesPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const embed = baseEmbed(
    '🎭 Verification · Roles & Channels',
    [
      `**Verification Channel:** ${formatChannel(config.verificationChannelId)}`,
      `**Log Channel:** ${formatChannel(config.logChannelId)}`,
      `**Verified Roles:** ${formatRoles(guild, config.verifiedRoleIds)}`,
      `**Pending Roles:** ${formatRoles(guild, config.pendingRoleIds)}`,
      '',
      'All roles are selected from this server. Goliath must be above every role it needs to add or remove.',
    ].join('\n'),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId('admin:verification:channel')
          .setPlaceholder('Verification channel')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0)
          .setMaxValues(1)
      ),
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId('admin:verification:logChannel')
          .setPlaceholder('Optional log channel')
          .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setMinValues(0)
          .setMaxValues(1)
      ),
      row(
        new RoleSelectMenuBuilder()
          .setCustomId('admin:verification:verifiedRoles')
          .setPlaceholder('Verified role(s)')
          .setMinValues(0)
          .setMaxValues(10)
      ),
      row(
        new RoleSelectMenuBuilder()
          .setCustomId('admin:verification:pendingRoles')
          .setPlaceholder('Optional pending role(s)')
          .setMinValues(0)
          .setMaxValues(10)
      ),
      navRow('roles'),
    ],
  };
}

function buildRequirementsPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const embed = baseEmbed(
    '🔒 Verification · Requirements',
    [
      `**Block Bots:** ${yesNo(config.blockBots)}`,
      `**Allow Management Bypass:** ${yesNo(config.allowStaffBypass)}`,
      `**Allow Reverification:** ${yesNo(config.allowReverification)}`,
      `**Minimum Account Age:** \`${config.minimumAccountAgeDays}\` day(s)`,
      `**Minimum Server Time:** \`${config.minimumMembershipAgeMinutes}\` minute(s)`,
      `**Attempt Cooldown:** \`${config.attemptCooldownSeconds}\` second(s)`,
      `**Maximum Failed Attempts:** \`${config.maximumFailedAttempts || 'Unlimited'}\``,
      '',
      'A value of 0 disables that numeric requirement.',
    ].join('\n'),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:toggle:blockBots', '🤖 Block Bots', ButtonStyle.Secondary),
        button('admin:verification:toggle:allowStaffBypass', '🛡️ Management Bypass', ButtonStyle.Secondary),
        button('admin:verification:toggle:allowReverification', '🔁 Reverification', ButtonStyle.Secondary)
      ),
      row(
        button(
          'admin:verification:editRequirements',
          '✏️ Edit Numeric Requirements',
          ButtonStyle.Primary
        )
      ),
      navRow('requirements'),
    ],
  };
}

function buildMessagesPage(guild, memberDisplayName) {
  const section = verificationStore.getVerificationSection(guild.id);
  const config = {
    enabled: guildManager.isModuleEnabled(guild.id, 'verification'),
    ...section.settings,
  };
  const messages = section.messages;

  const embed = baseEmbed(
    '💬 Verification · Messages',
    [
      `**DM on Verification:** ${yesNo(config.dmOnVerify)}`,
      `**DM on Pending Role:** ${yesNo(config.dmOnPendingRole)}`,
      `**Log Success:** ${yesNo(config.logSuccess)}`,
      `**Log Failure:** ${yesNo(config.logFailure)}`,
      '',
      `**Success:** ${messages.success}`,
      `**Verified:** ${messages.alreadyVerified}`,
      `**Screening Required:** ${messages.screeningRequired}`,
      `**Pending Role Required:** ${messages.pendingRoleRequired}`,
      `**Success DM:** ${messages.dmSuccess}`,
      '',
      'Variables: All default Goliath helpers are supported.',
    ].join('\n').slice(0, 4096),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:toggle:dmOnVerify', '📩 Success DM', ButtonStyle.Secondary),
        button('admin:verification:toggle:dmOnPendingRole', '📨 Pending DM', ButtonStyle.Secondary),
        button('admin:verification:toggle:logSuccess', '✅ Success Logs', ButtonStyle.Secondary),
        button('admin:verification:toggle:logFailure', '❌ Failure Logs', ButtonStyle.Secondary)
      ),
      row(
        button('admin:verification:editMessagesCore', '✏️ Core Messages'),
        button('admin:verification:editMessagesRules', '✏️ Requirement Messages'),
        button('admin:verification:resetMessages', '♻️ Reset Messages', ButtonStyle.Danger)
      ),
      navRow('messages'),
    ],
  };
}

function buildPanelPage(guild, memberDisplayName, selectedPanelId = null) {
  const section = verificationStore.getVerificationSection(guild.id);
  const panels = getSavedPanelsFromSection(section);
  const selected = (
    selectedPanelId && section.panels?.[selectedPanelId]
  ) || (
    section.activePanelId && section.panels?.[section.activePanelId]
  ) || panels[0] || null;
  const current = section.panelTemplate || verificationStore.defaultPanelTemplate();
  const preview = { panelId: 'preview', ...current };
  const active = selected && section.activePanelId === selected.panelId;

  const details = selected
    ? [
      '',
      '**Selected Saved Panel**',
      `**Panel ID:** \`${selected.panelId}\``,
      `**Status:** ${active ? 'Active ✅' : 'Inactive'}`,
      `**Channel:** ${formatChannel(selected.channelId)}`,
      `**Message ID:** ${selected.messageId ? `\`${selected.messageId}\`` : '`Missing`'}`,
      `**Created:** ${formatDate(selected.createdAt)}`,
      `**Updated:** ${formatDate(selected.updatedAt)}`,
    ]
    : ['', '**Selected Saved Panel:** `None`'];

  const embed = baseEmbed(
    '🎨 Verification · Panel Builder',
    [
      `**Title:** ${current.title}`,
      `**Button:** ${current.buttonEmoji ? `${current.buttonEmoji} ` : ''}${current.buttonLabel} · \`${current.buttonStyle}\``,
      `**Colour:** \`${current.color}\``,
      `**Stored Panels:** \`${panels.length}\``,
      `**Active Panel:** ${section.activePanelId ? `\`${section.activePanelId}\`` : '`None`'}`,
      ...details,
    ].join('\n'),
    memberDisplayName,
    current.color || 0x57f287
  );

  const components = [
    row(
      button('admin:verification:editEmbed', '✏️ Edit Embed'),
      button('admin:verification:editButton', '🔘 Edit Button'),
      button('admin:verification:preview', '👁️ Preview', ButtonStyle.Secondary),
      button('admin:verification:deploy', '🚀 Deploy', ButtonStyle.Success),
      button('admin:verification:redeploy', '🔄 Redeploy Latest', ButtonStyle.Success)
    ),
  ];

  if (panels.length) {
    components.push(
      row(
        new StringSelectMenuBuilder()
          .setCustomId('admin:verification:savedPanel')
          .setPlaceholder('Select a saved verification panel')
          .addOptions(
            panels.slice(0, PANEL_LIMIT).map((panel) => ({
              label: `${panel.panelId}${section.activePanelId === panel.panelId ? ' · ACTIVE' : ''}`.slice(0, 100),
              value: panel.panelId,
              description: `${panel.channelId ? `#${guild.channels.cache.get(panel.channelId)?.name || panel.channelId}` : 'No channel'} · ${panel.messageId ? 'message saved' : 'no message'}`.slice(0, 100),
              default: selected?.panelId === panel.panelId,
            }))
          )
      )
    );

    if (selected) {
      components.push(
        row(
          button(`admin:verification:updateSelected:${selected.panelId}`, '🛡️ Update Selected', ButtonStyle.Primary),
          button(`admin:verification:redeploySelected:${selected.panelId}`, '🚀 Redeploy Selected', ButtonStyle.Success),
          button(`admin:verification:deleteSelected:${selected.panelId}`, '🗑️ Delete Selected', ButtonStyle.Danger),
          button('admin:verification:resetTemplate', '♻️ Reset Design', ButtonStyle.Danger)
        )
      );
    }
  }

  components.push(
    row(
      new StringSelectMenuBuilder()
        .setCustomId('admin:verification:buttonStyle')
        .setPlaceholder('Button style')
        .addOptions([
          { label: 'Success', value: 'success' },
          { label: 'Primary', value: 'primary' },
          { label: 'Secondary', value: 'secondary' },
          { label: 'Danger', value: 'danger' },
        ])
    )
  );
  components.push(navRow('panel'));

  return {
    embeds: [
      embed,
      verificationManager.buildVerificationEmbed(preview, guild),
    ],
    components,
  };
}

function buildSettingsPage(guild, memberDisplayName) {
  const config = getConfig(guild.id);
  const embed = baseEmbed(
    '⚙️ Verification · Settings',
    [
      `**Module:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      '',
      'Module controls and maintenance tools are grouped here.',
    ].join('\n'),
    memberDisplayName,
    config.enabled ? 0x57f287 : 0x5865f2
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:page:status', '🩺 Health', ButtonStyle.Secondary),
        button('admin:verification:export', '📤 Export', ButtonStyle.Secondary),
        button('admin:verification:resetAll', '♻️ Reset', ButtonStyle.Danger),
        button(
          config.enabled ? 'admin:verification:disable' : 'admin:verification:enable',
          config.enabled ? '⏸️ Disable' : '▶️ Enable',
          config.enabled ? ButtonStyle.Secondary : ButtonStyle.Success
        )
      ),
      row(
        button('admin:verification:page:overview', '⬅️ Back', ButtonStyle.Secondary),
        button('admin:modules', 'Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

async function buildStatusPage(guild, memberDisplayName) {
  const report = await verificationManager.buildHealthReport(guild);
  const embed = baseEmbed(
    '🩺 Verification · Health',
    [
      `**Overall:** ${report.warnings.length ? 'Needs attention ⚠️' : 'Healthy ✅'}`,
      `**Discord Screening:** ${report.screeningEnabled ? 'Detected ✅' : 'Not configured'}`,
      `**Verified Roles:** \`${report.verifiedRoleCount}\``,
      `**Pending Roles:** \`${report.pendingRoleCount}\``,
      `**Log Channel:** ${report.hasLogChannel ? 'Configured ✅' : 'Optional / not configured'}`,
      '',
      '**Warnings**',
      report.warnings.length
        ? report.warnings.map((warning) => `• ${warning}`).join('\n')
        : 'None ✅',
      '',
      '**Panels**',
      report.panels.length
        ? report.panels.map((panel) => `• \`${panel.panelId}\` — ${panel.status}`).join('\n')
        : '`No panel records.`',
    ].join('\n').slice(0, 4096),
    memberDisplayName,
    report.warnings.length ? 0xfaa61a : 0x57f287
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:verification:statusRefresh', '🔄 Refresh'),
        button('admin:verification:redeploy', '🔧 Repair Latest', ButtonStyle.Success),
        button('admin:verification:test', '🧪 Test Setup', ButtonStyle.Secondary)
      ),
      row(
        button(
          'admin:verification:page:settings',
          '⬅️ Back to Settings',
          ButtonStyle.Secondary
        )
      ),
    ],
  };
}

async function buildVerificationAdminPanel(
  guild,
  memberDisplayName = 'Unknown User',
  page = 'overview',
  selectedPanelId = null
) {
  const safePage = PAGES.includes(page) ? page : 'overview';

  switch (safePage) {
    case 'workflow':
      return buildWorkflowPage(guild, memberDisplayName);
    case 'roles':
      return buildRolesPage(guild, memberDisplayName);
    case 'requirements':
      return buildRequirementsPage(guild, memberDisplayName);
    case 'messages':
      return buildMessagesPage(guild, memberDisplayName);
    case 'panel':
      return buildPanelPage(guild, memberDisplayName, selectedPanelId);
    case 'settings':
      return buildSettingsPage(guild, memberDisplayName);
    case 'status':
      return buildStatusPage(guild, memberDisplayName);
    default:
      return buildOverviewPage(guild, memberDisplayName);
  }
}

function textInput(
  customId,
  label,
  value,
  style = TextInputStyle.Short,
  maxLength = 1000,
  required = true
) {
  return new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setMaxLength(maxLength)
    .setRequired(required)
    .setValue(String(value || '').slice(0, maxLength));
}

function buildEmbedModal(guildId) {
  const current = panelTemplate(guildId);
  return new ModalBuilder()
    .setCustomId('admin:verification:embedModal')
    .setTitle('Verification Embed')
    .addComponents(
      row(textInput('title', 'Title', current.title, TextInputStyle.Short, 100)),
      row(textInput('description', 'Description', current.description, TextInputStyle.Paragraph, 1000)),
      row(textInput('color', 'Hex colour', current.color, TextInputStyle.Short, 7)),
      row(textInput('footer', 'Footer', current.footer, TextInputStyle.Short, 200, false)),
      row(textInput('imageUrl', 'Image URL optional', current.imageUrl, TextInputStyle.Short, 500, false))
    );
}

function buildButtonModal(guildId) {
  const current = panelTemplate(guildId);
  return new ModalBuilder()
    .setCustomId('admin:verification:buttonModal')
    .setTitle('Verification Button')
    .addComponents(
      row(textInput('buttonLabel', 'Button label', current.buttonLabel, TextInputStyle.Short, 80)),
      row(textInput('buttonEmoji', 'Button emoji optional', current.buttonEmoji, TextInputStyle.Short, 80, false)),
      row(textInput('thumbnailUrl', 'Thumbnail URL optional', current.thumbnailUrl, TextInputStyle.Short, 500, false))
    );
}

function buildRequirementsModal(guildId) {
  const config = getConfig(guildId);
  return new ModalBuilder()
    .setCustomId('admin:verification:requirementsModal')
    .setTitle('Verification Requirements')
    .addComponents(
      row(textInput('minimumAccountAgeDays', 'Minimum account age in days', config.minimumAccountAgeDays, TextInputStyle.Short, 5)),
      row(textInput('minimumMembershipAgeMinutes', 'Minimum server time in minutes', config.minimumMembershipAgeMinutes, TextInputStyle.Short, 8)),
      row(textInput('attemptCooldownSeconds', 'Attempt cooldown in seconds', config.attemptCooldownSeconds, TextInputStyle.Short, 6)),
      row(textInput('maximumFailedAttempts', 'Maximum failures, 0 = unlimited', config.maximumFailedAttempts, TextInputStyle.Short, 4))
    );
}

function buildCoreMessagesModal(guildId) {
  const messages = verificationStore.getVerificationSection(guildId).messages;
  return new ModalBuilder()
    .setCustomId('admin:verification:messagesCoreModal')
    .setTitle('Core Verification Messages')
    .addComponents(
      row(textInput('success', 'Success message', messages.success, TextInputStyle.Paragraph, 1000)),
      row(textInput('alreadyVerified', 'Already verified', messages.alreadyVerified, TextInputStyle.Paragraph, 1000)),
      row(textInput('unavailable', 'Unavailable message', messages.unavailable, TextInputStyle.Paragraph, 1000)),
      row(textInput('failed', 'Generic failure message', messages.failed, TextInputStyle.Paragraph, 1000)),
      row(textInput('dmSuccess', 'Success DM', messages.dmSuccess, TextInputStyle.Paragraph, 1000))
    );
}

function buildRuleMessagesModal(guildId) {
  const messages = verificationStore.getVerificationSection(guildId).messages;
  return new ModalBuilder()
    .setCustomId('admin:verification:messagesRulesModal')
    .setTitle('Requirement Messages')
    .addComponents(
      row(textInput('screeningRequired', 'Screening required', messages.screeningRequired, TextInputStyle.Paragraph, 1000)),
      row(textInput('pendingRoleRequired', 'Pending role required', messages.pendingRoleRequired, TextInputStyle.Paragraph, 1000)),
      row(textInput('accountTooNew', 'Account too new', messages.accountTooNew, TextInputStyle.Paragraph, 1000)),
      row(textInput('membershipTooNew', 'Membership too new', messages.membershipTooNew, TextInputStyle.Paragraph, 1000)),
      row(textInput('cooldown', 'Cooldown message', messages.cooldown, TextInputStyle.Paragraph, 1000))
    );
}

async function safeUpdate(interaction, payload) {
  const resolved = await payload;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(resolved);
  } else {
    await interaction.update(resolved);
  }
  return true;
}

async function replyEphemeral(interaction, content) {
  const payload = { content, flags: 64 };
  if (interaction.deferred || interaction.replied) {
    return interaction.followUp(payload).catch(() => null);
  }
  return interaction.reply(payload).catch(() => null);
}

function canAdministerPanels(interaction) {
  return Boolean(
    interaction.guild?.ownerId === interaction.user?.id
    || interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)
  );
}

async function fetchPanelMessage(guild, panel) {
  if (!panel?.channelId || !panel?.messageId) return null;

  const channel = guild.channels.cache.get(panel.channelId)
    || await guild.channels.fetch(panel.channelId).catch(() => null);

  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(panel.messageId).catch(() => null);
}

async function deleteSelectedPanel(interaction, panelId) {
  if (!canAdministerPanels(interaction)) {
    throw new Error('Only the server owner or administrators can delete saved verification panels.');
  }

  const guild = interaction.guild;
  const section = verificationStore.getVerificationSection(guild.id);
  const panel = section.panels?.[panelId];
  if (!panel) {
    throw new Error('The selected verification panel no longer exists.');
  }

  const message = await fetchPanelMessage(guild, panel);
  let messageWarning = null;

  if (message?.deletable) {
    await message.delete().catch((error) => {
      messageWarning = error.message;
    });
  } else if (message) {
    messageWarning = 'Discord would not allow Goliath to delete the panel message.';
  }

  const deletingActive = section.activePanelId === panelId;
  verificationStore.updateVerificationSection(
    guild.id,
    (current) => {
      const panels = { ...(current.panels || {}) };
      delete panels[panelId];

      if (deletingActive) {
        const retiredAt = new Date().toISOString();
        for (const [id, existing] of Object.entries(panels)) {
          panels[id] = {
            ...existing,
            enabled: false,
            retiredAt: existing.retiredAt || retiredAt,
          };
        }
      }

      return {
        ...current,
        activePanelId: deletingActive ? null : current.activePanelId,
        panels,
        updatedAt: new Date().toISOString(),
      };
    },
    {
      action: 'verification_admin_delete_selected_panel',
      actorId: interaction.user.id,
      skipConfigRevision: true,
    }
  );

  return messageWarning;
}

async function deployPanel(interaction, panelId = null, useTemplate = false) {
  const guild = interaction.guild;
  const config = getConfig(guild.id);
  const stored = panelId
    ? verificationStore.getPanel(guild.id, panelId)
    : null;
  const channelId = stored?.channelId || config.verificationChannelId;

  if (!channelId) {
    throw new Error('Choose a verification channel first.');
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) {
    throw new Error('Verification channel is not sendable.');
  }

  return verificationManager.deployVerificationPanel(
    channel,
    {
      ...(stored || {}),
      ...(useTemplate ? panelTemplate(guild.id) : {}),
      panelId: stored?.panelId,
      createdBy: interaction.user.id,
    },
    {
      actorId: interaction.user.id,
      action: panelId
        ? 'verification_admin_redeploy_selected'
        : 'verification_admin_deploy',
    }
  );
}

function exportAttachment(guildId) {
  const data = {
    exportedAt: new Date().toISOString(),
    guildId,
    config: getConfig(guildId),
    module: verificationStore.getVerificationSection(guildId),
  };

  return new AttachmentBuilder(
    Buffer.from(JSON.stringify(data, null, 2), 'utf8'),
    { name: `goliath-verification-${guildId}.json` }
  );
}

function getTogglePage(key) {
  if (WORKFLOW_TOGGLES.has(key)) return 'workflow';
  if (REQUIREMENT_TOGGLES.has(key)) return 'requirements';
  return 'messages';
}

async function handleModalInteraction(interaction, customId) {
  if (!interaction.isModalSubmit?.()) return false;

  if (customId === 'admin:verification:embedModal') {
    verificationManager.updatePanelTemplate(interaction.guild.id, {
      title: interaction.fields.getTextInputValue('title'),
      description: interaction.fields.getTextInputValue('description'),
      color: interaction.fields.getTextInputValue('color'),
      footer: interaction.fields.getTextInputValue('footer'),
      imageUrl: interaction.fields.getTextInputValue('imageUrl'),
    }, { actorId: interaction.user.id });
    await interaction.reply({ content: '✅ Verification embed updated.', flags: 64 });
    return true;
  }

  if (customId === 'admin:verification:buttonModal') {
    verificationManager.updatePanelTemplate(interaction.guild.id, {
      buttonLabel: interaction.fields.getTextInputValue('buttonLabel'),
      buttonEmoji: interaction.fields.getTextInputValue('buttonEmoji'),
      thumbnailUrl: interaction.fields.getTextInputValue('thumbnailUrl'),
    }, { actorId: interaction.user.id });
    await interaction.reply({ content: '✅ Verification button updated.', flags: 64 });
    return true;
  }

  if (customId === 'admin:verification:requirementsModal') {
    saveConfig(interaction.guild, {
      minimumAccountAgeDays: interaction.fields.getTextInputValue('minimumAccountAgeDays'),
      minimumMembershipAgeMinutes: interaction.fields.getTextInputValue('minimumMembershipAgeMinutes'),
      attemptCooldownSeconds: interaction.fields.getTextInputValue('attemptCooldownSeconds'),
      maximumFailedAttempts: interaction.fields.getTextInputValue('maximumFailedAttempts'),
    });
    await interaction.reply({ content: '✅ Verification requirements updated.', flags: 64 });
    return true;
  }

  if (customId === 'admin:verification:messagesCoreModal') {
    verificationManager.updateVerificationMessages(interaction.guild.id, {
      success: interaction.fields.getTextInputValue('success'),
      alreadyVerified: interaction.fields.getTextInputValue('alreadyVerified'),
      unavailable: interaction.fields.getTextInputValue('unavailable'),
      failed: interaction.fields.getTextInputValue('failed'),
      dmSuccess: interaction.fields.getTextInputValue('dmSuccess'),
    }, { actorId: interaction.user.id });
    await interaction.reply({ content: '✅ Core verification messages updated.', flags: 64 });
    return true;
  }

  if (customId === 'admin:verification:messagesRulesModal') {
    verificationManager.updateVerificationMessages(interaction.guild.id, {
      screeningRequired: interaction.fields.getTextInputValue('screeningRequired'),
      pendingRoleRequired: interaction.fields.getTextInputValue('pendingRoleRequired'),
      accountTooNew: interaction.fields.getTextInputValue('accountTooNew'),
      membershipTooNew: interaction.fields.getTextInputValue('membershipTooNew'),
      cooldown: interaction.fields.getTextInputValue('cooldown'),
    }, { actorId: interaction.user.id });
    await interaction.reply({ content: '✅ Requirement messages updated.', flags: 64 });
    return true;
  }

  return false;
}

async function handleSelectInteraction(interaction, customId, displayName) {
  if (interaction.isStringSelectMenu?.()) {
    if (customId === 'admin:verification:savedPanel') {
      const panelId = interaction.values?.[0] || null;
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'panel', panelId)
      );
    }

    if (customId === 'admin:verification:pendingTiming') {
      saveConfig(interaction.guild, {
        pendingRoleTiming: interaction.values?.[0] || 'after_screening',
      });
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'workflow')
      );
    }

    if (customId === 'admin:verification:buttonStyle') {
      verificationManager.updatePanelTemplate(
        interaction.guild.id,
        { buttonStyle: interaction.values?.[0] || 'success' },
        { actorId: interaction.user.id }
      );
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'panel')
      );
    }
  }

  if (interaction.isChannelSelectMenu?.()) {
    const value = interaction.values?.[0] || null;
    if (customId === 'admin:verification:channel') {
      saveConfig(interaction.guild, { verificationChannelId: value });
    }
    if (customId === 'admin:verification:logChannel') {
      saveConfig(interaction.guild, { logChannelId: value });
    }
    return safeUpdate(
      interaction,
      buildVerificationAdminPanel(interaction.guild, displayName, 'roles')
    );
  }

  if (interaction.isRoleSelectMenu?.()) {
    if (customId === 'admin:verification:verifiedRoles') {
      saveConfig(interaction.guild, {
        verifiedRoleIds: cleanArray(interaction.values),
      });
    }
    if (customId === 'admin:verification:pendingRoles') {
      saveConfig(interaction.guild, {
        pendingRoleIds: cleanArray(interaction.values),
      });
    }
    return safeUpdate(
      interaction,
      buildVerificationAdminPanel(interaction.guild, displayName, 'roles')
    );
  }

  return false;
}

async function handleSelectedPanelAction(interaction, customId, displayName) {
  const match = customId.match(
    /^admin:verification:(updateSelected|redeploySelected|deleteSelected):(.+)$/
  );
  if (!match) return false;

  const [, action, panelId] = match;
  await interaction.deferUpdate();

  if (action === 'deleteSelected') {
    const warning = await deleteSelectedPanel(interaction, panelId);
    if (warning) {
      await interaction.followUp({
        content: `⚠️ Panel record removed from the guild JSON, but the Discord message could not be removed: ${warning}`,
        flags: 64,
      }).catch(() => null);
    }
    return safeUpdate(
      interaction,
      buildVerificationAdminPanel(interaction.guild, displayName, 'panel')
    );
  }

  if (action === 'updateSelected') {
    await deployPanel(interaction, panelId, true);
  }
  if (action === 'redeploySelected') {
    await deployPanel(interaction, panelId, false);
  }

  return safeUpdate(
    interaction,
    buildVerificationAdminPanel(interaction.guild, displayName, 'panel', panelId)
  );
}

async function handleVerificationAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if (!customId.startsWith('admin:verification')) return false;

  const displayName = getMemberDisplayName(interaction);

  try {
    if (customId === 'admin:verification') {
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName)
      );
    }

    const pageMatch = customId.match(/^admin:verification:page:([a-z_]+)$/);
    if (pageMatch && PAGES.includes(pageMatch[1])) {
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, pageMatch[1])
      );
    }

    if (customId === 'admin:verification:editEmbed') {
      await interaction.showModal(buildEmbedModal(interaction.guild.id));
      return true;
    }
    if (customId === 'admin:verification:editButton') {
      await interaction.showModal(buildButtonModal(interaction.guild.id));
      return true;
    }
    if (customId === 'admin:verification:editRequirements') {
      await interaction.showModal(buildRequirementsModal(interaction.guild.id));
      return true;
    }
    if (customId === 'admin:verification:editMessagesCore') {
      await interaction.showModal(buildCoreMessagesModal(interaction.guild.id));
      return true;
    }
    if (customId === 'admin:verification:editMessagesRules') {
      await interaction.showModal(buildRuleMessagesModal(interaction.guild.id));
      return true;
    }

    if (await handleModalInteraction(interaction, customId)) return true;

    const selectHandled = await handleSelectInteraction(
      interaction,
      customId,
      displayName
    );
    if (selectHandled) return true;

    const selectedPanelHandled = await handleSelectedPanelAction(
      interaction,
      customId,
      displayName
    );
    if (selectedPanelHandled) return true;

    const toggleMatch = customId.match(
      /^admin:verification:toggle:([a-zA-Z0-9_]+)$/
    );
    if (toggleMatch) {
      const key = toggleMatch[1];
      if (key === 'allowStaffBypass' && !canAdministerPanels(interaction)) {
        return interaction.reply({
          content: 'Only the server owner or administrators can change Management Bypass.',
          flags: 64,
        });
      }

      saveConfig(interaction.guild, (config) => ({
        ...config,
        [key]: !Boolean(config[key]),
      }));

      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(
          interaction.guild,
          displayName,
          getTogglePage(key)
        )
      );
    }

    if (
      customId === 'admin:verification:enable'
      || customId === 'admin:verification:disable'
    ) {
      guildManager.setModuleEnabled(
        interaction.guild.id,
        'verification',
        customId.endsWith(':enable'),
        {
          actorId: interaction.user.id,
          action: 'verification_admin_toggle',
        }
      );
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'settings')
      );
    }

    if (customId === 'admin:verification:resetMessages') {
      verificationManager.updateVerificationMessages(
        interaction.guild.id,
        verificationStore.defaultMessages(),
        { actorId: interaction.user.id }
      );
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'messages')
      );
    }

    if (customId === 'admin:verification:resetTemplate') {
      verificationManager.updatePanelTemplate(
        interaction.guild.id,
        verificationStore.defaultPanelTemplate(),
        { actorId: interaction.user.id }
      );
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'panel')
      );
    }

    if (customId === 'admin:verification:resetAll') {
      await interaction.deferUpdate();
      resetConfig(interaction.guild);
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'settings')
      );
    }

    if (customId === 'admin:verification:export') {
      await interaction.reply({
        content: '📤 Verification configuration export.',
        files: [exportAttachment(interaction.guild.id)],
        flags: 64,
      });
      return true;
    }

    if (customId === 'admin:verification:preview') {
      const preview = {
        panelId: 'preview',
        ...panelTemplate(interaction.guild.id),
      };
      await interaction.reply({
        embeds: [
          verificationManager.buildVerificationEmbed(preview, interaction.guild),
        ],
        components: verificationManager.buildVerificationRows(
          preview,
          interaction.guild
        ),
        flags: 64,
      });
      return true;
    }

    if (customId === 'admin:verification:deploy') {
      await interaction.deferUpdate();
      await deployPanel(interaction, null, true);
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'panel')
      );
    }

    if (customId === 'admin:verification:redeploy') {
      await interaction.deferUpdate();
      const latest = latestPanel(interaction.guild.id);
      if (!latest) {
        throw new Error('No saved verification panel exists yet.');
      }
      await deployPanel(interaction, latest.panelId, false);
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(
          interaction.guild,
          displayName,
          'panel',
          latest.panelId
        )
      );
    }

    if (customId === 'admin:verification:statusRefresh') {
      return safeUpdate(
        interaction,
        buildVerificationAdminPanel(interaction.guild, displayName, 'status')
      );
    }

    if (customId === 'admin:verification:test') {
      const report = await verificationManager.buildHealthReport(interaction.guild);
      await replyEphemeral(
        interaction,
        report.warnings.length
          ? `⚠️ Setup issues:\n${report.warnings.map((warning) => `• ${warning}`).join('\n')}`
          : '✅ Verification setup looks healthy.'
      );
      return true;
    }

    return false;
  } catch (error) {
    const payload = {
      content: `❌ Verification setup failed: ${error.message}`,
      flags: 64,
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }
    return true;
  }
}

module.exports = {
  buildVerificationAdminPanel,
  handleVerificationAdminInteraction,
};
