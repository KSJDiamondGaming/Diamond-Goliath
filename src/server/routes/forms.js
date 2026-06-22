'use strict';

// src/server/routes/forms.js

const express = require('express');

const formStore = require('../../modules/forms/formStore');
const formManager = require('../../modules/forms/formManager');
const planLimitManager = require('../../managers/planLimitManager');
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

  if (error?.code === 'PLAN_LIMIT_REACHED') {
    return res.status(403).json({
      success: false,
      code: error.code,
      error: error.message,
      limitKey: error.limitKey,
      label: error.label,
      currentPlan: error.currentPlan,
      currentPlanName: error.currentPlanName,
      currentCount: error.currentCount,
      limit: error.limit,
      remaining: error.remaining,
      upgradeHint: error.upgradeHint,
    });
  }

  return res.status(status).json({
    success: false,
    error: error.message || 'Forms API request failed.',
  });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{16,25}$/.test(guildId)) throw new Error('Invalid guild ID.');
  return guildId;
}

async function fetchGuild(req, guildId) {
  const client = req.app?.locals?.client || req.app?.locals?.discordClient || global.client || global.discordClient;
  if (!client?.guilds?.fetch) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

async function fetchGuildChannel(req, guildId, channelId) {
  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');
  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel) throw new Error('Panel channel is unavailable.');
  return channel;
}

function cleanRoleIds(roleIds = []) {
  return [...new Set((Array.isArray(roleIds) ? roleIds : [roleIds]).map((roleId) => String(roleId || '').replace(/[<@&>]/g, '').trim()).filter((roleId) => /^\d{15,25}$/.test(roleId)))];
}

async function guardFormStaffRoles(req, guildId, input = {}, scope = 'forms.staff_roles') {
  const actionRoleIds = input.actions?.pingRoleIds || input.workflowActions?.pingRoleIds || [];
  const roleIds = cleanRoleIds([...(input.staffRoleIds || input.settings?.staffRoleIds || []), ...actionRoleIds]);
  if (!roleIds.length) return null;
  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error('Guild is unavailable.');
  const result = await validateRoleSelection(guild, roleIds, { scope, requireManageable: true });
  if (!result.ok) throw result.toError();
  return result;
}

function assertFormLimit(guildId) {
  const currentForms = formStore.listForms(guildId).length;
  return planLimitManager.assertCanCreateResource(guildId, 'forms', currentForms, {
    upgradeHint: 'Upgrade to Plus for 25 forms or Pro for unlimited forms.',
  });
}

function sortByNewest(items = []) {
  return [...items].sort((a, b) => (Date.parse(b.createdAt || b.updatedAt || 0) || 0) - (Date.parse(a.createdAt || a.updatedAt || 0) || 0));
}

function filterSubmissions(submissions = [], query = {}) {
  let result = [...submissions];
  if (query.formId) result = result.filter((submission) => submission.formId === formStore.cleanKey(query.formId));
  if (query.status) result = result.filter((submission) => submission.status === String(query.status).trim().toLowerCase());
  if (query.userId) {
    const userId = String(query.userId).replace(/[<@!>]/g, '').trim();
    result = result.filter((submission) => submission.userId === userId);
  }
  return result;
}

function getPanelForms(guildId, panel) {
  return (panel.formIds || []).map((formId) => formStore.getForm(guildId, formId)).filter(Boolean);
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
    return success(res, { guildId, config: formStore.getFormsSection(guildId) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/forms', (req, res) => {
  try {
    const guildId = getGuildId(req);
    return success(res, { guildId, forms: formStore.listForms(guildId) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/forms/:formId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const form = formStore.getForm(guildId, req.params.formId);
    if (!form) return failure(res, new Error('Form not found.'), 404);
    return success(res, { guildId, form });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/forms', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    await guardFormStaffRoles(req, guildId, req.body || {}, 'forms.create_staff_roles');
    assertFormLimit(guildId);
    const saved = formStore.saveForm(guildId, req.body || {});
    return success(res, { guildId, form: saved });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/forms/:formId', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    await guardFormStaffRoles(req, guildId, req.body || {}, 'forms.update_staff_roles');
    const existing = formStore.getForm(guildId, req.params.formId);
    if (!existing) assertFormLimit(guildId);
    const saved = formStore.saveForm(guildId, { ...(req.body || {}), formId: req.params.formId });
    return success(res, { guildId, form: saved });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/forms/:formId/enabled', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const existing = formStore.getForm(guildId, req.params.formId);
    if (!existing) return failure(res, new Error('Form not found.'), 404);
    const saved = formStore.saveForm(guildId, { ...existing, enabled: req.body?.enabled !== false });
    return success(res, { guildId, form: saved });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/panels', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);
    return success(res, { guildId, panels: Object.values(section.panels || {}) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/panels', (req, res) => {
  try {
    const guildId = getGuildId(req);
    return success(res, { guildId, panel: formStore.savePanel(guildId, req.body || {}) });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.put('/:guildId/panels/:panelId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const panel = formStore.savePanel(guildId, { ...(req.body || {}), panelId: req.params.panelId });
    return success(res, { guildId, panel });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/panels/:panelId/deploy', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const panel = formStore.getPanel(guildId, req.params.panelId);
    if (!panel) return failure(res, new Error('Panel not found.'), 404);
    if (!panel.channelId) throw new Error('Panel needs a target channel before deployment.');
    const channel = await fetchGuildChannel(req, guildId, panel.channelId);
    const saved = await formManager.deployFormPanel(channel, panel, channel.guild);
    return success(res, { guildId, panel: saved, message: 'Panel deployed.' });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.post('/:guildId/panels/:panelId/refresh', async (req, res) => {
  try {
    const guildId = getGuildId(req);
    const panel = formStore.getPanel(guildId, req.params.panelId);
    if (!panel) return failure(res, new Error('Panel not found.'), 404);
    if (!panel.channelId || !panel.messageId) throw new Error('Panel must be deployed before it can be refreshed.');
    const channel = await fetchGuildChannel(req, guildId, panel.channelId);
    const message = await channel.messages.fetch(panel.messageId).catch(() => null);
    if (!message) throw new Error('Existing panel message was not found. Deploy a new panel instead.');
    const forms = getPanelForms(guildId, panel);
    await message.edit({ embeds: [formManager.buildFormPanelEmbed(panel, forms)], components: formManager.buildFormPanelRows(panel, forms) });
    const saved = formStore.savePanel(guildId, panel, channel.guild);
    return success(res, { guildId, panel: saved, message: 'Panel refreshed.' });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/submissions', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 200);
    const submissions = filterSubmissions(Object.values(section.submissions || {}), req.query);
    return success(res, { guildId, submissions: sortByNewest(submissions).slice(0, limit), total: submissions.length });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/:guildId/submissions/:submissionId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const section = formStore.getFormsSection(guildId);
    const submission = section.submissions?.[formStore.cleanKey(req.params.submissionId)];
    if (!submission) return failure(res, new Error('Submission not found.'), 404);
    return success(res, { guildId, submission });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.patch('/:guildId/submissions/:submissionId/status', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!formStore.SUBMISSION_STATUSES.includes(status)) throw new Error('Invalid submission status.');

    let updated;
    if (['approved', 'denied', 'request_info'].includes(status)) {
      updated = formStore.recordSubmissionDecision(guildId, req.params.submissionId, {
        status,
        reviewedBy: req.session?.user?.id || req.body?.reviewedBy || null,
        notes: req.body?.notes || '',
        templateKey: req.body?.templateKey || status,
      });
    } else {
      updated = formStore.updateSubmission(guildId, req.params.submissionId, {
        status,
        reviewedBy: req.body?.reviewedBy || null,
        reviewedAt: status === 'closed' ? new Date().toISOString() : null,
      });
      if (updated) {
        formStore.addSubmissionTimeline(guildId, req.params.submissionId, {
          type: `status_${status}`,
          label: `Status changed to ${status}`,
          actorId: req.session?.user?.id || req.body?.reviewedBy || null,
        });
      }
    }

    if (!updated) return failure(res, new Error('Submission not found.'), 404);
    return success(res, { guildId, submission: updated });
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
      settings: { ...(current.settings || {}), ...(req.body?.settings || {}) },
    }));
    return success(res, { guildId, config: section });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
