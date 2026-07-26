'use strict';

const express = require('express');
const temporaryRoles = require('./temporaryRoles');
const temporaryRolesHealth = require('./temporaryRolesHealth');
const { validateRoleSelection, isGoliathPermissionError } = require('../../../core/security/goliathPermissionGuard');

const router = express.Router();
const ok = (res, payload = {}) => res.json({ success: true, ...payload });

function fail(res, error, status = 400) {
  if (isGoliathPermissionError(error)) {
    return res.status(403).json({ success: false, code: error.code, error: error.message, ...(error.details || {}) });
  }
  return res.status(status).json({ success: false, error: error.message || 'Temporary Roles request failed.' });
}

function guildId(req) {
  const id = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(id)) throw new Error('Invalid guild ID.');
  return id;
}

const actor = (req) => String(req.session?.user?.id || req.body?.actorId || '').trim() || null;
const client = (req) => req.client || req.app?.get?.('goliath.client') || null;

async function guild(req, id) {
  const discord = client(req);
  return discord?.guilds?.cache?.get(id) || await discord?.guilds?.fetch?.(id).catch(() => null);
}

async function overview(req, id) {
  const config = temporaryRoles.getSection(id);
  const target = await guild(req, id);
  return {
    guildId: id,
    config,
    overview: {
      enabled: config.enabled !== false,
      activeAssignments: temporaryRoles.listAssignments(id, { activeOnly: true }).length,
      analytics: config.analytics,
      health: target ? await temporaryRolesHealth.buildHealth(target) : null,
    },
  };
}

router.get('/:guildId/overview', async (req, res) => {
  try { return ok(res, await overview(req, guildId(req))); }
  catch (error) { return fail(res, error); }
});

router.patch('/:guildId/enabled', async (req, res) => {
  try {
    const id = guildId(req);
    temporaryRoles.setEnabled(id, req.body?.enabled === true, { actorId: actor(req) });
    return ok(res, await overview(req, id));
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId/assign', async (req, res) => {
  try {
    const id = guildId(req);
    const target = await guild(req, id);
    if (!target) throw new Error('Guild is unavailable.');
    await validateRoleSelection(target, [req.body?.roleId].filter(Boolean), { scope: 'temporary_roles.assign', requireManageable: true });
    const assignment = await temporaryRoles.assignTemporaryRole({
      guild: target,
      memberId: req.body?.memberId,
      roleId: req.body?.roleId,
      value: req.body?.value,
      unit: req.body?.unit,
      reason: req.body?.reason,
      assignedBy: actor(req),
    });
    return ok(res, { assignment, ...(await overview(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.delete('/:guildId/assignments/:assignmentId', async (req, res) => {
  try {
    const id = guildId(req);
    const target = await guild(req, id);
    if (!target) throw new Error('Guild is unavailable.');
    await temporaryRoles.removeAssignment(target, req.params.assignmentId, { actorId: actor(req) });
    return ok(res, await overview(req, id));
  } catch (error) { return fail(res, error, error.message === 'Temporary role assignment not found.' ? 404 : 400); }
});

router.post('/:guildId/scan', async (req, res) => {
  try {
    const id = guildId(req);
    const target = await guild(req, id);
    if (!target) throw new Error('Guild is unavailable.');
    const result = await temporaryRoles.scanExpired(target, { actorId: actor(req) });
    return ok(res, { result, ...(await overview(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId/repair', async (req, res) => {
  try {
    const id = guildId(req);
    const target = await guild(req, id);
    if (!target) throw new Error('Guild is unavailable.');
    const result = await temporaryRolesHealth.repair(target, { actorId: actor(req) });
    return ok(res, { result, ...(await overview(req, id)) });
  } catch (error) { return fail(res, error); }
});

router.get('/:guildId/export', (req, res) => {
  try {
    const id = guildId(req);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="goliath-temporary-roles-${id}.json"`);
    return res.send(JSON.stringify(temporaryRoles.exportConfiguration(id), null, 2));
  } catch (error) { return fail(res, error); }
});

module.exports = router;
