'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../guild/guildManager');
const securitySystem = require('./system');
const schedulerRegistry = require('../../../owner/sentinel/schedulerRegistry');

const INTERVAL_MS = 60_000;
const SCHEDULER_ID = 'security:capability-health:global';
let timer = null;

function evaluateGuildSecurityHealth(guild) {
  const bot = guild?.members?.me;
  const missingPermissions = [];
  const required = [
    ['ViewAuditLog', PermissionFlagsBits.ViewAuditLog],
    ['ManageRoles', PermissionFlagsBits.ManageRoles],
    ['ManageChannels', PermissionFlagsBits.ManageChannels],
  ];
  for (const [name, flag] of required) {
    if (!bot?.permissions?.has(flag)) missingPermissions.push(name);
  }

  let hierarchyDegraded = false;
  let blockingRoleId = null;
  let blockingRoleName = null;
  if (bot?.roles?.highest) {
    const protectedRoles = [...guild.roles.cache.values()].filter((role) =>
      !role.managed
      && role.id !== guild.id
      && (
        role.permissions.has(PermissionFlagsBits.Administrator)
        || role.permissions.has(PermissionFlagsBits.ManageRoles)
        || role.permissions.has(PermissionFlagsBits.ManageGuild)
      )
    );
    const blocking = protectedRoles
      .filter((role) => role.position >= bot.roles.highest.position)
      .sort((a, b) => b.position - a.position)[0];
    if (blocking) {
      hierarchyDegraded = true;
      blockingRoleId = blocking.id;
      blockingRoleName = blocking.name;
    }
  }

  return {
    healthy: missingPermissions.length === 0 && !hierarchyDegraded,
    missingPermissions,
    hierarchyDegraded,
    blockingRoleId,
    blockingRoleName,
    botRoleId: bot?.roles?.botRole?.id || bot?.roles?.highest?.id || null,
    checkedAt: new Date().toISOString(),
  };
}

function sameHealthState(a = {}, b = {}) {
  return Boolean(a.healthy) === Boolean(b.healthy)
    && JSON.stringify(a.missingPermissions || []) === JSON.stringify(b.missingPermissions || [])
    && Boolean(a.hierarchyDegraded) === Boolean(b.hierarchyDegraded)
    && String(a.blockingRoleId || '') === String(b.blockingRoleId || '');
}

async function checkGuildSecurityHealth(guild) {
  if (!guild?.id || !guildManager.isModuleEnabled(guild.id, 'security')) return null;
  const next = evaluateGuildSecurityHealth(guild);
  const security = guildManager.getSecurityConfig(guild.id) || {};
  const previous = security.capabilityHealth || null;

  guildManager.updateSecurityConfig(guild.id, (current = {}) => ({
    ...current,
    capabilityHealth: next,
  }), guild);

  if (!previous) {
    if (!next.healthy) {
      await securitySystem.logIncident(guild, {
        type: 'security_capability_degraded',
        severity: securitySystem.SEVERITY.HIGH,
        reason: `Goliath security response capability is degraded. Missing: ${next.missingPermissions.join(', ') || 'none'}${next.hierarchyDegraded ? '; role hierarchy blocks security control' : ''}.`,
        actionTaken: 'Detection remains active; owner/admin attention required.',
        metadata: next,
        sendToOwner: true,
      });
    }
    return next;
  }

  if (sameHealthState(previous, next)) return next;

  if (!next.healthy) {
    await securitySystem.logIncident(guild, {
      type: 'security_capability_degraded',
      severity: securitySystem.SEVERITY.HIGH,
      reason: `Goliath lost required security capability. Missing: ${next.missingPermissions.join(', ') || 'none'}${next.hierarchyDegraded ? `; blocked by role ${next.blockingRoleName || next.blockingRoleId}` : ''}.`,
      actionTaken: 'Detection remains active; automatic response may be partially unavailable.',
      metadata: { previous, current: next },
      sendToOwner: true,
    });
  } else if (previous.healthy === false) {
    await securitySystem.logIncident(guild, {
      type: 'security_capability_restored',
      severity: securitySystem.SEVERITY.LOW,
      reason: 'Goliath security permissions and hierarchy are healthy again.',
      actionTaken: 'Full automatic response capability restored.',
      metadata: { previous, current: next },
    });
  }
  return next;
}

async function sweepSecurityHealth(client) {
  const result = { guilds: 0, healthy: 0, degraded: 0 };
  for (const guild of client?.guilds?.cache?.values?.() || []) {
    if (!guildManager.isModuleEnabled(guild.id, 'security')) continue;
    result.guilds += 1;
    const health = await checkGuildSecurityHealth(guild);
    if (health?.healthy) result.healthy += 1;
    else result.degraded += 1;
  }
  return result;
}

function startSecurityHealthMonitor(client) {
  if (!client) return null;
  if (timer) return timer;
  schedulerRegistry.register({
    id: SCHEDULER_ID,
    module: 'security',
    component: 'capability-health',
    intervalMs: INTERVAL_MS,
    staleAfterMs: INTERVAL_MS * 3,
  });

  Promise.resolve(sweepSecurityHealth(client))
    .then((result) => schedulerRegistry.beat(SCHEDULER_ID, result))
    .catch((error) => schedulerRegistry.fail(SCHEDULER_ID, error));

  timer = setInterval(async () => {
    try {
      const result = await sweepSecurityHealth(client);
      schedulerRegistry.beat(SCHEDULER_ID, result);
    } catch (error) {
      schedulerRegistry.fail(SCHEDULER_ID, error);
    }
  }, INTERVAL_MS);
  timer.unref?.();
  return timer;
}

module.exports = {
  INTERVAL_MS,
  evaluateGuildSecurityHealth,
  checkGuildSecurityHealth,
  sweepSecurityHealth,
  startSecurityHealthMonitor,
};
