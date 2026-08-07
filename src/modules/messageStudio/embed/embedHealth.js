'use strict';

const { PermissionFlagsBits } = require('discord.js');
const { getAllEmbedDeployments, markEmbedDeploymentStatus, DEPLOYMENT_STATUS } = require('./embedDeployments');
const { listTemplates } = require('./embedTemplates');

function now() { return new Date().toISOString(); }

async function inspectDeployment(guild, deployment) {
  const issues = [];
  const channel = guild.channels.cache.get(deployment.channelId)
    || await guild.channels.fetch(deployment.channelId).catch(() => null);
  if (!channel?.isTextBased?.()) {
    issues.push({ code: 'channel_missing', deploymentKey: deployment.key || deployment.deploymentKey });
    return { deployment, healthy: false, issues };
  }
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;
  for (const permission of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks]) {
    if (!permissions?.has(permission)) issues.push({ code: 'permission_missing', permission: String(permission), channelId: channel.id, deploymentKey: deployment.key });
  }
  if (deployment.messageId) {
    const message = await channel.messages.fetch(deployment.messageId).catch(() => null);
    if (!message) issues.push({ code: 'message_missing', channelId: channel.id, messageId: deployment.messageId, deploymentKey: deployment.key });
  }
  return { deployment, healthy: issues.length === 0, issues };
}

async function buildHealthReport(guild) {
  const deployments = Object.values(getAllEmbedDeployments(guild.id) || {});
  const checks = [];
  for (const deployment of deployments) checks.push(await inspectDeployment(guild, deployment));
  const issues = checks.flatMap((check) => check.issues);
  return {
    module: 'embed',
    healthy: issues.length === 0,
    templates: Object.keys(listTemplates(guild.id) || {}).length,
    deployments: deployments.length,
    issues,
    checkedAt: now(),
  };
}

async function repairAll(guild, actorId = null) {
  const report = await buildHealthReport(guild);
  for (const issue of report.issues) {
    if (!issue.deploymentKey) continue;
    const status = issue.code === 'channel_missing'
      ? DEPLOYMENT_STATUS.MISSING_CHANNEL
      : issue.code === 'message_missing'
        ? DEPLOYMENT_STATUS.MISSING_MESSAGE
        : DEPLOYMENT_STATUS.PERMISSION_ERROR;
    markEmbedDeploymentStatus(guild.id, issue.deploymentKey, status, {
      actorId,
      missingReason: issue.code,
      repairedAt: now(),
    });
  }
  return buildHealthReport(guild);
}

module.exports = { buildHealthReport, repairAll, inspectDeployment };
