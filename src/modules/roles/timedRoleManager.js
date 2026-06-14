const roleStore = require('./roleStore');

function getRoleConfig(guildId, client) {
  if (typeof roleStore.loadRoleData === 'function') {
    return roleStore.loadRoleData(guildId, client);
  }

  if (typeof roleStore.loadRoles === 'function') {
    return roleStore.loadRoles(guildId, client);
  }

  return { timedRoles: [] };
}

function saveRoleConfig(guildId, data, client) {
  if (typeof roleStore.saveRoleData === 'function') {
    return roleStore.saveRoleData(guildId, data, client);
  }

  if (typeof roleStore.saveRoles === 'function') {
    return roleStore.saveRoles(guildId, data, client);
  }

  return data;
}

function canManageRole(guild, role) {
  const botMember = guild?.members?.me;
  if (!botMember || !role) return false;

  return botMember.roles.highest.position > role.position && !role.managed;
}

function getMembershipDays(member) {
  if (!member?.joinedTimestamp) return 0;
  return Math.floor((Date.now() - member.joinedTimestamp) / 86400000);
}

function normaliseTimedRole(input = {}) {
  return {
    id: input.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    enabled: input.enabled !== false,
    roleId: input.roleId,
    daysRequired: Math.max(1, Number(input.daysRequired || 30)),
    removeRoleIds: Array.isArray(input.removeRoleIds) ? input.removeRoleIds : [],
    createdBy: input.createdBy || null,
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function addTimedRoleRule(guildId, input, client) {
  const data = getRoleConfig(guildId, client);

  data.timedRoles = Array.isArray(data.timedRoles) ? data.timedRoles : [];
  data.timedRoles.push(normaliseTimedRole(input));

  saveRoleConfig(guildId, data, client);
  return data.timedRoles[data.timedRoles.length - 1];
}

function removeTimedRoleRule(guildId, ruleId, client) {
  const data = getRoleConfig(guildId, client);
  data.timedRoles = Array.isArray(data.timedRoles) ? data.timedRoles : [];

  const before = data.timedRoles.length;
  data.timedRoles = data.timedRoles.filter((rule) => rule.id !== ruleId);

  saveRoleConfig(guildId, data, client);
  return before !== data.timedRoles.length;
}

async function applyTimedRoleRule(member, rule) {
  if (!member || !rule?.enabled || !rule.roleId) return null;

  const membershipDays = getMembershipDays(member);
  if (membershipDays < Number(rule.daysRequired || 30)) return null;

  const role = member.guild.roles.cache.get(rule.roleId);
  if (!canManageRole(member.guild, role)) return null;

  const result = {
    roleId: rule.roleId,
    added: false,
    removed: [],
    membershipDays,
  };

  if (!member.roles.cache.has(rule.roleId)) {
    await member.roles.add(rule.roleId, `Goliath timed role: ${rule.daysRequired} day requirement met`);
    result.added = true;
  }

  for (const removeRoleId of rule.removeRoleIds || []) {
    const removeRole = member.guild.roles.cache.get(removeRoleId);

    if (
      removeRole &&
      canManageRole(member.guild, removeRole) &&
      member.roles.cache.has(removeRoleId)
    ) {
      await member.roles.remove(removeRoleId, 'Goliath timed role cleanup');
      result.removed.push(removeRoleId);
    }
  }

  return result.added || result.removed.length ? result : null;
}

async function runTimedRolesForGuild(guild, client) {
  if (!guild) {
    return { checkedMembers: 0, appliedRoles: 0, rules: 0 };
  }

  const data = getRoleConfig(guild.id, client);
  const rules = Array.isArray(data.timedRoles)
    ? data.timedRoles.filter((rule) => rule.enabled !== false)
    : [];

  if (!rules.length) {
    return { checkedMembers: 0, appliedRoles: 0, rules: 0 };
  }

  const members = await guild.members.fetch().catch(() => null);
  if (!members) {
    return { checkedMembers: 0, appliedRoles: 0, rules: rules.length };
  }

  let appliedRoles = 0;

  for (const member of members.values()) {
    if (member.user?.bot) continue;

    for (const rule of rules) {
      const result = await applyTimedRoleRule(member, rule).catch(() => null);
      if (result) appliedRoles += 1;
    }
  }

  return {
    checkedMembers: members.size,
    appliedRoles,
    rules: rules.length,
  };
}

async function runTimedRoles(client) {
  const summary = {
    guilds: 0,
    checkedMembers: 0,
    appliedRoles: 0,
    rules: 0,
  };

  for (const guild of client.guilds.cache.values()) {
    const result = await runTimedRolesForGuild(guild, client);

    summary.guilds += 1;
    summary.checkedMembers += result.checkedMembers;
    summary.appliedRoles += result.appliedRoles;
    summary.rules += result.rules;
  }

  return summary;
}

module.exports = {
  addTimedRoleRule,
  removeTimedRoleRule,
  runTimedRolesForGuild,
  runTimedRoles,
  getMembershipDays,
};
