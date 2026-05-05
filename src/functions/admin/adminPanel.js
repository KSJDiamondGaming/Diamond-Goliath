// functions/admin/adminPanel.js

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits,
} = require('discord.js');

const guildManager = require('../../guild/guildManager');
const { restoreServerBackup } = require('../../security/serverRestore');

const {
  createServerBackup,
  listServerBackups,
  readServerBackup,
} = require('../../security/serverBackup');

const PANEL_COLOR = '#5865F2';

const ADMIN_HISTORY = new Map();
const ADMIN_ROUTE = new Map();
const RESTORE_PENDING = new Map();

const LOG_TYPES = {
  automodlog: {
    key: 'automod',
    customId: 'admin:setautomodlog',
    selectId: 'admin:selectautomodlog',
    title: '🤖 Set AutoMod Log Channel',
    label: '🤖 AutoMod Log',
  },
  adminlog: {
    key: 'admin',
    customId: 'admin:setadminlog',
    selectId: 'admin:selectadminlog',
    title: '👑 Set Admin Log Channel',
    label: '👑 Admin Log',
  },
  modlog: {
    key: 'moderation',
    customId: 'admin:setmodlog',
    selectId: 'admin:selectmodlog',
    title: '📌 Set Mod Log Channel',
    label: '📌 Mod Log',
  },
  logs: {
    key: 'general',
    customId: 'admin:setlogs',
    selectId: 'admin:selectlogs',
    title: '📋 Set General Logs Channel',
    label: '📋 General Logs',
  },
};

const LOG_SELECT_TO_TYPE = Object.fromEntries(
  Object.entries(LOG_TYPES).map(([type, data]) => [data.selectId, type])
);

const LOG_BUTTON_TO_TYPE = Object.fromEntries(
  Object.entries(LOG_TYPES).map(([type, data]) => [data.customId, type])
);

const MODULES = [
  ['admin:embed', '🎨 Embed', '🎨 Embed Studio', 'Create and send custom embeds'],
  ['admin:autoRoles', '🎭 Join Roles', '🎭 Join Roles', 'Auto roles when members join'],
  ['admin:stats', '📊 Stats', '📊 Stats', 'Server stats counters'],
  ['admin:sticky', '📌 Sticky Notes', '📌 Sticky Notes', 'Persistent channel notes'],
  ['admin:suggestions', '💡 Suggestions', '💡 Suggestions', 'Suggestion system'],
  ['admin:tickets', '🎟️ Tickets', '🎟️ Tickets', 'Support ticket system'],
  ['admin:giveaways', '🎉 Giveaways', '🎉 Giveaways', 'Giveaway tools'],
  ['admin:fun', '🎮 Fun', '🎮 Fun', 'Fun commands and extras'],
  ['admin:polls', '📊 Polls', '📊 Polls', 'Poll system'],
];

const COMING_SOON = {
  'admin:stats': ['📊 Stats', 'Server stats counters are coming soon.'],
  'admin:sticky': ['📌 Sticky Notes', 'Sticky notes module is coming soon.'],
  'admin:suggestions': ['💡 Suggestions', 'Suggestion system is coming soon.'],
  'admin:tickets': ['🎟️ Tickets', 'Ticket system is coming soon.'],
  'admin:giveaways': ['🎉 Giveaways', 'Giveaway tools are coming soon.'],
  'admin:fun': ['🎮 Fun', 'Fun commands and extras are coming soon.'],
  'admin:polls': ['📊 Polls', 'Poll system is coming soon.'],
};

function getBotOwnerIds() {
  const ids = [];

  if (process.env.BOT_OWNER_ID) ids.push(process.env.BOT_OWNER_ID.trim());

  if (process.env.BOT_OWNER_IDS) {
    ids.push(
      ...process.env.BOT_OWNER_IDS
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
    );
  }

  return [...new Set(ids.filter(Boolean))];
}

function isBotOwner(interaction) {
  return getBotOwnerIds().includes(interaction.user.id);
}

function isGuildOwner(interaction) {
  return interaction.guild?.ownerId === interaction.user.id;
}

function canCreateBackup(interaction) {
  return isBotOwner(interaction) || isGuildOwner(interaction);
}

function getNavKey(interaction) {
  return `${interaction.guild.id}:${interaction.user.id}`;
}

function getRestoreKey(interaction) {
  return `${interaction.guild.id}:${interaction.user.id}`;
}

function getCurrentRoute(interaction) {
  return ADMIN_ROUTE.get(getNavKey(interaction)) || 'admin:home';
}

function setCurrentRoute(interaction, route) {
  ADMIN_ROUTE.set(getNavKey(interaction), route);
}

function pushHistory(interaction, route) {
  const key = getNavKey(interaction);
  const history = ADMIN_HISTORY.get(key) || [];

  history.push(route);
  if (history.length > 10) history.shift();

  ADMIN_HISTORY.set(key, history);
}

function popHistory(interaction) {
  const key = getNavKey(interaction);
  const history = ADMIN_HISTORY.get(key) || [];
  const currentRoute = getCurrentRoute(interaction);

  let previousRoute = history.pop();

  while (previousRoute && previousRoute === currentRoute) {
    previousRoute = history.pop();
  }

  ADMIN_HISTORY.set(key, history);
  return previousRoute || 'admin:home';
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function getGuildSection(guildId, section, defaults) {
  return guildManager.getGuildSection(guildId, section, defaults);
}

function replaceGuildSection(guildId, section, data) {
  return guildManager.replaceGuildSection(guildId, section, data);
}

function getLogChannelId(guildId, type) {
  if (typeof guildManager.getLogChannelId === 'function') {
    return guildManager.getLogChannelId(guildId, type);
  }

  const logs = getGuildSection(guildId, 'logs', { channels: {} });
  return logs?.channels?.[type] || null;
}

function setLogChannelId(guildId, type = 'general', channelId = null) {
  if (typeof guildManager.setLogChannelId === 'function') {
    return guildManager.setLogChannelId(guildId, type, channelId);
  }

  const logs = getGuildSection(guildId, 'logs', {
    enabled: true,
    channels: {},
    events: {},
  });

  return replaceGuildSection(guildId, 'logs', {
    ...logs,
    channels: {
      ...(logs.channels || {}),
      [type]: channelId,
    },
  });
}

function getRoleConfig(guildId, section) {
  return getGuildSection(guildId, section, { roleIds: [] });
}

function getAutoRolesConfig(guildId) {
  return getGuildSection(guildId, 'autoRoles', {
    enabled: false,
    roleIds: [],
  });
}

function formatChannelStatus(channelId) {
  return channelId ? `<#${channelId}>` : 'Not set';
}

function formatRoleList(roleIds = []) {
  const cleanIds = [...new Set((roleIds || []).filter(Boolean))];

  return cleanIds.length
    ? cleanIds.map((id) => `<@&${id}>`).join(', ')
    : 'None';
}

function formatLogsSummary(guildId) {
  const total = ['automod', 'admin', 'moderation', 'general']
    .map((key) => getLogChannelId(guildId, key))
    .filter(Boolean).length;

  return `${total}/4 configured`;
}

function normalizeBackupId(backup) {
  return typeof backup === 'string' ? backup : backup?.backupId;
}

function createEmbed(title, description, memberDisplayName) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(title)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (memberDisplayName) {
    embed.setFooter({ text: `Requested by ${memberDisplayName}` });
  }

  return embed;
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
}

function backButton() {
  return button('admin:back', '⬅️ Back', ButtonStyle.Secondary);
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components);
}

function chunkArray(array, size) {
  const chunks = [];

  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }

  return chunks;
}

function buttonRows(items, buttonsPerRow = 3) {
  return chunkArray(items, buttonsPerRow).map((group) =>
    row(...group.map(([customId, label, style]) => button(customId, label, style)))
  );
}

function safeValues(interaction) {
  return Array.isArray(interaction.values)
    ? [...new Set(interaction.values.filter(Boolean))]
    : [];
}

function buildAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const guildId = guild.id;

  const embed = createEmbed(
    '🛠️ Admin Hub',
    'Control your server systems from one place.',
    memberDisplayName
  ).addFields(
    { name: '🤖 AutoMod', value: 'Filters & protection', inline: true },
    { name: '🔏 Admin', value: 'Admin tools & systems', inline: true },
    { name: '🔐 Mod Panel', value: 'Moderation tools', inline: true },
    { name: '🧩 Modules', value: 'Embeds, tickets, fun, etc.', inline: true },
    { name: '📋 Logs', value: formatLogsSummary(guildId), inline: true },
    { name: '🧱 Backups', value: 'Disaster recovery', inline: true },
    { name: '🧹 Purge', value: 'Bulk delete messages', inline: true }
  );

  return {
    embeds: [embed],
    components: buttonRows([
      ['admin:automod', '⚙️ AutoMod', ButtonStyle.Primary],
      ['admin:adminpanel', '🔏 Admin', ButtonStyle.Primary],
      ['admin:modpanel', '🔐 Mod Panel', ButtonStyle.Primary],
      ['admin:modules', '🧩 Modules', ButtonStyle.Primary],
      ['admin:logs', '📋 Logs', ButtonStyle.Primary],
      ['admin:backups', '🧱 Backups', ButtonStyle.Secondary],
      ['admin:purge', '🧹 Purge', ButtonStyle.Danger],
    ]),
  };
}

function buildAdminToolsPanel(guild, memberDisplayName = 'Unknown User') {
  const guildId = guild.id;
  const adminLogChannelId = getLogChannelId(guildId, 'admin');
  const staffConfig = getRoleConfig(guildId, 'staffRoles');
  const modConfig = getRoleConfig(guildId, 'modRoles');

  const embed = createEmbed(
    '👑 Admin Panel',
    [
      'Manage admin-only systems, staff controls, and server configuration.',
      '',
      '**👥 Staff Roles**',
      formatRoleList(staffConfig.roleIds),
      '',
      '**🔐 Mod Roles**',
      formatRoleList(modConfig.roleIds),
    ].join('\n'),
    memberDisplayName
  ).addFields(
    {
      name: '🔏 Admin Log',
      value: adminLogChannelId
        ? `<#${adminLogChannelId}>\nAdmin actions will log here. ✅`
        : 'Not set\nSet an Admin Log channel to enable admin logging. ❌',
      inline: true,
    },
    {
      name: '👥 Staff Roles',
      value: `${staffConfig.roleIds?.length || 0} selected`,
      inline: true,
    },
    {
      name: '🔐 Mod Roles',
      value: `${modConfig.roleIds?.length || 0} selected`,
      inline: true,
    }
  );

  return {
    embeds: [embed],
    components: [
      ...buttonRows([
        ['admin:setadminlog', '🔏 Set Admin Log', ButtonStyle.Primary],
        ['admin:staffroles', '👥 Staff Roles', ButtonStyle.Primary],
        ['admin:modroles', '🔐 Mod Roles', ButtonStyle.Primary],
        ['admin:adminsettings', '⚙️ Settings', ButtonStyle.Primary],
      ]),
      row(backButton()),
    ],
  };
}

function buildBackupsPanel(guild, memberDisplayName = 'Unknown User') {
  const backupConfig = guildManager.getGuildSection(guild.id, 'serverBackups', {});
  const backups = listServerBackups(guild.id);
  const latest = normalizeBackupId(backups[0]) || null;

  const embed = createEmbed(
    '🧱 Server Backups',
    [
      'Disaster recovery for server wipes, deleted channels, and accidental nukes.',
      '',
      `**Status:** ${backupConfig.enabled !== false ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Storage:** ${backupConfig.storage?.provider || 'google_drive_desktop'}`,
      `**Path:** \`${backupConfig.storage?.path || process.env.SERVER_BACKUP_DIR || 'Not set'}\``,
      '',
      `**Last Backup:** ${backupConfig.lastBackupAt || 'None'}`,
      `**Latest Backup ID:** \`${backupConfig.lastBackupId || latest || 'None'}\``,
      `**Backups Found:** \`${backups.length}\``,
      `**Retention:** Keep latest \`${backupConfig.retention?.maxBackups || process.env.SERVER_BACKUP_RETENTION || 4}\``,
      '',
      'Create backups: Bot owner or server owner.',
      'Download backups: Bot owner or server owner.',
      'Restore: Bot owner only.',
    ].join('\n'),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      ...buttonRows(
        [
          ['admin:backup:create', '⚡ Create Backup', ButtonStyle.Success],
          ['admin:backup:list', '📦 View Backups', ButtonStyle.Primary],
          ['admin:backup:preview', '🔍 Preview Latest', ButtonStyle.Secondary],
          ['admin:backup:download', '💾 Download Backup', ButtonStyle.Secondary],
          ['admin:backup:restore', '♻️ Restore', ButtonStyle.Danger],
        ],
        2
      ),
      row(backButton()),
    ],
  };
}

function buildRestoreSelectPanel(guild, memberDisplayName = 'Unknown User') {
  const backups = listServerBackups(guild.id)
    .map(normalizeBackupId)
    .filter(Boolean)
    .slice(0, 25);

  const embed = createEmbed(
    '♻️ Restore Backup',
    [
      'Select a backup to preview before restore.',
      '',
      '⚠️ **Restore is protected.**',
      'Only the bot owner can restore backups.',
      '',
      `**Backups Found:** \`${backups.length}\``,
    ].join('\n'),
    memberDisplayName
  );

  if (!backups.length) {
    return {
      embeds: [embed.setDescription('No backups found to restore.')],
      components: [row(backButton())],
    };
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId('admin:backup:restore:select')
    .setPlaceholder('Choose a backup to preview')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      backups.map((backupId, index) => ({
        label: index === 0 ? `Latest: ${backupId}`.slice(0, 100) : backupId.slice(0, 100),
        value: backupId,
        description: index === 0 ? 'Most recent backup' : 'Server backup',
      }))
    );

  return {
    embeds: [embed],
    components: [row(select), row(backButton())],
  };
}

function buildRestoreConfirmPanel(guild, backupId, memberDisplayName = 'Unknown User') {
  const backup = readServerBackup(guild.id, backupId);

  if (!backup) {
    return {
      embeds: [
        createEmbed(
          '❌ Backup Not Found',
          [`Could not read backup: \`${backupId}\``, '', 'Go back and choose another backup.'].join('\n'),
          memberDisplayName
        ),
      ],
      components: [row(backButton())],
    };
  }

  const embed = createEmbed(
    '⚠️ Confirm Restore — Safety Preview',
    [
      'This is the restore safety preview.',
      '',
      `**Backup ID:** \`${backup.backupId || backupId}\``,
      `**Created:** \`${backup.createdAt || 'Unknown'}\``,
      `**Created By:** \`${backup.createdBy || 'Unknown'}\``,
      `**Guild:** \`${backup.guild?.name || backup.sourceGuild?.name || guild.name}\``,
      `**Guild ID:** \`${backup.guild?.id || backup.sourceGuild?.id || guild.id}\``,
      '',
      `**Roles:** \`${backup.roles?.length || 0}\``,
      `**Channels:** \`${backup.channels?.length || 0}\``,
      `**Categories:** \`${backup.categories?.length || 0}\``,
      `**Logs Included:** \`${backup.logs ? 'Yes' : 'No'}\``,
      '',
      'Click confirm to run a dry run first.',
    ].join('\n'),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      row(
        button('admin:backup:restore:confirm', '✅ Dry Run Restore', ButtonStyle.Danger),
        button('admin:backup:restore:cancel', '❌ Cancel', ButtonStyle.Secondary)
      ),
      row(backButton()),
    ],
  };
}

function buildRolePanel({
  guild,
  memberDisplayName,
  section,
  title,
  intro,
  purpose,
  currentLabel,
  accessType,
  selectId,
  clearId,
}) {
  const config = getRoleConfig(guild.id, section);
  const roleIds = config.roleIds || [];

  const embed = createEmbed(
    title,
    [
      intro,
      '',
      '**What is this for?**',
      purpose,
      '',
      `**${currentLabel}**`,
      formatRoleList(roleIds),
    ].join('\n'),
    memberDisplayName
  ).addFields(
    { name: 'Selected', value: `${roleIds.length}/10 roles`, inline: true },
    { name: 'Access Type', value: accessType, inline: true }
  );

  return {
    embeds: [embed],
    components: [
      row(
        new RoleSelectMenuBuilder()
          .setCustomId(selectId)
          .setPlaceholder(`Select ${currentLabel.toLowerCase()}`)
          .setMinValues(0)
          .setMaxValues(10)
      ),
      row(button(clearId, '🧹 Clear Roles', ButtonStyle.Secondary), backButton()),
    ],
  };
}

function buildStaffRolesPanel(guild, memberDisplayName = 'Unknown User') {
  return buildRolePanel({
    guild,
    memberDisplayName,
    section: 'staffRoles',
    title: '👥 Staff Roles',
    intro: 'Choose which roles count as staff for bot systems.',
    purpose: 'Staff roles can be used later for admin access, trusted controls, bypass logic, and protected settings.',
    currentLabel: 'Staff Roles',
    accessType: 'Admin tools',
    selectId: 'admin:staffroles:select',
    clearId: 'admin:staffroles:clear',
  });
}

function buildModRolesPanel(guild, memberDisplayName = 'Unknown User') {
  return buildRolePanel({
    guild,
    memberDisplayName,
    section: 'modRoles',
    title: '🔐 Mod Roles',
    intro: 'Choose which roles can access the Mod Panel.',
    purpose: 'Mod roles can access moderation tools without getting admin-only controls.',
    currentLabel: 'Mod Roles',
    accessType: 'Mod panel only',
    selectId: 'admin:modroles:select',
    clearId: 'admin:modroles:clear',
  });
}

function buildModulesPanel(guild, memberDisplayName = 'Unknown User') {
  const embed = createEmbed(
    '🧩 Modules',
    'Manage optional server modules from here.',
    memberDisplayName
  ).addFields(
    ...MODULES.map(([, , name, value]) => ({
      name,
      value,
      inline: true,
    }))
  );

  return {
    embeds: [embed],
    components: [
      ...buttonRows(MODULES.map(([customId, label]) => [customId, label, ButtonStyle.Primary])),
      row(backButton()),
    ],
  };
}

function buildLogsPanel(guild, memberDisplayName = 'Unknown User') {
  const guildId = guild.id;

  const embed = createEmbed(
    '📋 Logs',
    [
      'Choose where Goliath sends different server logs.',
      '',
      '**🤖 AutoMod Log**',
      'AutoMod actions such as deleted messages, blocked links, warnings, timeouts, kicks, and bans.',
      '',
      '**👑 Admin Log**',
      'Admin panel actions, setting changes, module changes, and server configuration updates.',
      '',
      '**📌 Mod Log**',
      'Moderation actions such as warns, mutes, kicks, bans, purges, and case updates.',
      '',
      '**📋 General Logs**',
      'General server activity such as joins, leaves, message events, role changes, and channel changes.',
    ].join('\n'),
    memberDisplayName
  ).addFields(
    {
      name: '🤖 AutoMod Log',
      value: formatChannelStatus(getLogChannelId(guildId, 'automod')),
      inline: true,
    },
    {
      name: '👑 Admin Log',
      value: formatChannelStatus(getLogChannelId(guildId, 'admin')),
      inline: true,
    },
    {
      name: '📌 Mod Log',
      value: formatChannelStatus(getLogChannelId(guildId, 'moderation')),
      inline: true,
    },
    {
      name: '📋 General Logs',
      value: formatChannelStatus(getLogChannelId(guildId, 'general')),
      inline: true,
    }
  );

  return {
    embeds: [embed],
    components: [
      ...buttonRows(
        Object.values(LOG_TYPES).map((log) => [log.customId, log.label, ButtonStyle.Primary]),
        3
      ),
      row(backButton()),
    ],
  };
}

function buildAutoRolesPanel(guild, memberDisplayName = 'Unknown User') {
  const config = getAutoRolesConfig(guild.id);
  const roleIds = config.roleIds || [];

  const embed = createEmbed(
    '🎭 Join Roles',
    [
      `**Status:** ${config.enabled ? 'Enabled ✅' : 'Disabled ❌'}`,
      `**Roles:** ${formatRoleList(roleIds)}`,
      '',
      '⚠️ The bot role must be above selected roles in Discord role settings.',
    ].join('\n'),
    memberDisplayName
  );

  return {
    embeds: [embed],
    components: [
      row(
        new RoleSelectMenuBuilder()
          .setCustomId('admin:autoRoles:select')
          .setPlaceholder('Select join roles')
          .setMinValues(0)
          .setMaxValues(10)
      ),
      row(
        button(
          'admin:autoRoles:toggle',
          config.enabled ? 'Disable' : 'Enable',
          config.enabled ? ButtonStyle.Danger : ButtonStyle.Success
        ),
        backButton()
      ),
    ],
  };
}

function buildChannelPanel(type = 'logs') {
  const selected = LOG_TYPES[type] || LOG_TYPES.logs;

  return {
    embeds: [
      createEmbed(selected.title, 'Select the text channel where these logs should be sent.'),
    ],
    components: [
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId(selected.selectId)
          .setPlaceholder('Choose a text channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      row(backButton()),
    ],
  };
}

function buildComingSoonPanel(title, description) {
  return {
    embeds: [createEmbed(title, description)],
    components: [row(backButton())],
  };
}

function buildPurgeModal() {
  return new ModalBuilder()
    .setCustomId('admin:purgeModal')
    .setTitle('Purge Messages')
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId('amount')
          .setLabel('Amount (1-100)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('25')
          .setMaxLength(3)
      )
    );
}

function buildRestoreConfirmModal() {
  return new ModalBuilder()
    .setCustomId('admin:backup:restore:finalModal')
    .setTitle('Confirm FULL Restore')
    .addComponents(
      row(
        new TextInputBuilder()
          .setCustomId('confirm')
          .setLabel('Type RESTORE to confirm')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('RESTORE')
      )
    );
}

async function replyNoAccess(interaction, message) {
  await interaction.reply({
    content: message,
    flags: 64,
  });

  return true;
}

async function updatePanel(interaction, panel, nextRoute = null, options = {}) {
  const currentRoute = getCurrentRoute(interaction);

  if (nextRoute && !options.skipHistory && nextRoute !== currentRoute) {
    pushHistory(interaction, currentRoute);
  }

  if (nextRoute) setCurrentRoute(interaction, nextRoute);

  await interaction.update(panel);
  return true;
}

function buildPanelByRoute(route, guild, memberDisplayName, interaction = null) {
  if (route === 'admin:home') return buildAdminPanel(guild, memberDisplayName);
  if (route === 'admin:adminpanel') return buildAdminToolsPanel(guild, memberDisplayName);
  if (route === 'admin:modules') return buildModulesPanel(guild, memberDisplayName);
  if (route === 'admin:logs') return buildLogsPanel(guild, memberDisplayName);
  if (route === 'admin:backups') return buildBackupsPanel(guild, memberDisplayName);
  if (route === 'admin:backup:restore') return buildRestoreSelectPanel(guild, memberDisplayName);
  if (route === 'admin:staffroles') return buildStaffRolesPanel(guild, memberDisplayName);
  if (route === 'admin:modroles') return buildModRolesPanel(guild, memberDisplayName);
  if (route === 'admin:autoRoles') return buildAutoRolesPanel(guild, memberDisplayName);

  if (route === 'admin:backup:restore:confirm' && interaction) {
    const pending = RESTORE_PENDING.get(getRestoreKey(interaction));
    if (pending?.backupId) {
      return buildRestoreConfirmPanel(guild, pending.backupId, memberDisplayName);
    }
  }

  if (route === 'admin:automod') {
    return buildComingSoonPanel('⚙️ AutoMod', 'AutoMod controls will live here.');
  }

  if (route === 'admin:modpanel') {
    return buildComingSoonPanel('🔐 Mod Panel', 'Moderation tools will live here.');
  }

  if (route === 'admin:adminsettings') {
    return buildComingSoonPanel('⚙️ Admin Settings', 'Admin settings will live here.');
  }

  if (COMING_SOON[route]) {
    const [title, description] = COMING_SOON[route];
    return buildComingSoonPanel(title, description);
  }

  return buildAdminPanel(guild, memberDisplayName);
}

async function handleRoleSelect(interaction, memberDisplayName) {
  const handlers = {
    'admin:staffroles:select': {
      section: 'staffRoles',
      panel: () => buildStaffRolesPanel(interaction.guild, memberDisplayName),
      route: 'admin:staffroles',
    },
    'admin:modroles:select': {
      section: 'modRoles',
      panel: () => buildModRolesPanel(interaction.guild, memberDisplayName),
      route: 'admin:modroles',
    },
    'admin:autoRoles:select': {
      section: 'autoRoles',
      panel: () => buildAutoRolesPanel(interaction.guild, memberDisplayName),
      route: 'admin:autoRoles',
      mergeExisting: true,
    },
  };

  const selected = handlers[interaction.customId];
  if (!selected) return false;

  if (selected.mergeExisting) {
    const current = getAutoRolesConfig(interaction.guild.id);

    replaceGuildSection(interaction.guild.id, selected.section, {
      ...current,
      roleIds: safeValues(interaction),
    });
  } else {
    replaceGuildSection(interaction.guild.id, selected.section, {
      roleIds: safeValues(interaction),
    });
  }

  return updatePanel(interaction, selected.panel(), selected.route, {
    skipHistory: true,
  });
}

async function handleChannelSelect(interaction, memberDisplayName) {
  const type = LOG_SELECT_TO_TYPE[interaction.customId];
  if (!type) return false;

  const selected = LOG_TYPES[type];
  const channelId = interaction.values?.[0] || null;

  setLogChannelId(interaction.guild.id, selected.key, channelId);

  return updatePanel(
    interaction,
    buildLogsPanel(interaction.guild, memberDisplayName),
    'admin:logs',
    { skipHistory: true }
  );
}

async function handleRestoreSelect(interaction, memberDisplayName) {
  if (!isBotOwner(interaction)) {
    return replyNoAccess(interaction, '❌ Only the bot owner can restore backups.');
  }

  const backupId = interaction.values?.[0];

  if (!backupId) {
    return replyNoAccess(interaction, '❌ No backup selected.');
  }

  RESTORE_PENDING.set(getRestoreKey(interaction), {
    backupId,
    selectedBy: interaction.user.id,
    selectedAt: new Date().toISOString(),
  });

  return updatePanel(
    interaction,
    buildRestoreConfirmPanel(interaction.guild, backupId, memberDisplayName),
    'admin:backup:restore:confirm'
  );
}

async function handleBackupCreate(interaction, memberDisplayName) {
  if (!canCreateBackup(interaction)) {
    return replyNoAccess(
      interaction,
      '❌ Only the bot owner or server owner can create backups.'
    );
  }

  await interaction.deferUpdate();

  await createServerBackup(interaction.guild, {
    createdBy: interaction.user.id,
    reason: 'Manual backup from admin panel',
  });

  await interaction.editReply(buildBackupsPanel(interaction.guild, memberDisplayName));
  return true;
}

async function handleBackupList(interaction) {
  const backups = listServerBackups(interaction.guild.id)
    .map(normalizeBackupId)
    .filter(Boolean);

  return interaction.reply({
    content: backups.length
      ? `📦 **Backups for ${interaction.guild.name}:**\n${backups
          .slice(0, 10)
          .map((id) => `\`${id}\``)
          .join('\n')}`
      : '📦 No backups found.',
    flags: 64,
  });
}

async function handleBackupDownload(interaction) {
  if (!isBotOwner(interaction) && !isGuildOwner(interaction)) {
    return replyNoAccess(
      interaction,
      '❌ Only the bot owner and guild owner can download backups.'
    );
  }

  const backups = listServerBackups(interaction.guild.id);
  const latest = normalizeBackupId(backups[0]);

  if (!latest) {
    return interaction.reply({
      content: '❌ No backups found.',
      flags: 64,
    });
  }

  const backup = readServerBackup(interaction.guild.id, latest);

  if (!backup) {
    return interaction.reply({
      content: '❌ Failed to read backup.',
      flags: 64,
    });
  }

  const file = Buffer.from(JSON.stringify(backup, null, 2));

  return interaction.reply({
    content: `💾 Backup: ${latest}`,
    files: [
      {
        attachment: file,
        name: `${latest}.json`,
      },
    ],
    flags: 64,
  });
}

function sendRestoreLog(guild, message) {
  const channelId = getLogChannelId(guild.id, 'admin');
  if (!channelId) return;

  const channel = guild.channels.cache.get(channelId);
  if (!channel) return;

  channel.send(message).catch(() => {});
}

async function handleBackupPreview(interaction) {
  const backups = listServerBackups(interaction.guild.id);
  const latestBackupId = normalizeBackupId(backups[0]);

  if (!latestBackupId) {
    return interaction.reply({
      content: '🔍 No backups found to preview.',
      flags: 64,
    });
  }

  const backup = readServerBackup(interaction.guild.id, latestBackupId);

  if (!backup) {
    return interaction.reply({
      content: '❌ Could not read latest backup.',
      flags: 64,
    });
  }

  return interaction.reply({
    content: [
      '🔍 **Latest Backup Preview**',
      '',
      `**Backup ID:** \`${backup.backupId || latestBackupId}\``,
      `**Created:** \`${backup.createdAt || 'Unknown'}\``,
      `**Created By:** \`${backup.createdBy || 'Unknown'}\``,
      `**Guild:** \`${backup.guild?.name || backup.sourceGuild?.name || interaction.guild.name}\``,
      `**Guild ID:** \`${backup.guild?.id || backup.sourceGuild?.id || interaction.guild.id}\``,
      `**Roles:** \`${backup.roles?.length || 0}\``,
      `**Channels:** \`${backup.channels?.length || 0}\``,
      `**Categories:** \`${backup.categories?.length || 0}\``,
      `**Logs Included:** \`${backup.logs ? 'Yes' : 'No'}\``,
    ].join('\n'),
    flags: 64,
  });
}

async function handleBackupRestore(interaction, memberDisplayName) {
  if (!isBotOwner(interaction)) {
    return replyNoAccess(interaction, '❌ Only the bot owner can restore backups.');
  }

  return updatePanel(
    interaction,
    buildRestoreSelectPanel(interaction.guild, memberDisplayName),
    'admin:backup:restore'
  );
}

async function handleBackupRestoreConfirm(interaction) {
  if (!isBotOwner(interaction)) {
    return replyNoAccess(interaction, '❌ Only the bot owner can restore backups.');
  }

  const pending = RESTORE_PENDING.get(getRestoreKey(interaction));

  if (!pending?.backupId) {
    return interaction.reply({
      content: '❌ No restore backup is selected. Please choose a backup first.',
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    const report = await restoreServerBackup(interaction.guild, pending.backupId, {
      dryRun: true,
      reason: `Goliath dry-run restore requested by ${interaction.user.tag}`,
    });

    return interaction.editReply({
      content: [
        '🧪 **Restore Dry Run Complete**',
        '',
        `**Backup ID:** \`${report.backupId}\``,
        `**Guild:** \`${report.guildName}\``,
        '',
        `**Roles Planned:** \`${report.roles?.planned || 0}\``,
        `**Categories Planned:** \`${report.categories?.planned || 0}\``,
        `**Channels Planned:** \`${report.channels?.planned || 0}\``,
        `**Config Sections Planned:** \`${report.config?.planned || 0}\``,
        '',
        report.warnings?.length
          ? `⚠️ **Warnings:**\n${report.warnings.slice(0, 5).map((w) => `- ${w}`).join('\n')}`
          : '✅ No warnings.',
        '',
        '⚠️ READY FOR REAL RESTORE',
        'This will rebuild roles, channels, and permissions.',
      ].join('\n'),
      components: [
        row(
          button('admin:backup:restore:real', '🚨 Run Real Restore', ButtonStyle.Danger),
          button('admin:backup:restore:cancel', 'Cancel', ButtonStyle.Secondary)
        ),
      ],
    });
  } catch (error) {
    return interaction.editReply({
      content: [
        '❌ **Restore dry run failed.**',
        '',
        `\`${error.message}\``,
        '',
        'No server changes were made.',
      ].join('\n'),
    });
  }
}

async function handleBackupRestoreCancel(interaction, memberDisplayName) {
  const pending = RESTORE_PENDING.get(getRestoreKey(interaction));

  if (pending?.backupId) {
    sendRestoreLog(
      interaction.guild,
      [
        '🧱 **Server Restore Cancelled**',
        '',
        `👤 By: <@${interaction.user.id}>`,
        `📦 Backup: ${pending.backupId}`,
        `🕒 Time: ${new Date().toLocaleString()}`,
      ].join('\n')
    );
  }

  RESTORE_PENDING.delete(getRestoreKey(interaction));

  return updatePanel(
    interaction,
    buildBackupsPanel(interaction.guild, memberDisplayName),
    'admin:backups',
    { skipHistory: true }
  );
}

async function handleFinalRestoreModal(interaction) {
  if (!isBotOwner(interaction)) {
    return replyNoAccess(interaction, '❌ Only the bot owner can restore backups.');
  }

  const confirm = interaction.fields.getTextInputValue('confirm');

  if (confirm !== 'RESTORE') {
    return interaction.reply({
      content: '❌ You must type RESTORE exactly.',
      flags: 64,
    });
  }

  const pending = RESTORE_PENDING.get(getRestoreKey(interaction));

  if (!pending?.backupId) {
    return interaction.reply({
      content: '❌ No backup selected.',
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    await interaction.editReply({
  content: '⏳ Restore starting...\n\nProgress: 0%',
});

const report = await restoreServerBackup(
  interaction.guild,
  pending.backupId,
  {
    dryRun: false,
    reason: `REAL RESTORE by ${interaction.user.tag}`,

    onProgress: async ({ step, current, total, percent }) => {
      await interaction.editReply({
        content: [
          '⏳ **Restore in progress**',
          '',
          `**Step:** ${step}`,
          `**Progress:** ${percent}%`,
          `**Items:** ${current}/${total}`,
        ].join('\n'),
      });
    },
  }
);

    sendRestoreLog(
      interaction.guild,
      [
        '🚨 **Server Restore Executed**',
        '',
        `👤 By: <@${interaction.user.id}>`,
        `📦 Backup: ${pending.backupId}`,
        `🕒 Time: ${new Date().toLocaleString()}`,
      ].join('\n')
    );

    RESTORE_PENDING.delete(getRestoreKey(interaction));

    return interaction.editReply({
      content: [
        '✅ **RESTORE COMPLETE**',
        '',
        `Roles: ${report.roles?.created || 0}`,
        `Categories: ${report.categories?.created || 0}`,
        `Channels: ${report.channels?.created || 0}`,
      ].join('\n'),
    });
  } catch (err) {
    return interaction.editReply({
      content: `❌ Restore failed:\n${err.message}`,
    });
  }
}

async function handleAdminNavigation(interaction) {
  if (!interaction.guild) return false;
  if (!interaction.customId?.startsWith('admin:')) return false;

  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'admin:backup:restore:finalModal') {
      return handleFinalRestoreModal(interaction);
    }

    return false;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.isRoleSelectMenu()) {
    return handleRoleSelect(interaction, memberDisplayName);
  }

  if (interaction.isChannelSelectMenu()) {
    return handleChannelSelect(interaction, memberDisplayName);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'admin:backup:restore:select') {
      return handleRestoreSelect(interaction, memberDisplayName);
    }

    return false;
  }

  if (!interaction.isButton()) return false;

  const { customId } = interaction;

  if (customId === 'admin:backup:restore:real') {
    if (!isBotOwner(interaction)) {
      return replyNoAccess(interaction, '❌ Only the bot owner can restore.');
    }

    const pending = RESTORE_PENDING.get(getRestoreKey(interaction));

    if (!pending?.backupId) {
      return interaction.reply({
        content: '❌ No backup selected.',
        flags: 64,
      });
    }

    await interaction.showModal(buildRestoreConfirmModal());
    return true;
  }

  if (customId === 'admin:back') {
    const previousRoute = popHistory(interaction);

    return updatePanel(
      interaction,
      buildPanelByRoute(previousRoute, interaction.guild, memberDisplayName, interaction),
      previousRoute,
      { skipHistory: true }
    );
  }

  if (customId === 'admin:home') {
    return updatePanel(
      interaction,
      buildAdminPanel(interaction.guild, memberDisplayName),
      'admin:home'
    );
  }

  if (customId === 'admin:backups') {
    return updatePanel(
      interaction,
      buildBackupsPanel(interaction.guild, memberDisplayName),
      'admin:backups'
    );
  }

  if (customId === 'admin:backup:create') {
    return handleBackupCreate(interaction, memberDisplayName);
  }

  if (customId === 'admin:backup:list') {
    return handleBackupList(interaction);
  }

  if (customId === 'admin:backup:preview') {
    return handleBackupPreview(interaction);
  }

  if (customId === 'admin:backup:download') {
    return handleBackupDownload(interaction);
  }

  if (customId === 'admin:backup:restore') {
    return handleBackupRestore(interaction, memberDisplayName);
  }

  if (customId === 'admin:backup:restore:confirm') {
    return handleBackupRestoreConfirm(interaction);
  }

  if (customId === 'admin:backup:restore:cancel') {
    return handleBackupRestoreCancel(interaction, memberDisplayName);
  }

  if (customId === 'admin:modules') {
    return updatePanel(
      interaction,
      buildModulesPanel(interaction.guild, memberDisplayName),
      'admin:modules'
    );
  }

  if (customId === 'admin:logs') {
    return updatePanel(
      interaction,
      buildLogsPanel(interaction.guild, memberDisplayName),
      'admin:logs'
    );
  }

  if (LOG_BUTTON_TO_TYPE[customId]) {
    return updatePanel(
      interaction,
      buildChannelPanel(LOG_BUTTON_TO_TYPE[customId]),
      `admin:channel:${LOG_BUTTON_TO_TYPE[customId]}`
    );
  }

  if (customId === 'admin:adminpanel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return replyNoAccess(interaction, '❌ You cannot access the Admin Panel.');
    }

    return updatePanel(
      interaction,
      buildAdminToolsPanel(interaction.guild, memberDisplayName),
      'admin:adminpanel'
    );
  }

  if (customId === 'admin:automod') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return replyNoAccess(interaction, '❌ You cannot access AutoMod.');
    }

    return updatePanel(
      interaction,
      buildComingSoonPanel('⚙️ AutoMod', 'AutoMod controls will live here.'),
      'admin:automod'
    );
  }

  if (customId === 'admin:modpanel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return replyNoAccess(interaction, '❌ You cannot access the Mod Panel.');
    }

    return updatePanel(
      interaction,
      buildComingSoonPanel('🔐 Mod Panel', 'Moderation tools will live here.'),
      'admin:modpanel'
    );
  }

  if (customId === 'admin:staffroles') {
    return updatePanel(
      interaction,
      buildStaffRolesPanel(interaction.guild, memberDisplayName),
      'admin:staffroles'
    );
  }

  if (customId === 'admin:staffroles:clear') {
    replaceGuildSection(interaction.guild.id, 'staffRoles', { roleIds: [] });

    return updatePanel(
      interaction,
      buildStaffRolesPanel(interaction.guild, memberDisplayName),
      'admin:staffroles',
      { skipHistory: true }
    );
  }

  if (customId === 'admin:modroles') {
    return updatePanel(
      interaction,
      buildModRolesPanel(interaction.guild, memberDisplayName),
      'admin:modroles'
    );
  }

  if (customId === 'admin:modroles:clear') {
    replaceGuildSection(interaction.guild.id, 'modRoles', { roleIds: [] });

    return updatePanel(
      interaction,
      buildModRolesPanel(interaction.guild, memberDisplayName),
      'admin:modroles',
      { skipHistory: true }
    );
  }

  if (customId === 'admin:autoRoles') {
    return updatePanel(
      interaction,
      buildAutoRolesPanel(interaction.guild, memberDisplayName),
      'admin:autoRoles'
    );
  }

  if (customId === 'admin:autoRoles:toggle') {
    const current = getAutoRolesConfig(interaction.guild.id);

    replaceGuildSection(interaction.guild.id, 'autoRoles', {
      ...current,
      enabled: !current.enabled,
      roleIds: current.roleIds || [],
    });

    return updatePanel(
      interaction,
      buildAutoRolesPanel(interaction.guild, memberDisplayName),
      'admin:autoRoles',
      { skipHistory: true }
    );
  }

  if (customId === 'admin:embed') {
    const { buildEmbedPanel } = require('../embed/embedPanel');

    return updatePanel(
      interaction,
      buildEmbedPanel(interaction, memberDisplayName),
      'admin:embed'
    );
  }

  if (customId === 'admin:adminsettings') {
    return updatePanel(
      interaction,
      buildComingSoonPanel('⚙️ Admin Settings', 'Admin settings will live here.'),
      'admin:adminsettings'
    );
  }

  if (COMING_SOON[customId]) {
    const [title, description] = COMING_SOON[customId];

    return updatePanel(
      interaction,
      buildComingSoonPanel(title, description),
      customId
    );
  }

  if (customId === 'admin:purge') {
    await interaction.showModal(buildPurgeModal());
    return true;
  }

  return false;
}

module.exports = {
  LOG_TYPES,

  buildAdminPanel,
  buildAdminToolsPanel,
  buildBackupsPanel,
  buildRestoreSelectPanel,
  buildRestoreConfirmPanel,
  buildStaffRolesPanel,
  buildModRolesPanel,
  buildModulesPanel,
  buildLogsPanel,
  buildAutoRolesPanel,
  buildChannelPanel,
  buildComingSoonPanel,
  buildPurgeModal,

  getLogChannelId,
  setLogChannelId,
  handleAdminNavigation,
};