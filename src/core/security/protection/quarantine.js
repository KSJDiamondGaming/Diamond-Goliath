'use strict';

const { ChannelType, PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const { shouldBlockOwnerDestructiveAction } = require('../../../owner/dev/DevOverrideManager');
const { canManageTargetMember } = require('./core');
const schedulerRegistry = require('../../../owner/sentinel/schedulerRegistry');
const { emitGuildUpdate } = require('../../../server/sockets/socketHub');

const DEFAULT_QUARANTINE_ROLE_NAME = 'Goliath Quarantine';
const DEFAULT_INVESTIGATION_CATEGORY_NAME = 'Goliath Investigations';
const QUARANTINE_MODES = Object.freeze({
  INVESTIGATION: 'investigation',
  SECURITY: 'security',
});
const QUARANTINE_SWEEP_INTERVAL_MS = 60_000;
const QUARANTINE_SCHEDULER_ID = 'security:quarantine-expiry:global';
const MAX_ARCHIVED_INVESTIGATION_ROOMS = 50;
let quarantineSweepTimer = null;

function emptyQuarantineState() {
  return {
    enabled: true,
    roleId: null,
    roleName: DEFAULT_QUARANTINE_ROLE_NAME,
    isolationSyncedAt: null,
    investigationCategoryId: null,
    investigationCategoryName: DEFAULT_INVESTIGATION_CATEGORY_NAME,
    archivedRooms: [],
    users: {},
  };
}

function normalizeUsers(users) {
  return users && typeof users === 'object' && !Array.isArray(users) ? users : {};
}

function normalizeArchivedRooms(value) {
  return Array.isArray(value) ? value.slice(-MAX_ARCHIVED_INVESTIGATION_ROOMS) : [];
}

function getQuarantineState(guildId) {
  const security = guildManager.getSecurityConfig(guildId) || {};
  const raw = security.quarantine && typeof security.quarantine === 'object' && !Array.isArray(security.quarantine)
    ? security.quarantine
    : {};
  return {
    ...emptyQuarantineState(),
    ...raw,
    archivedRooms: normalizeArchivedRooms(raw.archivedRooms),
    users: normalizeUsers(raw.users),
  };
}

function saveQuarantineState(guild, state) {
  const normalized = {
    ...emptyQuarantineState(),
    ...(state || {}),
    archivedRooms: normalizeArchivedRooms(state?.archivedRooms),
    users: normalizeUsers(state?.users),
  };
  return guildManager.updateSecurityConfig(
    guild.id,
    (security) => ({ ...security, quarantine: normalized }),
    guild
  );
}

function emitCurrentQuarantineState(guild, action, extra = {}) {
  try {
    emitGuildUpdate(guild.id, {
      module: 'security',
      event: 'security.quarantine.updated',
      data: {
        action,
        quarantine: getQuarantineState(guild.id),
        ...extra,
      },
    });
  } catch (error) {
    console.warn('[QuarantineSystem] Failed to emit quarantine update:', error.message);
  }
}

function cleanRoleName(value) {
  const name = String(value || '').trim().slice(0, 100);
  return name || DEFAULT_QUARANTINE_ROLE_NAME;
}

function cleanCategoryName(value) {
  const name = String(value || '').trim().slice(0, 100);
  return name || DEFAULT_INVESTIGATION_CATEGORY_NAME;
}

function cleanChannelName(value) {
  const safe = String(value || 'member')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 56);
  return safe || 'member';
}

function resolveRequestedMode(options = {}) {
  const requested = String(options.mode || '').trim().toLowerCase();
  if (requested === QUARANTINE_MODES.SECURITY) return QUARANTINE_MODES.SECURITY;
  if (requested === QUARANTINE_MODES.INVESTIGATION) return QUARANTINE_MODES.INVESTIGATION;
  if (String(options.source || '').toLowerCase() === 'anti_nuke' || String(options.quarantinedBy || '').toLowerCase() === 'anti_nuke') {
    return QUARANTINE_MODES.SECURITY;
  }
  return QUARANTINE_MODES.INVESTIGATION;
}

function getQuarantineMode(snapshot = {}) {
  const value = String(snapshot?.mode || '').trim().toLowerCase();
  if (value === QUARANTINE_MODES.INVESTIGATION) return QUARANTINE_MODES.INVESTIGATION;
  if (value === QUARANTINE_MODES.SECURITY) return QUARANTINE_MODES.SECURITY;
  // Legacy snapshots pre-date investigation isolation and were full containment.
  return QUARANTINE_MODES.SECURITY;
}

function isAutomatedSecurityRequest(options = {}) {
  return options.system === true
    || String(options.source || '').toLowerCase() === 'anti_nuke'
    || String(options.quarantinedBy || '').toLowerCase() === 'anti_nuke';
}

function canManuallyUseSecurityIsolation(guild, options = {}) {
  if (isAutomatedSecurityRequest(options)) return true;
  return Boolean(guild?.ownerId && options.quarantinedBy && String(guild.ownerId) === String(options.quarantinedBy));
}

function resolveConfiguredRoleName(guildId, options = {}) {
  const antiNuke = guildManager.getGuildSection(guildId, 'antiNuke', {}) || {};
  const state = getQuarantineState(guildId);
  return cleanRoleName(
    options.roleName
    || antiNuke?.quarantine?.roleName
    || state.roleName
    || DEFAULT_QUARANTINE_ROLE_NAME
  );
}

async function ensureQuarantineRole(guild, options = {}) {
  if (!guild) throw new Error('Missing guild.');
  const state = getQuarantineState(guild.id);
  const roleName = resolveConfiguredRoleName(guild.id, options);
  let role = state.roleId ? guild.roles.cache.get(String(state.roleId)) : null;
  if (!role) role = guild.roles.cache.find((entry) => entry.name === roleName) || null;

  if (!role) {
    role = await guild.roles.create({
      name: roleName,
      color: 0x991b1b,
      permissions: [],
      reason: 'Goliath quarantine containment role',
    });
  } else if (!role.managed && role.name !== roleName) {
    await role.setName(roleName, 'Synchronising Goliath quarantine role configuration').catch(() => null);
  }

  if (role.managed) throw new Error('Configured quarantine role is managed by an integration.');

  if (state.roleId !== role.id || state.roleName !== role.name) {
    saveQuarantineState(guild, { ...state, roleId: role.id, roleName: role.name });
  }
  return role;
}

function quarantineDenyOverwrite() {
  return {
    ViewChannel: false,
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false,
    AddReactions: false,
    UseApplicationCommands: false,
    Connect: false,
    Speak: false,
    Stream: false,
  };
}

function investigationMemberOverwrite() {
  return {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
    AddReactions: true,
  };
}

function investigationStaffOverwrite() {
  return {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
    EmbedLinks: true,
    ManageMessages: true,
  };
}

async function syncQuarantineIsolation(guild, options = {}) {
  if (!guild) return { success: false, reason: 'Missing guild.', updated: 0, failed: 0 };
  const botMember = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { success: false, reason: 'Goliath is missing Manage Roles.', updated: 0, failed: 0 };
  }
  if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return { success: false, reason: 'Goliath is missing Manage Channels.', updated: 0, failed: 0 };
  }

  let role;
  try {
    role = options.role || await ensureQuarantineRole(guild, options);
  } catch (error) {
    return { success: false, reason: error.message, updated: 0, failed: 0 };
  }

  const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
  let updated = 0;
  let failed = 0;
  const failures = [];

  for (const [, channel] of channels || []) {
    if (!channel?.permissionOverwrites?.edit || channel.isThread?.()) continue;
    try {
      await channel.permissionOverwrites.edit(
        role.id,
        quarantineDenyOverwrite(),
        { reason: 'Goliath quarantine isolation policy' }
      );
      updated += 1;
    } catch (error) {
      failed += 1;
      failures.push({ channelId: channel.id, channelName: channel.name || null, error: String(error?.message || error).slice(0, 250) });
    }
  }

  const state = getQuarantineState(guild.id);
  saveQuarantineState(guild, {
    ...state,
    roleId: role.id,
    roleName: role.name,
    isolationSyncedAt: Date.now(),
  });

  if (failed) {
    console.warn(`[QuarantineSystem] Isolation sync incomplete in ${guild.id}: ${failed} channel(s) failed.`);
  }
  return { success: failed === 0, roleId: role.id, roleName: role.name, updated, failed, failures };
}

function getInvestigationStaffRoleIds(guild, options = {}) {
  const explicit = Array.isArray(options.staffRoleIds) ? options.staffRoleIds.map(String) : [];
  const selected = new Set(explicit);
  const staffPermissions = [
    PermissionFlagsBits.Administrator,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
  ];
  for (const role of guild.roles.cache.values()) {
    if (role.id === guild.id || role.managed) continue;
    if (staffPermissions.some((permission) => role.permissions.has(permission))) selected.add(String(role.id));
  }
  return [...selected].filter((roleId) => guild.roles.cache.has(roleId)).slice(0, 80);
}

async function ensureInvestigationCategory(guild, options = {}) {
  if (!guild) throw new Error('Missing guild.');
  const state = getQuarantineState(guild.id);
  const categoryName = cleanCategoryName(options.categoryName || state.investigationCategoryName);
  let category = state.investigationCategoryId ? guild.channels.cache.get(String(state.investigationCategoryId)) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    category = guild.channels.cache.find((channel) => channel.type === ChannelType.GuildCategory && channel.name === categoryName) || null;
  }
  if (!category) {
    category = await guild.channels.create({
      name: categoryName,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      ],
      reason: 'Goliath investigation isolation category',
    });
  }
  if (state.investigationCategoryId !== category.id || state.investigationCategoryName !== category.name) {
    saveQuarantineState(guild, {
      ...state,
      investigationCategoryId: category.id,
      investigationCategoryName: category.name,
    });
  }
  return category;
}

async function buildInvestigationRoomOverwrites(guild, member, quarantineRole, options = {}) {
  const botMember = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  if (!botMember) throw new Error('Goliath guild member is unavailable.');
  const overwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    { id: quarantineRole.id, deny: Object.entries(quarantineDenyOverwrite()).filter(([, value]) => value === false).map(([name]) => PermissionFlagsBits[name]).filter(Boolean) },
    { id: member.id, allow: Object.entries(investigationMemberOverwrite()).filter(([, value]) => value === true).map(([name]) => PermissionFlagsBits[name]).filter(Boolean) },
    {
      id: botMember.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ],
    },
  ];

  if (guild.ownerId && guild.ownerId !== member.id && guild.ownerId !== botMember.id) {
    overwrites.push({
      id: guild.ownerId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages],
    });
  }

  for (const roleId of getInvestigationStaffRoleIds(guild, options)) {
    if (roleId === quarantineRole.id) continue;
    overwrites.push({
      id: roleId,
      allow: Object.entries(investigationStaffOverwrite()).filter(([, value]) => value === true).map(([name]) => PermissionFlagsBits[name]).filter(Boolean),
    });
  }
  return overwrites.slice(0, 95);
}

async function createInvestigationRoom(guild, member, quarantineRole, options = {}) {
  const category = await ensureInvestigationCategory(guild, options);
  const suffix = String(member.id).slice(-6);
  const channel = await guild.channels.create({
    name: `investigation-${cleanChannelName(member.user?.username || member.displayName)}-${suffix}`.slice(0, 100),
    type: ChannelType.GuildText,
    parent: category.id,
    topic: `Goliath investigation isolation • Member ${member.id} • ${String(options.reason || 'No reason provided').slice(0, 700)}`,
    permissionOverwrites: await buildInvestigationRoomOverwrites(guild, member, quarantineRole, options),
    reason: `Goliath investigation isolation for ${member.user?.tag || member.id}`,
  });

  await channel.send({
    content: [
      `🔒 **Investigation Isolation** • ${member}`,
      '',
      'Your normal server access has been temporarily isolated while staff review this matter.',
      'You can use **this private room only** to speak with authorised staff during the investigation.',
      '',
      `**Reason:** ${String(options.reason || 'No reason provided').slice(0, 1000)}`,
      '',
      'This is an investigation hold, not a full Security Isolation. Please keep discussion relevant to the review.',
    ].join('\n'),
    allowedMentions: { users: [member.id], roles: [], repliedUser: false },
  }).catch((error) => console.warn(`[QuarantineSystem] Failed to send investigation room intro in ${guild.id}:`, error.message));

  return channel;
}

async function ensureInvestigationRoomForSnapshot(guild, member, role, snapshot, options = {}) {
  let channel = snapshot?.interviewChannelId ? guild.channels.cache.get(String(snapshot.interviewChannelId)) : null;
  if (!channel && snapshot?.interviewChannelId) channel = await guild.channels.fetch(String(snapshot.interviewChannelId)).catch(() => null);
  if (!channel) {
    channel = await createInvestigationRoom(guild, member, role, { ...options, reason: snapshot?.reason || options.reason });
    const state = getQuarantineState(guild.id);
    if (state.users?.[member.id]) {
      state.users[member.id].interviewChannelId = channel.id;
      saveQuarantineState(guild, state);
    }
  } else {
    await channel.permissionOverwrites.edit(role.id, quarantineDenyOverwrite(), { reason: 'Reasserting investigation quarantine role isolation' });
    await channel.permissionOverwrites.edit(member.id, investigationMemberOverwrite(), { reason: 'Restoring investigation interview access' });
  }
  return channel;
}

function createQuarantineDryRunResult(guild, member, options = {}) {
  const snapshotRoles = member.roles.cache
    .filter((role) => role.id !== guild.id)
    .map((role) => role.id);
  const mode = resolveRequestedMode(options);

  emitCurrentQuarantineState(guild, 'member_quarantine_dry_run', {
    memberId: member.id,
    mode,
    testMode: true,
    dryRun: true,
  });

  console.log(`[TEST MODE] Quarantine prevented for owner ${member.user?.tag || member.id} in guild ${guild.id}`);
  return {
    success: true,
    testMode: true,
    dryRun: true,
    action: 'quarantine',
    executed: false,
    mode,
    roleId: null,
    interviewChannelId: null,
    snapshotRoles,
    memberId: member.id,
    memberTag: member.user?.tag || null,
    reason: options.reason || 'Development test override prevented owner quarantine.',
  };
}

async function escalateInvestigationToSecurity(guild, member, existing, options = {}) {
  const state = getQuarantineState(guild.id);
  try {
    let interviewChannel = existing.interviewChannelId ? guild.channels.cache.get(String(existing.interviewChannelId)) : null;
    if (!interviewChannel && existing.interviewChannelId) interviewChannel = await guild.channels.fetch(String(existing.interviewChannelId)).catch(() => null);
    if (interviewChannel?.permissionOverwrites?.edit) {
      await interviewChannel.permissionOverwrites.edit(member.id, {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false,
      }, { reason: 'Investigation escalated to full Security Isolation' }).catch(() => null);
      await interviewChannel.send({
        content: '🚨 This investigation hold has been escalated to **Full Security Isolation**. Member access to this room has been revoked.',
        allowedMentions: { parse: [] },
      }).catch(() => null);
    }
    state.users[member.id] = {
      ...existing,
      mode: QUARANTINE_MODES.SECURITY,
      reason: options.reason || existing.reason || 'Security isolation escalation',
      source: options.source || existing.source || 'security',
      quarantinedBy: options.quarantinedBy || existing.quarantinedBy || null,
      securityEscalatedAt: Date.now(),
      interviewChannelId: null,
      previousInterviewChannelId: existing.interviewChannelId || null,
      expiresAt: options.durationMs && Number(options.durationMs) > 0 ? Date.now() + Number(options.durationMs) : existing.expiresAt || null,
    };
    saveQuarantineState(guild, state);
    emitCurrentQuarantineState(guild, 'member_quarantine_escalated', { memberId: member.id, mode: QUARANTINE_MODES.SECURITY });
    return { success: true, escalated: true, mode: QUARANTINE_MODES.SECURITY, roleId: state.roleId, interviewChannelId: null };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function quarantineMember(guild, member, options = {}) {
  if (!guild || !member) return { success: false, reason: 'Missing guild/member' };
  const mode = resolveRequestedMode(options);

  if (mode === QUARANTINE_MODES.SECURITY && !canManuallyUseSecurityIsolation(guild, options)) {
    return { success: false, reason: 'Full Security Isolation can only be applied manually by the server owner.' };
  }

  if (shouldBlockOwnerDestructiveAction({ guild, member, action: 'quarantine' })) {
    return createQuarantineDryRunResult(guild, member, { ...options, mode });
  }

  const manageCheck = canManageTargetMember(guild, member);
  if (!manageCheck.allowed) return { success: false, reason: manageCheck.reason || 'Target cannot be managed by Goliath.' };

  const existing = getQuarantineState(guild.id).users?.[member.id];
  if (existing) {
    const existingMode = getQuarantineMode(existing);
    if (existingMode === QUARANTINE_MODES.INVESTIGATION && mode === QUARANTINE_MODES.SECURITY) {
      return escalateInvestigationToSecurity(guild, member, existing, options);
    }
    return { success: false, alreadyQuarantined: true, mode: existingMode, reason: 'Member is already quarantined.' };
  }

  let interviewRoom = null;
  let snapshotRoles = [];
  try {
    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role });
    if (!isolation.success) {
      return {
        success: false,
        mode,
        reason: `Quarantine isolation could not be guaranteed: ${isolation.reason || `${isolation.failed} channel(s) failed`}`,
        isolation,
      };
    }

    snapshotRoles = member.roles.cache
      .filter((entry) => entry.id !== guild.id && entry.id !== role.id)
      .map((entry) => entry.id);

    if (mode === QUARANTINE_MODES.INVESTIGATION) {
      try {
        interviewRoom = await createInvestigationRoom(guild, member, role, options);
      } catch (error) {
        return { success: false, mode, reason: `Investigation room could not be created: ${error.message}` };
      }
    }

    try {
      await member.roles.set([role.id], options.reason || 'Goliath quarantine applied.');
    } catch (error) {
      if (interviewRoom) await interviewRoom.delete('Rolling back failed investigation isolation').catch(() => null);
      throw error;
    }

    const state = getQuarantineState(guild.id);
    state.roleId = role.id;
    state.roleName = role.name;
    state.users[member.id] = {
      memberId: member.id,
      memberTag: member.user?.tag || null,
      mode,
      quarantinedAt: Date.now(),
      reason: options.reason || 'No reason provided',
      roles: snapshotRoles,
      quarantinedBy: options.quarantinedBy || null,
      source: options.source || (options.quarantinedBy === 'anti_nuke' ? 'anti_nuke' : 'moderation'),
      caseId: options.caseId || null,
      interviewChannelId: interviewRoom?.id || null,
      expiresAt: options.durationMs && Number(options.durationMs) > 0 ? Date.now() + Number(options.durationMs) : null,
    };
    try {
      saveQuarantineState(guild, state);
    } catch (error) {
      await member.roles.set(snapshotRoles, 'Rolling back failed quarantine state persistence').catch(() => null);
      if (interviewRoom) await interviewRoom.delete('Rolling back failed investigation state persistence').catch(() => null);
      throw error;
    }
    emitCurrentQuarantineState(guild, 'member_quarantined', { memberId: member.id, mode, interviewChannelId: interviewRoom?.id || null });
    return { success: true, mode, roleId: role.id, interviewChannelId: interviewRoom?.id || null, snapshotRoles, isolation };
  } catch (error) {
    return { success: false, mode, error: error.message };
  }
}

function attachQuarantineCase(guild, memberId, caseId) {
  if (!guild || !memberId || !caseId) return false;
  const state = getQuarantineState(guild.id);
  if (!state.users?.[String(memberId)]) return false;
  state.users[String(memberId)].caseId = Number(caseId);
  saveQuarantineState(guild, state);
  emitCurrentQuarantineState(guild, 'member_quarantine_case_linked', { memberId: String(memberId), caseId: Number(caseId) });
  return true;
}

async function getRestorableRoleIds(guild, snapshotRoleIds = [], quarantineRoleId = null) {
  await guild.roles.fetch().catch(() => null);
  const botMember = guild.members?.me || await guild.members.fetchMe().catch(() => null);
  const botHighest = Number(botMember?.roles?.highest?.position || 0);
  const restored = [];
  const skipped = [];

  for (const roleId of [...new Set((snapshotRoleIds || []).map(String))]) {
    const role = guild.roles.cache.get(roleId);
    if (!role) { skipped.push({ roleId, reason: 'role_missing' }); continue; }
    if (role.id === guild.id || role.id === quarantineRoleId) continue;
    if (role.managed) { skipped.push({ roleId, roleName: role.name, reason: 'managed_role' }); continue; }
    if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      skipped.push({ roleId, roleName: role.name, reason: 'missing_manage_roles' });
      continue;
    }
    if (Number(role.position || 0) >= botHighest) {
      skipped.push({ roleId, roleName: role.name, reason: 'role_hierarchy' });
      continue;
    }
    restored.push(role.id);
  }
  return { restored, skipped };
}

async function archiveInvestigationRoom(guild, snapshot, options = {}) {
  const channelId = snapshot?.interviewChannelId || snapshot?.previousInterviewChannelId || null;
  if (!channelId) return { success: true, archived: false, reason: 'No investigation room.' };
  let channel = guild.channels.cache.get(String(channelId));
  if (!channel) channel = await guild.channels.fetch(String(channelId)).catch(() => null);
  if (!channel) return { success: true, archived: false, missing: true, channelId: String(channelId) };

  try {
    await channel.send({
      content: `🔓 Investigation containment closed${snapshot.caseId ? ` • Case #${snapshot.caseId}` : ''}. The member's previous manageable roles have been restored.`,
      allowedMentions: { parse: [] },
    }).catch(() => null);
    if (snapshot.memberId && channel.permissionOverwrites?.edit) {
      await channel.permissionOverwrites.edit(String(snapshot.memberId), {
        ViewChannel: false,
        SendMessages: false,
        AddReactions: false,
      }, { reason: options.reason || 'Investigation isolation closed' });
    }
    const closedName = `closed-investigation-${String(snapshot.memberId || 'member').slice(-6)}-${Math.floor(Date.now() / 1000).toString(36)}`.slice(0, 100);
    await channel.setName(closedName, options.reason || 'Investigation isolation closed').catch(() => null);
    await channel.setTopic(`Closed Goliath investigation isolation • Member ${snapshot.memberId || 'unknown'}${snapshot.caseId ? ` • Case #${snapshot.caseId}` : ''}`, options.reason || 'Investigation isolation closed').catch(() => null);

    const state = getQuarantineState(guild.id);
    state.archivedRooms = normalizeArchivedRooms([
      ...(state.archivedRooms || []),
      {
        channelId: channel.id,
        memberId: snapshot.memberId || null,
        caseId: snapshot.caseId || null,
        closedAt: Date.now(),
        closedBy: options.restoredBy || options.closedBy || null,
      },
    ]);
    saveQuarantineState(guild, state);
    return { success: true, archived: true, channelId: channel.id };
  } catch (error) {
    return { success: false, archived: false, channelId: channel.id, error: error.message };
  }
}

async function restoreQuarantinedMember(guild, member, options = {}) {
  if (!guild || !member) return { success: false, reason: 'Missing guild/member' };
  const state = getQuarantineState(guild.id);
  const snapshot = state.users?.[member.id];
  if (!snapshot) return { success: false, reason: 'No quarantine snapshot' };
  const mode = getQuarantineMode(snapshot);

  if (mode === QUARANTINE_MODES.SECURITY && options.system !== true && String(options.restoredBy || '') !== String(guild.ownerId || '')) {
    return { success: false, mode, reason: 'Full Security Isolation can only be cleared manually by the server owner.' };
  }

  try {
    const quarantineRoleId = state.roleId || null;
    const roles = await getRestorableRoleIds(guild, snapshot.roles, quarantineRoleId);
    await member.roles.set(roles.restored, options.reason || 'Restoring quarantined member');
    const archive = mode === QUARANTINE_MODES.INVESTIGATION
      ? await archiveInvestigationRoom(guild, snapshot, options)
      : { success: true, archived: false };
    const latest = getQuarantineState(guild.id);
    delete latest.users[member.id];
    saveQuarantineState(guild, latest);
    emitCurrentQuarantineState(guild, 'member_restored', {
      memberId: member.id,
      mode,
      restoredRoles: roles.restored.length,
      skippedRoles: roles.skipped,
      archive,
    });
    return { success: true, mode, restoredRoles: roles.restored.length, restoredRoleIds: roles.restored, skippedRoles: roles.skipped, archive };
  } catch (error) {
    return { success: false, mode, error: error.message };
  }
}

async function clearExpiredAbsentMember(guild, userId, state) {
  const snapshot = state.users?.[userId];
  if (snapshot && getQuarantineMode(snapshot) === QUARANTINE_MODES.INVESTIGATION) {
    await archiveInvestigationRoom(guild, snapshot, { reason: 'Automatic investigation quarantine expiry while member absent', system: true });
  }
  const latest = getQuarantineState(guild.id);
  delete latest.users[userId];
  saveQuarantineState(guild, latest);
  emitCurrentQuarantineState(guild, 'member_quarantine_expired_absent', { memberId: userId, mode: snapshot ? getQuarantineMode(snapshot) : null });
}

async function restoreExpiredQuarantines(client) {
  if (!client) return { checked: 0, restored: 0, clearedAbsent: 0, failed: 0 };
  const result = { checked: 0, restored: 0, clearedAbsent: 0, failed: 0 };
  for (const [, guild] of client.guilds.cache) {
    try {
      let state = getQuarantineState(guild.id);
      for (const userId of Object.keys(state.users || {})) {
        const snapshot = state.users[userId];
        if (!snapshot?.expiresAt || Date.now() < Number(snapshot.expiresAt)) continue;
        result.checked += 1;
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
          await clearExpiredAbsentMember(guild, userId, state);
          result.clearedAbsent += 1;
          state = getQuarantineState(guild.id);
          continue;
        }
        console.log(`[QuarantineSystem] Auto restoring ${member.user.tag}`);
        const restored = await restoreQuarantinedMember(guild, member, { reason: 'Automatic quarantine expiry', system: true });
        if (restored.success) result.restored += 1;
        else result.failed += 1;
        state = getQuarantineState(guild.id);
      }
    } catch (error) {
      result.failed += 1;
      console.warn(`[QuarantineSystem] Failed restore cycle for guild ${guild.id}:`, error.message);
    }
  }
  return result;
}

async function enforceQuarantineOnMember(member, options = {}) {
  const guild = member?.guild;
  if (!guild || !member) return { success: false, reason: 'Missing guild/member' };
  const state = getQuarantineState(guild.id);
  const snapshot = state.users?.[member.id];
  if (!snapshot) return { success: false, notQuarantined: true, reason: 'No quarantine snapshot' };
  const mode = getQuarantineMode(snapshot);

  if (snapshot.expiresAt && Date.now() >= Number(snapshot.expiresAt)) {
    await clearExpiredAbsentMember(guild, member.id, state);
    return { success: true, mode, expired: true, executed: false };
  }

  try {
    const role = await ensureQuarantineRole(guild, options);
    const isolation = await syncQuarantineIsolation(guild, { ...options, role });
    if (!isolation.success) return { success: false, mode, reason: 'Quarantine isolation sync failed.', isolation };
    let interviewRoom = null;
    if (mode === QUARANTINE_MODES.INVESTIGATION) {
      interviewRoom = await ensureInvestigationRoomForSnapshot(guild, member, role, snapshot, options);
    }
    await member.roles.set([role.id], `Reapplying active Goliath ${mode} quarantine`);
    emitCurrentQuarantineState(guild, 'member_quarantine_reapplied', { memberId: member.id, mode, interviewChannelId: interviewRoom?.id || null });
    return { success: true, mode, roleId: role.id, interviewChannelId: interviewRoom?.id || null, isolation };
  } catch (error) {
    return { success: false, mode, error: error.message };
  }
}

async function recoverGuildQuarantine(guild) {
  if (!guild) return { success: false, reason: 'Missing guild.', active: 0, reapplied: 0, restored: 0, failed: 0 };
  const state = getQuarantineState(guild.id);
  const entries = Object.entries(state.users || {});
  if (!entries.length) return { success: true, active: 0, reapplied: 0, restored: 0, failed: 0 };

  const role = await ensureQuarantineRole(guild).catch((error) => {
    console.warn(`[QuarantineSystem] Failed to recover role in guild ${guild.id}:`, error.message);
    return null;
  });
  if (!role) return { success: false, reason: 'Quarantine role recovery failed.', active: entries.length, reapplied: 0, restored: 0, failed: entries.length };

  const isolation = await syncQuarantineIsolation(guild, { role });
  let reapplied = 0;
  let restored = 0;
  let failed = isolation.success ? 0 : 1;

  for (const [userId, snapshot] of entries) {
    const member = await guild.members.fetch(userId).catch(() => null);
    if (snapshot?.expiresAt && Date.now() >= Number(snapshot.expiresAt)) {
      if (member) {
        const result = await restoreQuarantinedMember(guild, member, { reason: 'Automatic quarantine expiry during startup recovery', system: true });
        if (result.success) restored += 1;
        else failed += 1;
      } else {
        const latest = getQuarantineState(guild.id);
        await clearExpiredAbsentMember(guild, userId, latest);
        restored += 1;
      }
      continue;
    }
    if (!member) continue;
    const result = await enforceQuarantineOnMember(member, { role });
    if (result.success) reapplied += 1;
    else failed += 1;
  }

  return { success: failed === 0, active: entries.length, reapplied, restored, failed, isolation };
}

async function recoverQuarantines(client) {
  if (!client) return { guilds: 0, active: 0, reapplied: 0, restored: 0, failed: 0 };
  const result = { guilds: 0, active: 0, reapplied: 0, restored: 0, failed: 0 };
  for (const [, guild] of client.guilds.cache) {
    const state = getQuarantineState(guild.id);
    if (!Object.keys(state.users || {}).length) continue;
    result.guilds += 1;
    try {
      const recovered = await recoverGuildQuarantine(guild);
      result.active += Number(recovered.active || 0);
      result.reapplied += Number(recovered.reapplied || 0);
      result.restored += Number(recovered.restored || 0);
      result.failed += Number(recovered.failed || 0);
    } catch (error) {
      result.failed += 1;
      console.warn(`[QuarantineSystem] Failed startup recovery for guild ${guild.id}:`, error.message);
    }
  }
  return result;
}

function startQuarantineExpiryScheduler(client) {
  if (!client) return null;
  if (quarantineSweepTimer) return quarantineSweepTimer;

  schedulerRegistry.register({
    id: QUARANTINE_SCHEDULER_ID,
    module: 'security',
    component: 'quarantine-expiry',
    intervalMs: QUARANTINE_SWEEP_INTERVAL_MS,
    staleAfterMs: QUARANTINE_SWEEP_INTERVAL_MS * 3,
  });

  const run = async (phase = 'scheduled') => {
    try {
      const result = await restoreExpiredQuarantines(client);
      schedulerRegistry.beat(QUARANTINE_SCHEDULER_ID, { phase, ...result });
    } catch (error) {
      schedulerRegistry.fail(QUARANTINE_SCHEDULER_ID, error, { phase });
      console.warn('[QuarantineSystem] Expiry scheduler failed:', error.message);
    }
  };

  run('startup');
  quarantineSweepTimer = setInterval(() => run('scheduled'), QUARANTINE_SWEEP_INTERVAL_MS);
  quarantineSweepTimer.unref?.();
  return quarantineSweepTimer;
}

function stopQuarantineExpiryScheduler() {
  if (quarantineSweepTimer) clearInterval(quarantineSweepTimer);
  quarantineSweepTimer = null;
  schedulerRegistry.stop(QUARANTINE_SCHEDULER_ID, 'quarantine expiry scheduler stopped');
}

module.exports = {
  DEFAULT_QUARANTINE_ROLE_NAME,
  DEFAULT_INVESTIGATION_CATEGORY_NAME,
  QUARANTINE_MODES,
  QUARANTINE_SWEEP_INTERVAL_MS,
  emptyQuarantineState,
  getQuarantineState,
  getQuarantineMode,
  saveQuarantineState,
  ensureQuarantineRole,
  ensureInvestigationCategory,
  syncQuarantineIsolation,
  quarantineMember,
  attachQuarantineCase,
  restoreQuarantinedMember,
  restoreExpiredQuarantines,
  enforceQuarantineOnMember,
  recoverGuildQuarantine,
  recoverQuarantines,
  startQuarantineExpiryScheduler,
  stopQuarantineExpiryScheduler,
};
