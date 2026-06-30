'use strict';

const express = require('express');
const registry = require('../../modules/automation/automationRegistry');
const store = require('../../modules/automation/automationStore');
const simulator = require('../../modules/automation/automationSimulator');

const router = express.Router();

function ok(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function fail(res, error, status = 400) {
  return res.status(error.status || status).json({
    success: false,
    error: error.message || 'Automation request failed.',
    validation: error.validation || null,
  });
}

function guildId(req) {
  const id = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(id)) throw new Error('Invalid guild ID.');
  return id;
}

router.get('/registry', (req, res) => ok(res, {
  triggers: registry.listTriggers(),
  actions: registry.listActions(),
}));

router.get('/:guildId', (req, res) => {
  try {
    const id = guildId(req);
    const rules = store.listRules(id);
    const executions = store.getExecutions(id);
    return ok(res, {
      guildId: id,
      rules,
      executions,
      summary: {
        ruleCount: rules.length,
        enabledCount: rules.filter((rule) => rule.enabled !== false).length,
        executionCount: executions.length,
      },
    });
  } catch (error) {
    return fail(res, error);
  }
});

router.post('/:guildId/rules', (req, res) => {
  try {
    const id = guildId(req);
    const rule = store.saveRule(id, req.body || {});
    return ok(res, { guildId: id, rule, rules: store.listRules(id) });
  } catch (error) {
    return fail(res, error);
  }
});

router.delete('/:guildId/rules/:ruleId', (req, res) => {
  try {
    const id = guildId(req);
    const deleted = store.deleteRule(id, req.params.ruleId);
    return ok(res, { guildId: id, deleted, rules: store.listRules(id) });
  } catch (error) {
    return fail(res, error);
  }
});

router.get('/:guildId/executions', (req, res) => {
  try {
    const id = guildId(req);
    return ok(res, { guildId: id, executions: store.getExecutions(id) });
  } catch (error) {
    return fail(res, error);
  }
});

router.post('/:guildId/rules/:ruleId/simulate', (req, res) => {
  try {
    const id = guildId(req);
    const simulation = simulator.simulateStoredRule(id, req.params.ruleId, req.body?.context || {});
    return ok(res, { guildId: id, simulation, executions: store.getExecutions(id) });
  } catch (error) {
    return fail(res, error);
  }
});

router.post('/:guildId/test-log', (req, res) => {
  try {
    const id = guildId(req);
    const entry = store.logExecution(id, {
      ruleId: req.body?.ruleId || null,
      trigger: req.body?.trigger || 'manual.test',
      status: 'test_logged',
      message: req.body?.message || 'Manual automation test log.',
      context: req.body?.context || {},
    });
    return ok(res, { guildId: id, entry, executions: store.getExecutions(id) });
  } catch (error) {
    return fail(res, error);
  }
});

module.exports = router;
