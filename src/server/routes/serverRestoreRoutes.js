// dashboard/server/routes/serverRestoreRoutes.js

const express = require('express');

const {
  getBackupSummaries,
  readServerBackup,
} = require('../../security/serverBackup');

const { restoreServerBackup } = require('../../security/serverRestore');
const { createServerBackup } = require('../../security/serverBackup');

const router = express.Router();

function getClient(req) {
  return req.app.get('client');
}

function getGuild(client, guildId) {
  return client?.guilds?.cache?.get(String(guildId)) || null;
}

function safeBackupSummary(backup) {
  return {
    backupId: backup.backupId,
    createdAt: backup.createdAt,
    createdBy: backup.createdBy,
    reason: backup.reason,
    guildName: backup.guild?.name || backup.guildName || null,
    roles: backup.roles?.length || 0,
    channels: backup.channels?.length || 0,
    categories:
      backup.channels?.filter((channel) => channel.type === 4).length || 0,
    logsIncluded: Boolean(backup.logs),
    restoreNotes: backup.restoreNotes || null,
  };
}

router.get('/:guildId/backups', async (req, res) => {
  try {
    const { guildId } = req.params;

    const backups = getBackupSummaries(guildId);

    res.json({
      success: true,
      backups,
    });
  } catch (error) {
    console.error('Failed to list backups:', error);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.get('/:guildId/backups/:backupId', async (req, res) => {
  try {
    const { guildId, backupId } = req.params;

    const backup = readServerBackup(guildId, backupId);

    if (!backup) {
      return res.status(404).json({
        success: false,
        error: 'Backup not found.',
      });
    }

    return res.json({
      success: true,
      backup: safeBackupSummary(backup),
    });
  } catch (error) {
    console.error('Failed to read backup:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/:guildId/restore/preview', async (req, res) => {
  try {
    const client = getClient(req);
    const { guildId } = req.params;
    const { backupId, options = {} } = req.body;

    const guild = getGuild(client, guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Guild not found or bot is not in this server.',
      });
    }

    if (!backupId) {
      return res.status(400).json({
        success: false,
        error: 'Missing backupId.',
      });
    }

    const report = await restoreServerBackup(guild, backupId, {
      ...options,
      dryRun: true,
      confirmed: false,
      cleanupMode: false,
      skipDuplicates: true,
      reason: 'Goliath restore preview',
    });

    return res.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Restore preview failed:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

router.post('/:guildId/restore/execute', async (req, res) => {
  try {
    const client = getClient(req);
    const { guildId } = req.params;

    const {
      backupId,
      confirmText,
      cleanupMode = false,
      options = {},
    } = req.body;

    const guild = getGuild(client, guildId);

    if (!guild) {
      return res.status(404).json({
        success: false,
        error: 'Guild not found or bot is not in this server.',
      });
    }

    if (!backupId) {
      return res.status(400).json({
        success: false,
        error: 'Missing backupId.',
      });
    }

    if (confirmText !== 'RESTORE') {
      return res.status(400).json({
        success: false,
        error: 'Restore confirmation failed. Type RESTORE to continue.',
      });
    }

    const safetyBackup = await createServerBackup(guild, {
      createdBy: 'system:pre-restore',
      reason: `Automatic safety backup before restoring ${backupId}`,
    });

    const progress = [];

    const report = await restoreServerBackup(guild, backupId, {
      ...options,
      dryRun: false,
      confirmed: true,
      cleanupMode: Boolean(cleanupMode),
      skipDuplicates: true,
      reason: `Goliath confirmed restore from ${backupId}`,
      onProgress: async (payload) => {
        progress.push(payload);
      },
    });

    return res.json({
      success: true,
      safetyBackup: {
        backupId: safetyBackup.backupId,
        createdAt: safetyBackup.createdAt,
      },
      report: {
        ...report,
        progress,
      },
    });
  } catch (error) {
    console.error('Restore execution failed:', error);

    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;