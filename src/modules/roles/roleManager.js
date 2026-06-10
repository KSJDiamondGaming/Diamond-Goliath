'use strict';

// src/modules/roles/roleManager.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
} = require('discord.js');

const roleStore = require('./roleStore');

const CUSTOM_ID_PREFIX = 'role_toggle';
const MAX_BUTTONS_PER_ROW = 5;
const MAX_ACTION_ROWS = 5;
const MAX_PANEL_ROLES = MAX_BUTTONS_PER_ROW * MAX_ACTION_ROWS;

const ROLE_MODES = {
  TOGGLE: 'toggle',
  ADD: 'add',
  REMOVE: 'remove',
  VERIFY: 'verify',
};

function nowMs() {
  return Date.now();
}

function msPerDay() {
  return 24 * 60 * 60 * 1000;
}

function daysBetween(startDate, endMs = nowMs()) {
  const time = startDate instanceof Date ? startDate.getTime() : new Date(startDate || 0).getTime();
  if (!Number.isFinite(time) || time <= 0) return 0;
  return Math.floor((endMs - time) / msPerDay());
}

function chunk(array, size) {
  const output = [];
  for (let index = 0; index < array.length; index += size) {
    output.push(array.slice(index, index + size));
  }
  return output;
}

function parseToggleCustomId(customId = '') {
  const parts = String(customId || '').split(':');

  if (parts[0] !== CUSTOM_ID_PREFIX || parts.length < 3) {
    return null;
  }

  return {
    panelId: roleStore.cleanKey(parts[1]),
    roleKey: roleStore.cleanKey(parts[2]),
  };
}

function buildToggleCustomId(panelId, roleKey) {
  return `${CUSTOM_ID_PREFIX}:${roleStore.cleanKey(panelId)}:${roleStore.cleanKey(roleKey)}`;
}

function buildPanelEmbed(panel = {}) {
  return new EmbedBuilder()
    .setColor(0x2f80ed)
    .setTitle(panel.title || 'Reaction Roles')
    .setDescription(panel.description || 'Use the buttons below to manage your roles.')
    .setFooter({ text: 'Goliath Role System' })
    .setTimestamp(new Date());
}

function buildRoleButton(panelId, roleConfig = {}) {
  const button = new ButtonBuilder()
    .setCustomId(buildToggleCustomId(panelId, roleConfig.id || roleConfig.roleId))
    .setLabel(roleConfig.label || 'Role')
    .setStyle(roleConfig.mode === ROLE_MODES.REMOVE ? ButtonStyle.Danger : ButtonStyle.Secondary)
    .setDisabled(roleConfig.enabled === false);

  if (roleConfig.emoji) {
    button.setEmoji(roleConfig.emoji);
  }

  return button;
}

function buildPanelComponents(panel = {}) {
  const roles = Array.isArray(panel.roles) ? panel.roles.filter((role) => role.enabled !== false) : [];
  const limitedRoles = roles.slice(0, MAX_PANEL_ROLES);

  return chunk(limitedRoles, MAX_BUTTONS_PER_ROW)
    .slice(0, MAX_ACTION_ROWS)
    .map((row) => new ActionRowBuilder().addComponents(
      row.map((role) => buildRoleButton(panel.panelId || panel.id, role))
    ));
}

function memberHasAdmin(member) {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.Administrator));
}

function canManageRoles(member) {
  return Boolean(
    memberHasAdmin(member) ||
      member?.permissions?.has?.(PermissionFlagsBits.ManageRoles) ||
      member?.permissions?.has?.(PermissionFlagsBits.ManageGuild)
  );
}

function getBotMember(guild) {
  return guild?.members?.me || guild?.members?.cache?.get(guild.client.user.id) || null;
}

function roleIsDangerous(role) {
  const permissions = role?.permissions;
  if (!permissions) return false;

  return Boolean(
    permissions.has(PermissionFlagsBits.Administrator) ||
      permissions.has(PermissionFlagsBits.ManageGuild) ||
      permissions.has(PermissionFlagsBits.ManageRoles) ||
      permissions.has(PermissionFlagsBits.ManageChannels) ||
      permissions.has(PermissionFlagsBits.ManageWebhooks) ||
      permissions.has(PermissionFlagsBits.BanMembers) ||
      permissions.has(PermissionFlagsBits.KickMembers)
  );
}

function validateRoleSafety(guild, role) {
  if (!guild) {
    return { ok: false, reason: 'Guild not found.' };
  }

  if (!role) {
    return { ok: false, reason: 'Role not found.' };
  }

  if (role.managed) {
    return { ok: false, reason: 'Managed/integration roles cannot be assigned.' };
  }

  if (role.id === guild.id) {
    return { ok: false, reason: '@everyone cannot be used.' };
  }

  if (roleIsDangerous(role)) {
    return { ok: false, reason: 'Dangerous permission roles are blocked.' };
  }

  const botMember = getBotMember(guild);
  if (!botMember) {
    return { ok: false, reason: 'Bot member not available.' };
  }

  if (role.position >= botMember.roles.highest.position) {
    return { ok: false, reason: 'This role is higher than, or equal to, Goliath’s highest role.' };
  }

  return { ok: true, reason: null };
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;
  return guild.roles.cache.get(roleId) || guild.roles.fetch(roleId).catch(() => null);
}

async function fetchMember(guild, userId) {
  if (!guild || !userId) return null;
  return guild.members.cache.get(userId) || guild.members.fetch(userId).catch(() => null);
}

function getPanelRole(panel, roleKey) {
  const roles = Array.isArray(panel?.roles) ? panel.roles : [];

  return roles.find(
    (role) =>
      role.id === roleKey ||
      role.roleId === roleKey ||
      roleStore.cleanKey(role.label) === roleKey
  ) || null;
}

async function removeExclusiveGroupRoles(member, panel, selectedRole) {
  if (!member || !panel || !selectedRole?.groupId) {
    return 0;
  }

  const groupRoles = (panel.roles || []).filter(
    (role) =>
      role.groupId === selectedRole.groupId &&
      role.roleId &&
      role.roleId !== selectedRole.roleId &&
      member.roles.cache.has(role.roleId)
  );

  let removed = 0;

  for (const role of groupRoles) {
    await member.roles.remove(role.roleId, 'Goliath role group selection').catch(() => null);
    removed += 1;
  }

  return removed;
}

async function applyRoleToggle(interaction, panelId, roleKey) {
  const section = roleStore.getRolesSection(interaction.guildId);

  if (section.enabled === false) {
    return {
      ok: false,
      message: 'Role system is currently disabled on this server.',
    };
  }

  const panel = roleStore.getReactionPanel(interaction.guildId, panelId);
  if (!panel || panel.enabled === false) {
    return {
      ok: false,
      message: 'This role panel is no longer active.',
    };
  }

  const roleConfig = getPanelRole(panel, roleKey);
  if (!roleConfig || roleConfig.enabled === false) {
    return {
      ok: false,
      message: 'This role option is no longer available.',
    };
  }

  const role = await fetchRole(interaction.guild, roleConfig.roleId);
  const safety = validateRoleSafety(interaction.guild, role);

  if (!safety.ok) {
    return {
      ok: false,
      message: safety.reason,
    };
  }

  const member = interaction.member || await fetchMember(interaction.guild, interaction.user.id);
  if (!member) {
    return {
      ok: false,
      message: 'Member not found.',
    };
  }

  const mode = roleConfig.mode || ROLE_MODES.TOGGLE;
  const hasRole = member.roles.cache.has(role.id);

  if (mode === ROLE_MODES.REMOVE) {
    if (!hasRole) {
      return { ok: true, message: `You do not have **${role.name}**.` };
    }

    await member.roles.remove(role, 'Goliath role remove button');
    roleStore.addAnalytics(interaction.guildId, { removed: 1 });
    return { ok: true, message: `Removed **${role.name}**.` };
  }

  if (mode === ROLE_MODES.ADD || mode === ROLE_MODES.VERIFY) {
    if (hasRole) {
      return { ok: true, message: `You already have **${role.name}**.` };
    }

    const removed = await removeExclusiveGroupRoles(member, panel, roleConfig);
    await member.roles.add(role, 'Goliath role add button');
    roleStore.addAnalytics(interaction.guildId, { assigned: 1, removed });
    return { ok: true, message: `Added **${role.name}**.` };
  }

  if (hasRole) {
    await member.roles.remove(role, 'Goliath role toggle button');
    roleStore.addAnalytics(interaction.guildId, { removed: 1 });
    return { ok: true, message: `Removed **${role.name}**.` };
  }

  const removed = await removeExclusiveGroupRoles(member, panel, roleConfig);
  await member.roles.add(role, 'Goliath role toggle button');
  roleStore.addAnalytics(interaction.guildId, { assigned: 1, removed });

  return { ok: true, message: `Added **${role.name}**.` };
}

async function createReactionPanel({
  guild,
  channel,
  title = 'Reaction Roles',
  description = 'Use the buttons below to manage your roles.',
  roles = [],
  createdBy = null,
  source = 'roles',
  sourceId = null,
}) {
  if (!guild?.id) {
    throw new Error('Guild is required.');
  }

  if (!channel?.send) {
    throw new Error('A sendable channel is required.');
  }

  const panel = roleStore.saveReactionPanel(guild.id, {
    title,
    description,
    channelId: channel.id,
    roles,
    createdBy,
    source,
    sourceId,
  });

  const message = await channel.send({
    embeds: [buildPanelEmbed(panel)],
    components: buildPanelComponents(panel),
  });

  return roleStore.saveReactionPanel(guild.id, {
    ...panel,
    messageId: message.id,
    channelId: channel.id,
    updatedBy: createdBy,
  });
}

function attachPanelToMessage({
  guildId,
  channelId,
  messageId,
  title = 'Reaction Roles',
  description = 'Use the buttons below to manage your roles.',
  roles = [],
  createdBy = null,
  source = 'existing-message',
  sourceId = null,
}) {
  if (!guildId || !channelId || !messageId) {
    throw new Error('guildId, channelId and messageId are required.');
  }

  return roleStore.saveReactionPanel(guildId, {
    title,
    description,
    channelId,
    messageId,
    roles,
    createdBy,
    source,
    sourceId,
  });
}

async function refreshPanelMessage(client, guildId, panelId) {
  const panel = roleStore.getReactionPanel(guildId, panelId);
  if (!panel?.channelId || !panel?.messageId) return null;

  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  const channel = guild?.channels?.cache?.get(panel.channelId) || await guild?.channels?.fetch(panel.channelId).catch(() => null);
  const message = await channel?.messages?.fetch(panel.messageId).catch(() => null);

  if (!message?.editable) return null;

  await message.edit({
    embeds: [buildPanelEmbed(panel)],
    components: buildPanelComponents(panel),
  });

  return panel;
}

async function applyTimedRoleRule(guild, rule) {
  if (!guild || !rule?.enabled || !rule.roleId || rule.afterDays <= 0) {
    return { assigned: 0, checked: 0, skipped: true };
  }

  const role = await fetchRole(guild, rule.roleId);
  const safety = validateRoleSafety(guild, role);

  if (!safety.ok) {
    return { assigned: 0, checked: 0, skipped: true, reason: safety.reason };
  }

  await guild.members.fetch().catch(() => null);

  let assigned = 0;
  let checked = 0;

  for (const member of guild.members.cache.values()) {
    if (rule.onlyHumans !== false && member.user?.bot) continue;

    checked += 1;

    const joinedDays = daysBetween(member.joinedAt);
    const hasRole = member.roles.cache.has(rule.roleId);

    if (joinedDays >= rule.afterDays && !hasRole) {
      await member.roles.add(role, `Goliath timed role: ${rule.afterDays} days in server`).catch(() => null);
      assigned += 1;
    }

    if (rule.removeIfBelow === true && joinedDays < rule.afterDays && hasRole) {
      await member.roles.remove(role, `Goliath timed role removal: below ${rule.afterDays} days`).catch(() => null);
    }
  }

  roleStore.touchTimedRoleRun(guild.id, rule.ruleId, assigned);
  if (assigned > 0) {
    roleStore.addAnalytics(guild.id, { assigned });
  }

  return { assigned, checked, skipped: false };
}

async function runTimedRoleChecks(guild) {
  if (!guild?.id) return [];

  const section = roleStore.getRolesSection(guild.id);
  if (section.enabled === false) return [];

  const results = [];
  const rules = roleStore.getTimedRoles(guild.id).filter((rule) => rule.enabled !== false);

  for (const rule of rules) {
    const result = await applyTimedRoleRule(guild, rule);
    results.push({ ruleId: rule.ruleId, ...result });
  }

  return results;
}

async function runTimedRoleChecksForClient(client) {
  const results = [];

  for (const guild of client.guilds.cache.values()) {
    const guildResults = await runTimedRoleChecks(guild).catch((error) => [{ error: error.message }]);
    results.push({ guildId: guild.id, results: guildResults });
  }

  return results;
}

function startTimedRoleScheduler(client, intervalMs = 12 * 60 * 60 * 1000) {
  if (!client || client.__goliathRoleSchedulerStarted) {
    return null;
  }

  client.__goliathRoleSchedulerStarted = true;

  const run = () => {
    runTimedRoleChecksForClient(client).catch((error) => {
      console.error('[RoleManager] Timed role check failed:', error);
    });
  };

  const timer = setInterval(run, intervalMs);
  timer.unref?.();

  setTimeout(run, 30 * 1000).unref?.();

  return timer;
}

module.exports = {
  CUSTOM_ID_PREFIX,
  ROLE_MODES,
  MAX_PANEL_ROLES,
  parseToggleCustomId,
  buildToggleCustomId,
  buildPanelEmbed,
  buildPanelComponents,
  canManageRoles,
  validateRoleSafety,
  applyRoleToggle,
  createReactionPanel,
  attachPanelToMessage,
  refreshPanelMessage,
  applyTimedRoleRule,
  runTimedRoleChecks,
  runTimedRoleChecksForClient,
  startTimedRoleScheduler,
};
