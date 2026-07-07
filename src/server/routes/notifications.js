'use strict';

const express = require('express');
const store = require('../../core/notifications/notificationStore');

const router = express.Router();

function ok(res, payload = {}) { return res.json({ success: true, ...payload }); }
function fail(res, error, status = 400) { return res.status(status).json({ success: false, error: error.message || 'Notification request failed.' }); }
function guildId(req) {
  const id = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(id)) throw new Error('Invalid guild ID.');
  return id;
}

router.get('/:guildId', (req, res) => {
  try {
    const id = guildId(req);
    const notifications = store.listNotifications(id, {
      unreadOnly: req.query.unread === 'true',
      source: req.query.source || '',
      level: req.query.level || '',
      limit: req.query.limit || 100,
    });
    return ok(res, { guildId: id, notifications, summary: store.summary(id) });
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId', (req, res) => {
  try {
    const id = guildId(req);
    const notification = store.addNotification(id, req.body || {});
    return ok(res, { guildId: id, notification, notifications: store.listNotifications(id), summary: store.summary(id) });
  } catch (error) { return fail(res, error); }
});

router.patch('/:guildId/:notificationId/read', (req, res) => {
  try {
    const id = guildId(req);
    const notification = store.markRead(id, req.params.notificationId, req.body?.read !== false);
    return ok(res, { guildId: id, notification, notifications: store.listNotifications(id), summary: store.summary(id) });
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId/mark-all-read', (req, res) => {
  try {
    const id = guildId(req);
    return ok(res, { guildId: id, notifications: store.markAllRead(id), summary: store.summary(id) });
  } catch (error) { return fail(res, error); }
});

router.delete('/:guildId', (req, res) => {
  try {
    const id = guildId(req);
    return ok(res, { guildId: id, notifications: store.clearNotifications(id), summary: store.summary(id) });
  } catch (error) { return fail(res, error); }
});

router.post('/:guildId/test', (req, res) => {
  try {
    const id = guildId(req);
    const notification = store.addNotification(id, {
      level: req.body?.level || 'info',
      source: req.body?.source || 'dashboard.test',
      title: req.body?.title || 'Notification Centre Test',
      message: req.body?.message || 'This is a safe dashboard test notification.',
      route: req.body?.route || '/notifications',
    });
    return ok(res, { guildId: id, notification, notifications: store.listNotifications(id), summary: store.summary(id) });
  } catch (error) { return fail(res, error); }
});

module.exports = router;
