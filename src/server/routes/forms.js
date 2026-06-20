'use strict';

// src/server/routes/forms.js

const express = require('express');

const formStore = require('../../modules/forms/formStore');
const {
  isGoliathPermissionError,
  validateRoleSelection,
} = require('../../helpers/goliathPermissionGuard');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Forms API]', error);

  if (isGoliathPermissionError(error)) {
    const details = error.details || {};

    return res.status(403).json({
      success: false,
      code: error.code,
      error: error.message,
      message: details.message || error.message,
      scope: details.scope || null,
      guildId: details.guildId || null,
      channelId: details.channelId || null,
      channelName: details.channelName || null,
      missingPermissions: details.missingPermissions || [],
      failures: details.failures || [],
      metadata: details.metadata || {},
      autoFixAvailable: Boolean(details.autoFixAvailable),
      confirmationRequired: Boolean(details.confirmationRequired),
    });
  }

  return res.status(status).json({
    success: false,
    error: error.message || 'Forms API request failed.',
  });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{16,25}$/.test(guildId)) {
    throw new Error('Invalid guild ID.');
  }
  return guildId;
}

async function fetchGuild(req, guildId) {
  const client = req.app?.locals?.client || req.app?.locals?.discordClient || global.client || global.discordClient;
  if (!client?.guilds?.fetch) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

function cleanRoleIds(roleIds = []) {
  return [...new Set(
    (Array.isArray(roleIds) ? roleIds : [roleIds])
      .map((roleId) => String(roleId || '').replace(/[<@&>]/g, '').trim())
      .filter((roleId) => /^\d{15,25}$/.test(roleId))
  )];
}

async function guardFormStaffRoles(req, guildId, input = {}, scope = 'forms.staff_roles') {
  const roleIds = cleanRoleIds(input.staffRoleIds || input.settings?.staffRoleIds || []);
  if (!roleIds.length) return null;

  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');

  const result = await validateRoleSelection(guild, roleIds, {
    scope,
    requireManageable: true,
  });

  if (!result.ok) throw result.toError();
  return result;
}

function sortByNewest(items = []) {
  return [...items].sort((a, b) => {
    const aTime = Date.parse(a.createdAt || a.updatedAt || 0) || 0;
    const bTime = Date.parse(b.createdAt || b.updatedAt || 0) || 0;
    return bTime - aTime;
  });
}

function filterSubmissions(submissions = [], query = {}) {
  let result = [...submissions];

  if (query.formId) {
    const formId = formStore.cleanKey(query.formId);
    result = result.filter((submission) => submission.formId === formId);
  }

  if (query.status) {
    const status = String(query.status).trim().toLowerCase();
    result = result.filter((submission) => submission.status === status);
  }

  if (query.userId) {
    const userId = String(query.userId).replace(/[<@!>]/g, '').trim();
    result = result.filter((submission) => submission.userId === userId);
  }

  return result;
}

router.get('/:guildId/overview', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);
    const forms = Object.values(section.forms || {});
    const panels = Object.values(section.panels || {});
    const submissions = Object.values(section.submissions || {});

    return success(res, {
      guildId,
      overview: {
        enabled: section.enabled !== false,
        formCount: forms.length,
        enabledFormCount: forms.filter((form) => form.enabled !== false).length,
        panelCount: panels.length,
        deployedPanelCount: panels.filter((panel) => panel.channelId && panel.messageId).length,
        submissionCount: submissions.length,
        pendingSubmissionCount: submissions.filter((submission) => submission.status === 'pending').length,
        analytics: section.analytics || {},
        settings: section.settings || {},
      },
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);

    return success(res, {
      guildId,
      config: section,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/forms', (req, res) => {
  try {
    const guildId = getGuildId(req);
    return success(res, {
      guildId,
      forms: formStore.listForms(guildId),
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/forms/:formId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const form = formStore.getForm(guildId, req.params.formId);

    if (!form) {
      return failure(res, new Error('Form not found.'), 404);
    }

    return success(res, { guildId, form });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/forms', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    await guardFormStaffRoles(req, guildId, req.body || {}, 'forms.create_staff_roles');

    const saved = formStore.saveForm(guildId, req.body || {});

    return success(res, {
      guildId,
      form: saved,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/forms/:formId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    await guardFormStaffRoles(req, guildId, req.body || {}, 'forms.update_staff_roles');

    const saved = formStore.saveForm(guildId, {
      ...(req.body || {}),
      formId: req.params.formId,
    });

    return success(res, {
      guildId,
      form: saved,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/forms/:formId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const existing = formStore.getForm(guildId, req.params.formId);

    if (!existing) {
      return failure(res, new Error('Form not found.'), 404);
    }

    const saved = formStore.saveForm(guildId, {
      ...existing,
      enabled: req.body?.enabled !== false,
    });

    return success(res, {
      guildId,
      form: saved,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/panels', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);

    return success(res, {
      guildId,
      panels: Object.values(section.panels || {}),
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/panels', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const panel = formStore.savePanel(guildId, req.body || {});

    return success(res, {
      guildId,
      panel,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/panels/:panelId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const panel = formStore.savePanel(guildId, {
      ...(req.body || {}),
      panelId: req.params.panelId,
    });

    return success(res, {
      guildId,
      panel,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/submissions', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const submissions = filterSubmissions(
      Object.values(section.submissions || {}),
      req.query
    );

    return success(res, {
      guildId,
      submissions: sortByNewest(submissions).slice(0, limit),
      total: submissions.length,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/submissions/:submissionId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);
    const submission = section.submissions?.[formStore.cleanKey(req.params.submissionId)];

    if (!submission) {
      return failure(res, new Error('Submission not found.'), 404);
    }

    return success(res, {
      guildId,
      submission,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/submissions/:submissionId/status', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const status = String(req.body?.status || '').trim().toLowerCase();

    if (!['pending', 'approved', 'denied', 'closed'].includes(status)) {
      throw new Error('Invalid submission status.');
    }

    const updated = formStore.updateSubmission(guildId, req.params.submissionId, {
      status,
      reviewedBy: req.body?.reviewedBy || null,
      reviewedAt: ['approved', 'denied', 'closed'].includes(status) ? new Date().toISOString() : null,
    });

    if (!updated) {
      return failure(res, new Error('Submission not found.'), 404);
    }

    if (status === 'approved') {
      formStore.incrementAnalytics(guildId, { approved: 1 });
    }

    if (status === 'denied') {
      formStore.incrementAnalytics(guildId, { denied: 1 });
    }

    return success(res, {
      guildId,
      submission: updated,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/settings', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    await guardFormStaffRoles(req, guildId, req.body || {}, 'forms.settings_staff_roles');

    const section = formStore.updateFormsSection(guildId, (current) => ({
      ...current,
      enabled: req.body?.enabled !== false,
      settings: {
        ...(current.settings || {}),
        ...(req.body?.settings || {}),
      },
    }));

    return success(res, {
      guildId,
      config: section,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
