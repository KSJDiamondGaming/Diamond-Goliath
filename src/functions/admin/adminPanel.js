// functions/admin/adminPanel.js

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
} = require('discord.js');

const {
  canAccessAdminPanel,
  canAccessAutoMod,
  canAccessModPanel,
} = require('./permissions');

const guildManager = require('../../guild/guildManager');

const PANEL_COLOR = '#5865F2';

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

/* ---------------- HELPERS ---------------- */

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
  return cleanIds.length ? cleanIds.map((id) => `<@&${id}>`).join(', ') : 'None';
}

function formatLogsSummary(guildId) {
  const total = ['automod', 'admin', 'moderation', 'general']
    .map((key) => getLogChannelId(guildId, key))
    .filter(Boolean).length;

  return `${total}/4 channels set`;
}

function createEmbed(title, description, memberDisplayName) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(title)
    .setTimestamp();

  if (description) embed.setDescription(description);
  if (memberDisplayName) embed.setFooter({ text: `Requested by ${memberDisplayName}` });

  return embed;
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style);
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

/* ---------------- MAIN ADMIN HUB ---------------- */

function buildAdminPanel(guild, memberDisplayName = 'Unknown User') {
  const guildId = guild.id;

  const embed = createEmbed(
    '🛠️ Admin Hub',
    'Control your server systems from one place.',
    memberDisplayName
  ).addFields(
    { name: '⚙️ AutoMod', value: 'Filters & protection', inline: true },
    { name: '👑 Admin', value: 'Admin tools & systems', inline: true },
    { name: '🛡️ Mod Panel', value: 'Moderation tools', inline: true },
    { name: '🧩 Modules', value: 'Embeds, tickets, fun, etc.', inline: true },
    { name: '📋 Logs', value: formatLogsSummary(guildId), inline: true },
    { name: '🧹 Purge', value: 'Bulk delete messages', inline: true }
  );

  return {
    embeds: [embed],
    components: buttonRows([
      ['admin:automod', '⚙️ AutoMod', ButtonStyle.Primary],
      ['admin:adminpanel', '👑 Admin', ButtonStyle.Primary],
      ['admin:modpanel', '🛡️ Mod Panel', ButtonStyle.Primary],
      ['admin:modules', '🧩 Modules', ButtonStyle.Primary],
      ['admin:logs', '📋 Logs', ButtonStyle.Primary],
      ['admin:purge', '🧹 Purge', ButtonStyle.Danger],
    ]),
  };
}

/* ---------------- ADMIN TOOLS PANEL ---------------- */

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
      '**👑 Admin Logging**',
      adminLogChannelId
        ? `Enabled ✅ — admin actions will log to <#${adminLogChannelId}>.`
        : 'Disabled ❌ — set an Admin Log channel to enable admin logging.',
      '',
      '**👥 Staff Roles**',
      formatRoleList(staffConfig.roleIds),
      '',
      '**🛡️ Mod Roles**',
      formatRoleList(modConfig.roleIds),
    ].join('\n'),
    memberDisplayName
  ).addFields(
    {
      name: '👑 Admin Log',
      value: formatChannelStatus(adminLogChannelId),
      inline: true,
    },
    {
      name: '👥 Staff Roles',
      value: `${staffConfig.roleIds?.length || 0} selected`,
      inline: true,
    },
    {
      name: '🛡️ Mod Roles',
      value: `${modConfig.roleIds?.length || 0} selected`,
      inline: true,
    }
  );

  return {
    embeds: [embed],
    components: buttonRows([
      ['admin:setadminlog', '👑 Set Admin Log', ButtonStyle.Primary],
      ['admin:staffroles', '👥 Staff Roles', ButtonStyle.Primary],
      ['admin:modroles', '🛡️ Mod Roles', ButtonStyle.Primary],
      ['admin:adminsettings', '⚙️ Settings', ButtonStyle.Primary],
      ['admin:home', '⬅️ Admin Hub', ButtonStyle.Secondary],
    ]),
  };
}

/* ---------------- ROLE PANELS ---------------- */

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
  backId = 'admin:adminpanel',
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
    {
      name: 'Selected',
      value: `${roleIds.length}/10 roles`,
      inline: true,
    },
    {
      name: 'Access Type',
      value: accessType,
      inline: true,
    }
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
      row(
        button(clearId, '🧹 Clear Roles', ButtonStyle.Secondary),
        button(backId, '⬅️ Admin Panel', ButtonStyle.Secondary)
      ),
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
    purpose:
      'Staff roles can be used later for admin panel access, trusted controls, bypass logic, and protected settings.',
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
    title: '🛡️ Mod Roles',
    intro: 'Choose which roles can access the Mod Panel.',
    purpose: 'Mod roles can access moderation tools without getting admin-only controls.',
    currentLabel: 'Mod Roles',
    accessType: 'Mod panel only',
    selectId: 'admin:modroles:select',
    clearId: 'admin:modroles:clear',
  });
}

/* ---------------- MODULES PANEL ---------------- */

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

  const moduleButtons = MODULES.map(([customId, label]) => [
    customId,
    label,
    ButtonStyle.Primary,
  ]);

  return {
    embeds: [embed],
    components: [
      ...buttonRows(moduleButtons),
      row(button('admin:home', '⬅️ Admin Hub', ButtonStyle.Secondary)),
    ],
  };
}

/* ---------------- LOGS PANEL ---------------- */

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
    ...Object.values(LOG_TYPES).map((log) => ({
      name: log.label,
      value: formatChannelStatus(getLogChannelId(guildId, log.key)),
      inline: true,
    }))
  );

  return {
    embeds: [embed],
    components: [
      ...buttonRows(
        Object.values(LOG_TYPES).map((log) => [
          log.customId,
          log.label,
          ButtonStyle.Primary,
        ]),
        3
      ),
      row(button('admin:home', '⬅️ Admin Hub', ButtonStyle.Secondary)),
    ],
  };
}

/* ---------------- JOIN ROLES ---------------- */

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
        button('admin:modules', '⬅️ Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

/* ---------------- CHANNEL PANEL ---------------- */

function buildChannelPanel(type = 'logs') {
  const selected = LOG_TYPES[type] || LOG_TYPES.logs;

  return {
    embeds: [
      createEmbed(
        selected.title,
        'Select the text channel where these logs should be sent.'
      ),
    ],
    components: [
      row(
        new ChannelSelectMenuBuilder()
          .setCustomId(selected.selectId)
          .setPlaceholder('Choose a text channel')
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
      ),
      row(button('admin:logs', '⬅️ Logs', ButtonStyle.Secondary)),
    ],
  };
}

/* ---------------- PLACEHOLDER PANEL ---------------- */

function buildComingSoonPanel(title, description, backTo = 'admin:modules') {
  const backLabel = backTo === 'admin:home' ? '⬅️ Admin Hub' : '⬅️ Modules';

  return {
    embeds: [createEmbed(title, description)],
    components: [row(button(backTo, backLabel, ButtonStyle.Secondary))],
  };
}

/* ---------------- PURGE MODAL ---------------- */

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

/* ---------------- NAVIGATION SYSTEM ---------------- */

async function replyNoAccess(interaction, message) {
  await interaction.reply({
    content: message,
    ephemeral: true,
  });

  return true;
}

async function updatePanel(interaction, panel) {
  await interaction.update(panel);
  return true;
}

async function handleRoleSelect(interaction, memberDisplayName) {
  const handlers = {
    'admin:staffroles:select': {
      section: 'staffRoles',
      panel: () => buildStaffRolesPanel(interaction.guild, memberDisplayName),
    },
    'admin:modroles:select': {
      section: 'modRoles',
      panel: () => buildModRolesPanel(interaction.guild, memberDisplayName),
    },
    'admin:autoRoles:select': {
      section: 'autoRoles',
      panel: () => buildAutoRolesPanel(interaction.guild, memberDisplayName),
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

  return updatePanel(interaction, selected.panel());
}

async function handleChannelSelect(interaction, memberDisplayName) {
  const type = LOG_SELECT_TO_TYPE[interaction.customId];
  if (!type) return false;

  const selected = LOG_TYPES[type];
  const channelId = interaction.values?.[0] || null;

  setLogChannelId(interaction.guild.id, selected.key, channelId);

  return updatePanel(interaction, buildLogsPanel(interaction.guild, memberDisplayName));
}

async function handleAdminNavigation(interaction) {
  if (!interaction.guild) return false;
  if (!interaction.customId?.startsWith('admin:')) return false;

  const memberDisplayName = getMemberDisplayName(interaction);

  if (interaction.isRoleSelectMenu()) {
    return handleRoleSelect(interaction, memberDisplayName);
  }

  if (interaction.isChannelSelectMenu()) {
    return handleChannelSelect(interaction, memberDisplayName);
  }

  if (!interaction.isButton()) return false;

  const { customId } = interaction;

  if (customId === 'admin:home') {
    return updatePanel(interaction, buildAdminPanel(interaction.guild, memberDisplayName));
  }

  if (customId === 'admin:modules') {
    return updatePanel(interaction, buildModulesPanel(interaction.guild, memberDisplayName));
  }

  if (customId === 'admin:logs') {
    return updatePanel(interaction, buildLogsPanel(interaction.guild, memberDisplayName));
  }

  if (LOG_BUTTON_TO_TYPE[customId]) {
    return updatePanel(interaction, buildChannelPanel(LOG_BUTTON_TO_TYPE[customId]));
  }

  if (customId === 'admin:adminpanel') {
    if (!canAccessAdminPanel(interaction.member)) {
      return replyNoAccess(interaction, '❌ You cannot access the Admin Panel.');
    }

    return updatePanel(
      interaction,
      buildAdminToolsPanel(interaction.guild, memberDisplayName)
    );
  }

  if (customId === 'admin:automod') {
    if (!canAccessAutoMod(interaction.member)) {
      return replyNoAccess(interaction, '❌ You cannot access AutoMod.');
    }

    return updatePanel(
      interaction,
      buildComingSoonPanel('⚙️ AutoMod', 'AutoMod controls will live here.', 'admin:home')
    );
  }

  if (customId === 'admin:modpanel') {
    if (!canAccessModPanel(interaction.member)) {
      return replyNoAccess(interaction, '❌ You cannot access the Mod Panel.');
    }

    return updatePanel(
      interaction,
      buildComingSoonPanel('🛡️ Mod Panel', 'Moderation tools will live here.', 'admin:home')
    );
  }

  if (customId === 'admin:staffroles') {
    return updatePanel(
      interaction,
      buildStaffRolesPanel(interaction.guild, memberDisplayName)
    );
  }

  if (customId === 'admin:staffroles:clear') {
    replaceGuildSection(interaction.guild.id, 'staffRoles', { roleIds: [] });

    return updatePanel(
      interaction,
      buildStaffRolesPanel(interaction.guild, memberDisplayName)
    );
  }

  if (customId === 'admin:modroles') {
    return updatePanel(
      interaction,
      buildModRolesPanel(interaction.guild, memberDisplayName)
    );
  }

  if (customId === 'admin:modroles:clear') {
    replaceGuildSection(interaction.guild.id, 'modRoles', { roleIds: [] });

    return updatePanel(
      interaction,
      buildModRolesPanel(interaction.guild, memberDisplayName)
    );
  }

  if (customId === 'admin:autoRoles') {
    return updatePanel(
      interaction,
      buildAutoRolesPanel(interaction.guild, memberDisplayName)
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
      buildAutoRolesPanel(interaction.guild, memberDisplayName)
    );
  }

  if (customId === 'admin:embed') {
    const { buildEmbedPanel } = require('../embed/embedPanel');
    return updatePanel(interaction, buildEmbedPanel(interaction, memberDisplayName));
  }

  if (customId === 'admin:adminsettings') {
    return updatePanel(
      interaction,
      buildComingSoonPanel(
        '⚙️ Admin Settings',
        'Admin settings will live here.',
        'admin:adminpanel'
      )
    );
  }

  if (COMING_SOON[customId]) {
    const [title, description] = COMING_SOON[customId];
    return updatePanel(interaction, buildComingSoonPanel(title, description));
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