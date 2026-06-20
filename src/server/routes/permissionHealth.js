'use strict';

// src/server/routes/permissionHealth.js

const express = require('express');
const { PermissionFlagsBits } = require('discord.js');

const {
  DEFAULT_BOT_CHANNEL_PERMISSIONS,
  canManageRole,
  getBotMember,
  permissionLabel,
  validateChannelAccess,
} = require('../../helpers/goliathPermissionGuard');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[PermissionHealth API]', error);

  return res.status(status).json({
    success: false,
    error: error.message || 'Permission health check failed.',
  });
}

function cleanDiscordId(value, label = 'Discord ID') {
  const id = String(value || '').replace(/\D/g, '');
  if (!id || id.length < 15) throw new Error(`Invalid ${label}.`);
  return id;
}

async function getGuild(req, guildId) {
  const client = req.app.locals.discordClient || req.app.locals.client;
  const cachedGuild = client?.guilds?.cache?.get?.(guildId);
  if (cachedGuild) return cachedGuild;

  const fetchedGuild = typeof client?.guilds?.fetch === 'function'
    ? await client.guilds.fetch(guildId).catch(() => null)
    : null;

  if (!fetchedGuild) throw new Error('Guild is not available to the Discord client.');
  return fetchedGuild;
}

function summariseGuardResult(result) {
  return {
    ok: result.ok,
    scope: result.scope,
    channelId: result.channelId,
    channelName: result.channelName,
    missingPermissions: result.missingPermissions || [],
    failures: result.failures || [],
    autoFixAvailable: result.autoFixAvailable === true,
    message: result.message,
  };
}

function getOverallStatus(issueCount = 0, warningCount = 0) {
  if (issueCount > 0) return 'critical';
  if (warningCount > 0) return 'warning';
  return 'healthy';
}

async function checkGuildBasePermissions(guild) {
  const botMember = await getBotMember(guild);

  if (!botMember) {
    return {
      ok: false,
      missingPermissions: [],
      message: 'Goliath could not read its own server member profile.',
    };
  }

  const required = [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.ViewAuditLog,
  ];

  const missingPermissions = required
    .filter((permission) => !botMember.permissions?.has(permission))
    .map(permissionLabel);

  return {
    ok: missingPermissions.length === 0,
    missingPermissions,
    botRoleId: botMember.roles?.highest?.id || null,
    botRoleName: botMember.roles?.highest?.name || null,
    botRolePosition: botMember.roles?.highest?.position || null,
    message: missingPermissions.length
      ? 'Goliath is missing one or more recommended server-level permissions.'
      : 'Goliath has the recommended server-level permissions.',
  };
}

async function checkChannels(guild, limit = 50) {
  const channels = [...(guild.channels?.cache?.values?.() || [])]
    .filter((channel) => channel?.isTextBased?.() || channel?.type === 4)
    .slice(0, Math.max(1, Math.min(Number(limit) || 50, 200)));

  const checks = [];

  for (const channel of channels) {
    const result = await validateChannelAccess(
      guild,
      channel.id,
      DEFAULT_BOT_CHANNEL_PERMISSIONS,
      {
        scope: 'permission_health.channel',
      }
    );

    if (!result.ok) {
      checks.push({
        type: 'channel',
        channelId: channel.id,
        channelName: channel.name,
        channelType: channel.type,
        result: summariseGuardResult(result),
      });
    }
  }

  return {
    checked: channels.length,
    issueCount: checks.length,
    issues: checks,
  };
}

async function checkRoles(guild, limit = 100) {
  const roles = [...(guild.roles?.cache?.values?.() || [])]
    .filter((role) => role && role.id !== guild.id)
    .sort((a, b) => Number(b.position || 0) - Number(a.position || 0))
    .slice(0, Math.max(1, Math.min(Number(limit) || 100, 250)));

  const issues = [];

  for (const role of roles) {
    const result = await canManageRole(guild, role.id);

    if (!result.ok && ['role_hierarchy', 'missing_manage_roles', 'managed_role'].includes(result.reason)) {
      issues.push({
        type: 'role',
        roleId: role.id,
        roleName: role.name,
        rolePosition: role.position,
        reason: result.reason,
        message: result.message,
        fix: result.fix || null,
      });
    }
  }

  return {
    checked: roles.length,
    issueCount: issues.length,
    issues,
  };
}

router.get('/:guildId', async (req, res) => {
  try {
    const guildId = cleanDiscordId(req.params.guildId, 'guild ID');
    const guild = await getGuild(req, guildId);

    const [basePermissions, channelHealth, roleHealth] = await Promise.all([
      checkGuildBasePermissions(guild),
      checkChannels(guild, req.query.channelLimit),
      checkRoles(guild, req.query.roleLimit),
    ]);

    const issueCount =
      (basePermissions.ok ? 0 : basePermissions.missingPermissions.length || 1) +
      channelHealth.issueCount +
      roleHealth.issueCount;

    return success(res, {
      guildId,
      checkedAt: new Date().toISOString(),
      status: getOverallStatus(issueCount, 0),
      summary: {
        issueCount,
        basePermissionIssueCount: basePermissions.ok ? 0 : basePermissions.missingPermissions.length || 1,
        channelIssueCount: channelHealth.issueCount,
        roleIssueCount: roleHealth.issueCount,
      },
      basePermissions,
      channels: channelHealth,
      roles: roleHealth,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
