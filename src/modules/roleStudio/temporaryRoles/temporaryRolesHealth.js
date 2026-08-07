'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const temporaryRoles = require('./temporaryRoles');

const now = () => new Date().toISOString();

async function resolveMember(guild, memberId) {
  return guild.members.cache.get(memberId) || await guild.members.fetch(memberId).catch(() => null);
}

async function buildHealth(guild) {
  const section = temporaryRoles.getSection(guild.id);
  const assignments = temporaryRoles.listAssignments(guild.id);
  const issues = [];
  const warnings = [];
  const orphanedAssignmentIds = [];
  const expiredAssignmentIds = [];

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    issues.push('Goliath requires Manage Roles to assign and remove temporary roles.');
  }

  for (const assignment of assignments) {
    if (!assignment.memberId || !assignment.roleId || !assignment.expiresAt) {
      issues.push(`${assignment.assignmentId}: assignment data is incomplete.`);
      orphanedAssignmentIds.push(assignment.assignmentId);
      continue;
    }

    const role = guild.roles.cache.get(assignment.roleId) || await guild.roles.fetch(assignment.roleId).catch(() => null);
    const member = await resolveMember(guild, assignment.memberId);

    if (!member) {
      warnings.push(`${assignment.assignmentId}: member ${assignment.memberId} is no longer in the server.`);
      orphanedAssignmentIds.push(assignment.assignmentId);
    }

    if (!role) {
      warnings.push(`${assignment.assignmentId}: role ${assignment.roleId} no longer exists.`);
      orphanedAssignmentIds.push(assignment.assignmentId);
    } else if (role.managed || !me || role.position >= me.roles.highest.position) {
      issues.push(`${assignment.assignmentId}: role ${role.name} cannot be managed by Goliath.`);
    }

    const expiry = new Date(assignment.expiresAt).getTime();
    if (!Number.isFinite(expiry)) {
      issues.push(`${assignment.assignmentId}: expiry time is invalid.`);
      orphanedAssignmentIds.push(assignment.assignmentId);
    } else if (assignment.status === 'active' && expiry <= Date.now()) {
      expiredAssignmentIds.push(assignment.assignmentId);
    }

    if (assignment.status === 'failed' && assignment.lastError) {
      warnings.push(`${assignment.assignmentId}: ${assignment.lastError}`);
    }
  }

  return {
    healthy: issues.length === 0,
    enabled: guildManager.isModuleEnabled(guild.id, 'temporaryRoles'),
    assignments: assignments.length,
    activeAssignments: assignments.filter((item) => item.status === 'active').length,
    issues,
    warnings,
    orphanedAssignmentIds: [...new Set(orphanedAssignmentIds)],
    expiredAssignmentIds: [...new Set(expiredAssignmentIds)],
    checkedAt: now(),
  };
}

async function repair(guild, meta = {}) {
  const before = await buildHealth(guild);
  const section = temporaryRoles.getSection(guild.id);
  const assignments = { ...section.assignments };
  const archivedAssignmentIds = [];

  for (const assignmentId of before.orphanedAssignmentIds) {
    const assignment = assignments[assignmentId];
    if (!assignment || assignment.status !== 'active') continue;
    assignments[assignmentId] = {
      ...assignment,
      status: 'failed',
      lastError: 'Archived by Temporary Roles repair because the member, role or expiry data is invalid.',
      updatedAt: now(),
    };
    archivedAssignmentIds.push(assignmentId);
  }

  if (archivedAssignmentIds.length) {
    temporaryRoles.saveSection(guild.id, {
      ...section,
      assignments,
      analytics: {
        ...section.analytics,
        failed: Number(section.analytics.failed || 0) + archivedAssignmentIds.length,
      },
      updatedAt: now(),
    }, meta);
  }

  const expiryResult = await temporaryRoles.scanExpired(guild, meta);
  const health = await buildHealth(guild);

  return {
    archivedAssignmentIds,
    expiryResult,
    health,
  };
}

module.exports = {
  buildHealth,
  repair,
};