const fs = require('node:fs');
const path = require('node:path');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const serverBackup = require('./serverBackup');
const serverRestore = require('./serverRestore');

const RESTORE_REQUEST_VERSION = '1D_INTEGRITY_STATUS_UI';

const BOT_MODE = (
  process.env.BOT_MODE ||
  'DEV'
).toLowerCase();

const RUNTIME_ROOT = path.join(
  process.cwd(),
  'src',
  'runtime',
  BOT_MODE
);

const RESTORE_DIR = path.join(
  RUNTIME_ROOT,
  'recovery',
  'restoreRequests'
);

const PENDING_FILE = path.join(
  RESTORE_DIR,
  'pending.json'
);

const HISTORY_FILE = path.join(
  RESTORE_DIR,
  'history.json'
);

const AUDIT_FILE = path.join(
  RESTORE_DIR,
  'audit.json'
);

const DEFAULT_COOLDOWN_MS = 1000 * 60 * 30;
const activeGuildLocks = new Set();

function ensureStorage() {
  if (!fs.existsSync(RESTORE_DIR)) {
    fs.mkdirSync(RESTORE_DIR, {
      recursive: true,
    });
  }

  for (const file of [
    PENDING_FILE,
    HISTORY_FILE,
    AUDIT_FILE,
  ]) {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(
        file,
        JSON.stringify(
          { requests: [] },
          null,
          2
        )
      );
    }
  }
}

function readJson(file, fallback = { requests: [] }) {
  ensureStorage();

  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureStorage();

  const tempFile = `${file}.tmp`;
  const json = JSON.stringify(data, null, 2);

  try {
    fs.writeFileSync(tempFile, json, 'utf8');
    fs.renameSync(tempFile, file);
  } catch (error) {
    if (error.code === 'EPERM' || error.code === 'EBUSY') {
      fs.writeFileSync(file, json, 'utf8');

      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}

      return;
    }

    throw error;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function createRequestId(guildId) {
  return `restore_${guildId}_${Date.now()}`;
}

const OWNER_ID = (process.env.OWNER_ID || '')
  .split(',')
  .map((id) => String(id).trim())
  .filter(Boolean);

function getOwnerIds() {
  return OWNER_ID ? [OWNER_ID] : [];
}

function isGlobalOwner(userId) {
  return Boolean(OWNER_ID && String(userId) === OWNER_ID);
}

function isGuildOwner(guild, userId) {
  return guild?.ownerId === userId;
}

function isGuildLocked(guildId) {
  return activeGuildLocks.has(String(guildId));
}

function lockGuild(guildId) {
  activeGuildLocks.add(String(guildId));
}

function unlockGuild(guildId) {
  activeGuildLocks.delete(String(guildId));
}

function getPendingRequests() {
  return readJson(PENDING_FILE);
}

function savePendingRequests(data) {
  writeJson(PENDING_FILE, data);
}

function getHistory() {
  return readJson(HISTORY_FILE);
}

function saveHistory(data) {
  writeJson(HISTORY_FILE, data);
}

function getAuditLog() {
  return readJson(AUDIT_FILE);
}

function saveAuditLog(data) {
  writeJson(AUDIT_FILE, data);
}

function findPendingRequest(requestId) {
  return getPendingRequests().requests.find((r) => r.id === requestId) || null;
}

function upsertPendingRequest(request) {
  const pending = getPendingRequests();
  const index = pending.requests.findIndex((r) => r.id === request.id);

  if (index >= 0) pending.requests[index] = request;
  else pending.requests.push(request);

  savePendingRequests(pending);
}

function removePendingRequest(requestId) {
  const pending = getPendingRequests();
  pending.requests = pending.requests.filter((r) => r.id !== requestId);
  savePendingRequests(pending);
}

function pushHistory(entry) {
  const history = getHistory();
  history.requests.unshift(entry);
  saveHistory(history);
}

function pushAudit(entry) {
  const audit = getAuditLog();

  audit.requests.unshift({
    ...entry,
    auditAt: nowIso(),
  });

  saveAuditLog(audit);
}

function getLatestRestoreForGuild(guildId) {
  return getHistory().requests.find(
    (r) =>
      String(r.guildId) === String(guildId) &&
      ['approved', 'completed', 'failed'].includes(r.status)
  );
}

function checkCooldown(guildId, cooldownMs = DEFAULT_COOLDOWN_MS) {
  const latest = getLatestRestoreForGuild(guildId);

  if (!latest?.completedAt && !latest?.approvedAt) {
    return {
      active: false,
      remainingMs: 0,
    };
  }

  const lastTime = new Date(latest.completedAt || latest.approvedAt).getTime();
  const remaining = cooldownMs - (Date.now() - lastTime);

  return {
    active: remaining > 0,
    remainingMs: Math.max(0, remaining),
  };
}

function formatMs(ms) {
  const mins = Math.ceil(ms / 60000);
  return `${mins} minute${mins === 1 ? '' : 's'}`;
}

function safeField(value, max = 1000) {
  const text = String(value || 'None');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatDiffSummary(diff) {
  if (!diff?.summary) return null;

  return safeField(
    [
      '**Roles**',
      `+ Create: ${diff.summary.roles?.create || 0}`,
      `~ Update: ${diff.summary.roles?.update || 0}`,
      `= Skip: ${diff.summary.roles?.skip || 0}`,
      `! Duplicates: ${diff.summary.roles?.duplicates || 0}`,
      `⚠ Warnings: ${diff.summary.roles?.warnings || 0}`,
      '',
      '**Channels**',
      `+ Create: ${diff.summary.channels?.create || 0}`,
      `~ Update: ${diff.summary.channels?.update || 0}`,
      `= Skip: ${diff.summary.channels?.skip || 0}`,
      `! Duplicates: ${diff.summary.channels?.duplicates || 0}`,
      `⚠ Warnings: ${diff.summary.channels?.warnings || 0}`,
      '',
      '**Permissions**',
      `↺ Check/restore: ${diff.summary.permissions?.restore || 0}`,
      `= Skip: ${diff.summary.permissions?.skip || 0}`,
      `⚠ Warnings: ${diff.summary.permissions?.warnings || 0}`,
      '',
      '**Safety**',
      `Warnings: ${diff.summary.totals?.warnings || 0}`,
      `Blockers: ${diff.summary.totals?.blockers || 0}`,
    ].join('\n')
  );
}

function getTopDiffWarnings(diff, max = 5) {
  const warnings = Array.isArray(diff?.warnings) ? diff.warnings : [];
  const blockers = Array.isArray(diff?.blockers) ? diff.blockers : [];

  const lines = [
    ...blockers.map((item) => `BLOCKER: ${item}`),
    ...warnings.map((item) => item.message || String(item)),
  ];

  if (!lines.length) return 'No warnings detected.';

  return safeField(lines.slice(0, max).map((line) => `- ${line}`).join('\n'));
}

function getPreviewSummary(preview) {
  if (!preview) return 'Preview unavailable.';

  if (preview.restoreDiff) {
    return formatDiffSummary(preview.restoreDiff);
  }

  if (preview.restoreDiffText) {
    return safeField(preview.restoreDiffText);
  }

  if (preview.summary) return safeField(preview.summary);

  return safeField(
    [
      `Backup: ${preview.backupId || 'Unknown'}`,
      `Roles planned: ${preview.roles?.planned || 0}`,
      `Categories planned: ${preview.categories?.planned || 0}`,
      `Channels planned: ${preview.channels?.planned || 0}`,
      `Config sections planned: ${preview.config?.planned || 0}`,
      `Warnings: ${preview.warnings?.length || 0}`,
    ].join('\n')
  );
}

function getRestoreSummary(result) {
  if (!result) return 'Restore completed.';

  return safeField(
    [
      `Backup: ${result.backupId || 'Unknown'}`,
      `Rollback: ${result.rollbackBackupId || 'Unknown'}`,
      `Roles created: ${result.roles?.created || 0}`,
      `Categories created: ${result.categories?.created || 0}`,
      `Channels created: ${result.channels?.created || 0}`,
      `Config restored: ${result.config?.restored || 0}`,
      `Warnings: ${result.warnings?.length || 0}`,
      `Errors: ${result.errors?.length || 0}`,
    ].join('\n')
  );
}

function getIntegritySummary(integrity) {
  if (!integrity) {
    return {
      failed: true,
      verified: false,
      text: [
        '❌ Backup Integrity Missing',
        'Restore Blocked',
        '',
        'Integrity metadata was not found.',
      ].join('\n'),
    };
  }

  const verified = integrity.verified === true;
  const hashValid = integrity.hashValid === true;
  const corruptionCheck =
    integrity.corruptionCheck === true;

  const failed =
    !verified ||
    !hashValid ||
    !corruptionCheck;

  if (failed) {
    return {
      failed: true,
      verified: false,
      text: [
        '❌ Backup Integrity Failed',
        'Restore Blocked',
        '',
        `Algorithm: ${integrity.algorithm || 'Unknown'}`,
        `Hash Status: ${
          hashValid ? 'VALID' : 'INVALID'
        }`,
        `Corruption Check: ${
          corruptionCheck ? 'PASSED' : 'FAILED'
        }`,
      ].join('\n'),
    };
  }

  return {
    failed: false,
    verified: true,
    text: [
      '✅ Integrity: VERIFIED',
      `Algorithm: ${integrity.algorithm || 'SHA256'}`,
      'Hash Status: VALID',
      'Corruption Check: PASSED',
    ].join('\n'),
  };
}

function buildDecisionButtons(requestId, disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`restore_request_approve:${requestId}`)
      .setLabel('Approve Restore')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),

    new ButtonBuilder()
      .setCustomId(`restore_request_deny:${requestId}`)
      .setLabel('Deny Restore')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(disabled)
  );
}

function buildRequestEmbed(request) {
  const preview = request.preview || null;
  const diff = preview?.restoreDiff || null;

  const warningText = getTopDiffWarnings(diff);

  const integrity =
    preview?.integrity || null;

  const integritySummary =
    getIntegritySummary(integrity);

  const diffBlockers =
    diff?.summary?.totals?.blockers || 0;

  const integrityFailed =
    integritySummary.failed;

  const embedColor = integrityFailed
    ? 0xdc2626
    : diffBlockers > 0
      ? 0xf59e0b
      : 0x22c55e;

  const integrityBanner = integrityFailed
    ? [
        'Backup integrity verification failed.',
        'Restore approval has been blocked.',
      ].join('\n')
    : [
        'Backup integrity verified successfully.',
        'Restore approval is permitted.',
      ].join('\n');

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('Restore Approval Required')
    .setDescription(
      [
        'A guild owner has requested a server restore.',
        '',
        '**No restore has been executed yet.**',
        'A Goliath owner must approve this request first.',
        '',
        integrityBanner,
      ].join('\n')
    )
    .addFields(
      {
        name: 'Guild',
        value: `${request.guildName}\n\`${request.guildId}\``,
        inline: true,
      },
      {
        name: 'Requested By',
        value: `${request.requestedByTag}\n\`${request.requestedById}\``,
        inline: true,
      },
      {
        name: 'Status',
        value: `\`${request.status}\``,
        inline: true,
      },
      {
        name: 'Request ID',
        value: `\`${request.id}\``,
        inline: false,
      },
      {
        name: 'Backup',
        value: [
          `ID: \`${preview?.backupId || diff?.backup?.backupId || 'Unknown'}\``,
          `Type: \`${diff?.backup?.type || preview?.type || 'Unknown'}\``,
          `Environment: \`${diff?.backup?.environment || 'Unknown'}\``,
        ].join('\n'),
        inline: false,
      },
      {
        name: 'Backup Integrity',
        value: integritySummary.text,
        inline: false,
      },
      {
        name: 'Restore Diff Preview',
        value: request.previewSummary || 'Preview unavailable.',
        inline: false,
      },
      {
        name: 'Warnings / Blockers',
        value: warningText,
        inline: false,
      }
    )
    .setFooter({
      text: `Goliath Restore System • ${RESTORE_REQUEST_VERSION}`,
    })
    .setTimestamp(new Date(request.createdAt));

  return embed;
}

function buildCompletedEmbed(request, status, extra = {}) {
  const color =
    status === 'completed'
      ? 0x22c55e
      : status === 'denied'
        ? 0xef4444
        : status === 'failed'
          ? 0xdc2626
          : 0x94a3b8;

  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`Restore Request ${status.toUpperCase()}`)
    .addFields(
      {
        name: 'Guild',
        value: `${request.guildName}\n\`${request.guildId}\``,
        inline: true,
      },
      {
        name: 'Requested By',
        value: `${request.requestedByTag}\n\`${request.requestedById}\``,
        inline: true,
      },
      {
        name: 'Handled By',
        value: extra.handledByTag
          ? `${extra.handledByTag}\n\`${extra.handledById}\``
          : 'Unknown',
        inline: true,
      },
      {
        name: 'Request ID',
        value: `\`${request.id}\``,
        inline: false,
      },
      {
        name: 'Result',
        value: safeField(extra.message || 'No result provided.'),
        inline: false,
      }
    )
    .setFooter({
      text: `Goliath Restore System • ${RESTORE_REQUEST_VERSION}`,
    })
    .setTimestamp();
}

async function sendSupportAlert(client, request) {
  const supportGuildId = process.env.GOLIATH_SUPPORT_GUILD_ID;
  const channelId = process.env.RESTORE_REQUEST_CHANNEL_ID;

  if (!supportGuildId) {
    throw new Error('Missing GOLIATH_SUPPORT_GUILD_ID in .env');
  }

  if (!channelId) {
    throw new Error('Missing RESTORE_REQUEST_CHANNEL_ID in .env');
  }

  const supportGuild = await client.guilds.fetch(supportGuildId).catch(() => null);
  if (!supportGuild) throw new Error('Could not fetch support guild.');

  const channel = await supportGuild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) {
    throw new Error('Could not fetch restore request channel.');
  }

 const diffBlockers =
  request.preview?.restoreDiff?.summary?.totals?.blockers || 0;

const integrityFailed =
  request.preview?.integrity?.verified === false;

const disabled =
  diffBlockers > 0 ||
  !request.previewOk ||
  integrityFailed;

  const message = await channel.send({
    embeds: [buildRequestEmbed(request)],
    components: [buildDecisionButtons(request.id, disabled)],
  });

  request.supportGuildId = supportGuildId;
  request.supportChannelId = channelId;
  request.supportMessageId = message.id;

  upsertPendingRequest(request);

  return message;
}

async function createRestoreRequest(interaction, options = {}) {
  const guild = interaction.guild;
  const user = interaction.user;

  if (!guild) {
    return interaction.reply({
      content: 'This restore request must be used inside a server.',
      flags: 64,
    });
  }

  if (!isGuildOwner(guild, user.id) && !isGlobalOwner(user.id)) {
    return interaction.reply({
      content: 'Only the guild owner can request a restore.',
      flags: 64,
    });
  }

  if (isGuildLocked(guild.id)) {
    return interaction.reply({
      content: 'A restore is already running for this server.',
      flags: 64,
    });
  }

  const cooldown = checkCooldown(guild.id, options.cooldownMs);

  if (cooldown.active && !isGlobalOwner(user.id)) {
    return interaction.reply({
      content: `This server is currently on restore cooldown. Try again in ${formatMs(
        cooldown.remainingMs
      )}.`,
      flags: 64,
    });
  }

  const existing = getPendingRequests().requests.find(
    (r) => r.guildId === guild.id && r.status === 'pending'
  );

  if (existing) {
    return interaction.reply({
      content: `This server already has a pending restore request.\nRequest ID: \`${existing.id}\``,
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  let preview = null;
  let previewSummary = 'Preview unavailable. Restore approval is blocked until preview succeeds.';

  try {
    preview = await serverRestore.previewRestore(guild, {
      requestedBy: user.id,
      restoreRequestPreview: true,
      reason: `Restore request preview by ${user.tag}`,
    });

    previewSummary = getPreviewSummary(preview);
  } catch (error) {
    previewSummary = `Preview failed: ${error.message}`;
  }

  const diffBlockers = preview?.restoreDiff?.summary?.totals?.blockers || 0;
  const previewOk = Boolean(preview && preview.available !== false && diffBlockers === 0);

  const request = {
    id: createRequestId(guild.id),
    version: RESTORE_REQUEST_VERSION,

    guildId: guild.id,
    guildName: guild.name,

    requestedById: user.id,
    requestedByTag: user.tag,

    status: previewOk ? 'pending' : 'preview_failed',

    previewOk,
    preview,
    previewSummary,

    rollbackBackupId: null,
    rollbackPath: null,
    restoreResult: null,

    createdAt: nowIso(),
    approvedAt: null,
    deniedAt: null,
    completedAt: null,
    failedAt: null,

    approvedById: null,
    approvedByTag: null,
    deniedById: null,
    deniedByTag: null,

    supportGuildId: null,
    supportChannelId: null,
    supportMessageId: null,
  };

  upsertPendingRequest(request);

  if (!previewOk) {
    removePendingRequest(request.id);
    pushHistory(request);
    pushAudit({
      action: 'restore_preview_failed',
      request,
    });

    return interaction.editReply({
      content: [
        'Restore request could not be submitted because the preview failed or has blockers.',
        '',
        previewSummary,
      ].join('\n'),
    });
  }

  try {
    await sendSupportAlert(interaction.client, request);
  } catch (error) {
    request.status = 'alert_failed';
    request.failedAt = nowIso();
    request.error = error.message;

    removePendingRequest(request.id);
    pushHistory(request);
    pushAudit({
      action: 'restore_alert_failed',
      request,
      error: error.message,
    });

    return interaction.editReply({
      content: `Restore request was created, but the support guild alert failed:\n\`${error.message}\``,
    });
  }

  pushAudit({
    action: 'restore_requested',
    request,
  });

  return interaction.editReply({
    content: [
      'Restore request submitted.',
      '',
      `Request ID: \`${request.id}\``,
      'A Goliath owner must approve it before anything is restored.',
    ].join('\n'),
  });
}

async function approveRestoreRequest(interaction, requestId) {
  if (!isGlobalOwner(interaction.user.id)) {
    return interaction.reply({
      content: 'Only Goliath owners can approve restore requests.',
      flags: 64,
    });
  }

  const request = findPendingRequest(requestId);

  if (!request) {
    return interaction.reply({
      content: 'This restore request was not found or is no longer pending.',
      flags: 64,
    });
  }

  if (request.status !== 'pending') {
    return interaction.reply({
      content: `This request is marked as \`${request.status}\` and cannot be approved.`,
      flags: 64,
    });
  }

  if (!request.previewOk || !request.preview) {
    return interaction.reply({
      content: 'This request cannot be approved because it does not have a valid restore preview.',
      flags: 64,
    });
  }

  if (request.preview?.integrity?.verified === false) {
  return interaction.reply({
    content: 'This request cannot be approved because backup integrity verification failed.',
    flags: 64,
    });
  }

  if (request.preview?.restoreDiff?.summary?.totals?.blockers > 0) {
    return interaction.reply({
      content: 'This request cannot be approved because the restore diff has blockers.',
      flags: 64,
    });
  }

  if (isGuildLocked(request.guildId)) {
    return interaction.reply({
      content: 'A restore is already running for this guild.',
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  const guild = await interaction.client.guilds.fetch(request.guildId).catch(() => null);

  if (!guild) {
    request.status = 'failed';
    request.failedAt = nowIso();
    request.error = 'Could not fetch target guild.';

    removePendingRequest(request.id);
    pushHistory(request);
    pushAudit({
      action: 'restore_failed',
      request,
      error: request.error,
    });

    return interaction.editReply({
      content: 'Restore failed before starting: could not fetch target guild.',
    });
  }

  lockGuild(request.guildId);

  request.status = 'approved';
  request.approvedAt = nowIso();
  request.approvedById = interaction.user.id;
  request.approvedByTag = interaction.user.tag;
  upsertPendingRequest(request);

  try {
    pushAudit({
      action: 'restore_approved',
      request,
      approvedBy: interaction.user.id,
    });

    const rollback = await serverBackup.createServerBackup(guild, {
      type: 'rollback',
      reason: `Automatic rollback snapshot before approved restore ${request.id}`,
      requestedBy: request.requestedById,
      approvedBy: interaction.user.id,
      restoreRequestId: request.id,
      createdBySystem: true,
    });

    request.rollbackBackupId = rollback.backupId;
    request.rollbackPath = rollback.filePath || rollback.path || rollback.file || null;

    upsertPendingRequest(request);

    pushAudit({
      action: 'restore_rollback_created',
      request,
      rollbackBackupId: request.rollbackBackupId,
      rollbackPath: request.rollbackPath,
    });

    const restoreResult = await serverRestore.executeRestore(guild, {
      restoreRequestId: request.id,
      approvedBy: interaction.user.id,
      requestedBy: request.requestedById,
      rollbackBackupId: request.rollbackBackupId,
      preview: request.preview,
    });

    console.log('RESTORE WARNINGS:', restoreResult?.warnings || []);

    request.status = 'completed';
    request.completedAt = nowIso();
    request.restoreResult = restoreResult || { success: true };

    removePendingRequest(request.id);
    pushHistory(request);

    pushAudit({
      action: 'restore_completed',
      request,
      restoreResult,
    });

    await interaction.message
      .edit({
        embeds: [
          buildCompletedEmbed(request, 'completed', {
            handledById: interaction.user.id,
            handledByTag: interaction.user.tag,
            message: [
              'Restore completed.',
              '',
              `Rollback snapshot: \`${request.rollbackBackupId}\``,
              '',
              getRestoreSummary(restoreResult),
            ].join('\n'),
          }),
        ],
        components: [],
      })
      .catch(() => null);

    return interaction.editReply({
      content: [
        `Restore approved and completed for **${request.guildName}**.`,
        '',
        `Rollback snapshot: \`${request.rollbackBackupId}\``,
      ].join('\n'),
    });
  } catch (error) {
    request.status = 'failed';
    request.failedAt = nowIso();
    request.error = error.message;

    removePendingRequest(request.id);
    pushHistory(request);

    pushAudit({
      action: 'restore_failed',
      request,
      error: error.message,
    });

    await interaction.message
      .edit({
        embeds: [
          buildCompletedEmbed(request, 'failed', {
            handledById: interaction.user.id,
            handledByTag: interaction.user.tag,
            message: error.message,
          }),
        ],
        components: [],
      })
      .catch(() => null);

    return interaction.editReply({
      content: `Restore failed:\n\`${error.message}\``,
    });
  } finally {
    unlockGuild(request.guildId);
  }
}

async function denyRestoreRequest(interaction, requestId) {
  if (!isGlobalOwner(interaction.user.id)) {
    return interaction.reply({
      content: 'Only Goliath owners can deny restore requests.',
      flags: 64,
    });
  }

  const request = findPendingRequest(requestId);

  if (!request) {
    return interaction.reply({
      content: 'This restore request was not found or is no longer pending.',
      flags: 64,
    });
  }

  request.status = 'denied';
  request.deniedAt = nowIso();
  request.deniedById = interaction.user.id;
  request.deniedByTag = interaction.user.tag;

  removePendingRequest(request.id);
  pushHistory(request);

  pushAudit({
    action: 'restore_denied',
    request,
    deniedBy: interaction.user.id,
  });

  await interaction.update({
    embeds: [
      buildCompletedEmbed(request, 'denied', {
        handledById: interaction.user.id,
        handledByTag: interaction.user.tag,
        message: 'Restore request denied. No restore was executed.',
      }),
    ],
    components: [],
  });
}

async function handleRestoreButton(interaction) {
  if (!interaction.isButton()) return false;

  const customId = interaction.customId || '';

  if (customId.startsWith('restore_request_approve:')) {
    const requestId = customId.split(':')[1];
    await approveRestoreRequest(interaction, requestId);
    return true;
  }

  if (customId.startsWith('restore_request_deny:')) {
    const requestId = customId.split(':')[1];
    await denyRestoreRequest(interaction, requestId);
    return true;
  }

  return false;
}

module.exports = {
  RESTORE_REQUEST_VERSION,

  createRestoreRequest,
  approveRestoreRequest,
  denyRestoreRequest,
  handleRestoreButton,

  getPendingRequests,
  getHistory,
  getAuditLog,
  findPendingRequest,

  isGlobalOwner,
  isGuildOwner,
  isGuildLocked,

  checkCooldown,
  lockGuild,
  unlockGuild,
};