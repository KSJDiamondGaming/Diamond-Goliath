'use strict';

const { ChannelType, PermissionFlagsBits, PermissionsBitField } = require('discord.js');

const DEFAULT_BOT_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
];

const MANAGE_CHANNEL_PERMISSIONS = [
  ...DEFAULT_BOT_CHANNEL_PERMISSIONS,
  PermissionFlagsBits.ManageChannels,
];

const TICKET_CHANNEL_PERMISSIONS = [
  ...MANAGE_CHANNEL_PERMISSIONS,
  PermissionFlagsBits.ManageMessages,
];

class GoliathPermissionError extends Error {
  constructor(message, details = {}) {
    super(message || 'Goliath permission validation failed.');
    this.name = 'GoliathPermissionError';
    this.code = 'GOLIATH_PERMISSION_GUARD_FAILED';
    this.details = details;
  }
}

function unique(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).filter(Boolean).map(String))];
}

function normalisePermissions(permissions = []) {
  return (Array.isArray(permissions) ? permissions : [permissions]).filter(Boolean);
}

function permissionLabel(permission) {
  const key = new PermissionsBitField(permission).toArray()[0];
  return key || String(permission);
}

function getBotId(guild) {
  return guild?.members?.me?.id || guild?.client?.user?.id || null;
}

async function getBotMember(guild) {
  if (!guild) return null;
  if (guild.members?.me) return guild.members.me;
  const fetched = await guild.members.fetchMe().catch(() => null);
  return fetched || guild.members?.me || null;
}

async function getBotHighestRole(guild) {
  const botMember = await getBotMember(guild);
  return botMember?.roles?.highest || null;
}

async function fetchRole(guild, roleId) {
  if (!guild || !roleId) return null;
  const id = String(roleId);
  return guild.roles?.cache?.get(id) || guild.roles?.fetch?.(id).catch(() => null) || null;
}

async function fetchChannel(guild, channelId) {
  if (!guild || !channelId) return null;
  const id = String(channelId);
  return guild.channels?.cache?.get(id) || guild.channels?.fetch?.(id).catch(() => null) || null;
}

async function canManageRole(guild, roleId) {
  const role = await fetchRole(guild, roleId);
  const botMember = await getBotMember(guild);
  const highestRole = botMember?.roles?.highest || null;

  if (!role) {
    return { ok: false, roleId: String(roleId || ''), reason: 'role_not_found', message: 'The selected role could not be found in this server.' };
  }

  if (!botMember) {
    return { ok: false, roleId: role.id, roleName: role.name, reason: 'bot_member_not_found', message: 'Goliath could not read its own server member profile.' };
  }

  if (role.managed) {
    return { ok: false, roleId: role.id, roleName: role.name, reason: 'managed_role', message: `The role @${role.name} is managed by an integration and cannot be assigned manually.` };
  }

  if (role.id === guild.id) {
    return { ok: false, roleId: role.id, roleName: role.name, reason: 'everyone_role', message: 'The @everyone role cannot be managed as a normal assignable role.' };
  }

  if (!botMember.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, roleId: role.id, roleName: role.name, reason: 'missing_manage_roles', message: 'Goliath is missing the Manage Roles permission.' };
  }

  if (!highestRole || Number(role.position || 0) >= Number(highestRole.position || 0)) {
    return {
      ok: false,
      roleId: role.id,
      roleName: role.name,
      reason: 'role_hierarchy',
      message: `Goliath can read @${role.name}, but cannot manage it because it is above or equal to Goliath's highest role.`,
      fix: 'Move the Goliath bot role above this role in Server Settings > Roles.',
    };
  }

  return { ok: true, roleId: role.id, roleName: role.name };
}

async function validateRoleSelection(guild, roleIds = [], options = {}) {
  const ids = unique(roleIds);
  const requireManageable = options.requireManageable !== false;
  const failures = [];
  const roles = [];

  for (const roleId of ids) {
    const role = await fetchRole(guild, roleId);

    if (!role) {
      failures.push({ type: 'role', roleId, reason: 'role_not_found', message: 'The selected role could not be found in this server.' });
      continue;
    }

    roles.push({ id: role.id, name: role.name, position: role.position });

    if (!requireManageable) continue;

    const result = await canManageRole(guild, role.id);
    if (!result.ok) failures.push({ type: 'role', ...result });
  }

  return buildGuardResult({ scope: options.scope || 'roles', guild, ok: failures.length === 0, failures, metadata: { roles } });
}

async function validateChannelAccess(guild, channelId, requiredPermissions = DEFAULT_BOT_CHANNEL_PERMISSIONS, options = {}) {
  const channel = await fetchChannel(guild, channelId);
  const botMember = await getBotMember(guild);
  const permissions = normalisePermissions(requiredPermissions);

  if (!channel) {
    return buildGuardResult({
      scope: options.scope || 'channel',
      guild,
      channelId: String(channelId || ''),
      ok: false,
      failures: [{ type: 'channel', channelId: String(channelId || ''), reason: 'channel_not_found', message: 'The selected channel/category could not be found.', fix: 'Choose an existing channel/category or refresh the dashboard/server setup.' }],
    });
  }

  if (!botMember) {
    return buildGuardResult({
      scope: options.scope || 'channel',
      guild,
      channel,
      ok: false,
      failures: [{ type: 'guild', reason: 'bot_member_not_found', message: 'Goliath could not read its own server member profile.' }],
    });
  }

  const channelPermissions = channel.permissionsFor(botMember);
  const failures = permissions
    .filter((permission) => !channelPermissions?.has(permission))
    .map((permission) => ({
      type: 'permission',
      channelId: channel.id,
      channelName: channel.name,
      permissionName: permissionLabel(permission),
      reason: 'missing_channel_permission',
      message: `Goliath is missing ${permissionLabel(permission)} in ${formatChannel(channel)}.`,
      fix: `Give Goliath ${permissionLabel(permission)} in ${formatChannel(channel)} or its parent category.`,
    }));

  return buildGuardResult({
    scope: options.scope || 'channel',
    guild,
    channel,
    ok: failures.length === 0,
    failures,
    metadata: { requiredPermissions: permissions.map(permissionLabel), channelType: channel.type },
  });
}

async function validateCategoryAccess(guild, categoryId, requiredPermissions = MANAGE_CHANNEL_PERMISSIONS, options = {}) {
  const result = await validateChannelAccess(guild, categoryId, requiredPermissions, { ...options, scope: options.scope || 'category' });
  const category = result.channel || await fetchChannel(guild, categoryId);

  if (result.ok && category?.type !== ChannelType.GuildCategory) {
    return buildGuardResult({
      scope: options.scope || 'category',
      guild,
      channel: category,
      ok: false,
      failures: [{ type: 'category', channelId: category?.id || String(categoryId || ''), channelName: category?.name || null, reason: 'not_category', message: 'The selected target is not a Discord category.', fix: 'Choose a valid category for this setup.' }],
    });
  }

  return result;
}

function permissionsToOverwritePayload(permissions = [], allow = true) {
  const payload = {};

  for (const permission of normalisePermissions(permissions)) {
    const resolved = new PermissionsBitField(permission).toArray()[0];
    if (resolved) payload[resolved] = allow;
  }

  return payload;
}

async function syncBotToChannel(guild, channelId, permissions = TICKET_CHANNEL_PERMISSIONS, options = {}) {
  const channel = await fetchChannel(guild, channelId);
  const botMember = await getBotMember(guild);
  const botId = botMember?.id || getBotId(guild);

  if (!channel || !botId) {
    return buildGuardResult({
      scope: options.scope || 'sync_channel',
      guild,
      channelId,
      ok: false,
      failures: [{ type: 'sync', reason: !channel ? 'channel_not_found' : 'bot_member_not_found', message: !channel ? 'The selected channel/category could not be found.' : 'Goliath could not read its own server member profile.' }],
    });
  }

  const requiredPermissions = normalisePermissions(permissions);
  await channel.permissionOverwrites.edit(botId, permissionsToOverwritePayload(requiredPermissions, true), {
    reason: options.reason || 'Goliath Permission Guard sync',
  });

  return validateChannelAccess(guild, channel.id, requiredPermissions, { scope: options.scope || 'sync_channel' });
}

async function syncBotToCategory(guild, categoryId, permissions = TICKET_CHANNEL_PERMISSIONS, options = {}) {
  const category = await fetchChannel(guild, categoryId);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return buildGuardResult({
      scope: options.scope || 'sync_category',
      guild,
      channel: category,
      channelId: String(categoryId || ''),
      ok: false,
      failures: [{ type: 'category', reason: !category ? 'category_not_found' : 'not_category', message: !category ? 'The selected category could not be found.' : 'The selected target is not a Discord category.' }],
    });
  }

  return syncBotToChannel(guild, category.id, permissions, { ...options, scope: options.scope || 'sync_category' });
}

async function guardChannelAccess(guild, channelId, requiredPermissions = DEFAULT_BOT_CHANNEL_PERMISSIONS, options = {}) {
  const result = await validateChannelAccess(guild, channelId, requiredPermissions, options);

  if (!result.ok && options.autoFix === true) {
    const syncResult = await syncBotToChannel(guild, channelId, requiredPermissions, options).catch((error) => buildGuardResult({
      scope: options.scope || 'channel',
      guild,
      channelId,
      ok: false,
      failures: [{ type: 'sync', reason: 'sync_failed', message: 'Goliath tried to repair its permissions but Discord rejected the update.', error: error.message, fix: 'Move the Goliath bot role higher and give it permission to manage the selected channel/category.' }],
    }));

    if (syncResult.ok) return syncResult;
  }

  if (!result.ok && options.throwOnFail !== false) throw result.toError();
  return result;
}

async function guardCategoryAccess(guild, categoryId, requiredPermissions = MANAGE_CHANNEL_PERMISSIONS, options = {}) {
  const result = await validateCategoryAccess(guild, categoryId, requiredPermissions, options);

  if (!result.ok && options.autoFix === true) {
    const syncResult = await syncBotToCategory(guild, categoryId, requiredPermissions, options).catch((error) => buildGuardResult({
      scope: options.scope || 'category',
      guild,
      channelId: categoryId,
      ok: false,
      failures: [{ type: 'sync', reason: 'sync_failed', message: 'Goliath tried to repair its category permissions but Discord rejected the update.', error: error.message, fix: 'Move the Goliath bot role higher and give it permission to manage the selected category.' }],
    }));

    if (syncResult.ok) return syncResult;
  }

  if (!result.ok && options.throwOnFail !== false) throw result.toError();
  return result;
}

async function validateTicketDeployment(guild, config = {}) {
  const failures = [];
  const categoryIds = unique([
    config.categoryId,
    config.outputCategoryId,
    config.archiveCategoryId,
    config.panel?.outputCategoryId,
    config.panel?.archiveCategoryId,
  ]);

  for (const categoryId of categoryIds) {
    const result = await validateCategoryAccess(guild, categoryId, TICKET_CHANNEL_PERMISSIONS, { scope: 'ticket_deployment' });
    if (!result.ok) failures.push(...result.failures);
  }

  const roleIds = unique([
    ...(config.staffRoleIds || []),
    ...(config.managerRoleIds || []),
    ...(config.viewerRoleIds || []),
    ...(config.panel?.staffRoleIds || []),
    ...(config.panel?.managerRoleIds || []),
    ...(config.panel?.viewerRoleIds || []),
  ]);

  if (roleIds.length) {
    const roleResult = await validateRoleSelection(guild, roleIds, { scope: 'ticket_roles', requireManageable: false });
    if (!roleResult.ok) failures.push(...roleResult.failures);
  }

  return buildGuardResult({ scope: 'ticket_deployment', guild, ok: failures.length === 0, failures, metadata: { categoryIds, roleIds } });
}

function formatChannel(channel) {
  if (!channel) return 'the selected channel/category';
  if (channel.type === ChannelType.GuildCategory) return `category "${channel.name}"`;
  return `#${channel.name}`;
}

function buildUserMessage(result = {}) {
  const target = result.channel ? formatChannel(result.channel) : 'the selected Discord target';
  const missing = unique((result.failures || []).map((failure) => failure.permissionName || failure.message).filter(Boolean));
  const fixes = unique((result.failures || []).map((failure) => failure.fix).filter(Boolean));

  const lines = ['❌ Goliath cannot complete this action.', `I do not have the required access for ${target}.`];

  if (missing.length) {
    lines.push('', 'Missing / blocked:');
    for (const item of missing.slice(0, 10)) lines.push(`- ${item}`);
  }

  lines.push('', 'Fix:');

  if (fixes.length) {
    for (const fix of fixes.slice(0, 5)) lines.push(`- ${fix}`);
  } else {
    lines.push('- Move the Goliath bot role higher and give Goliath access to the selected channel/category/role.');
  }

  return lines.join('\n');
}

function buildGuardResult({ scope, guild, channel, channelId, ok, failures = [], metadata = {} } = {}) {
  const result = {
    ok: Boolean(ok),
    scope: scope || 'global',
    guildId: guild?.id || null,
    channelId: channel?.id || channelId || null,
    channelName: channel?.name || null,
    channel,
    failures,
    missingPermissions: unique(failures.map((failure) => failure.permissionName).filter(Boolean)),
    metadata,
  };

  result.message = result.ok ? 'Goliath has the required access.' : buildUserMessage(result);

  result.toJSON = () => ({
    ok: result.ok,
    scope: result.scope,
    guildId: result.guildId,
    channelId: result.channelId,
    channelName: result.channelName,
    failures: result.failures,
    missingPermissions: result.missingPermissions,
    metadata: result.metadata,
    message: result.message,
  });

  result.toError = () => new GoliathPermissionError(result.message, result.toJSON());
  return result;
}

function isGoliathPermissionError(error) {
  return error?.code === 'GOLIATH_PERMISSION_GUARD_FAILED' || error instanceof GoliathPermissionError;
}

module.exports = {
  DEFAULT_BOT_CHANNEL_PERMISSIONS,
  MANAGE_CHANNEL_PERMISSIONS,
  TICKET_CHANNEL_PERMISSIONS,
  GoliathPermissionError,
  isGoliathPermissionError,
  getBotId,
  getBotMember,
  getBotHighestRole,
  canManageRole,
  validateRoleSelection,
  validateChannelAccess,
  validateCategoryAccess,
  validateTicketDeployment,
  guardChannelAccess,
  guardCategoryAccess,
  syncBotToChannel,
  syncBotToCategory,
  permissionLabel,
  permissionsToOverwritePayload,
  buildGuardResult,
};
