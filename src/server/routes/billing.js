'use strict';

const express = require('express');

const {
  PLAN_DEFINITIONS,
  getPlanDefinition,
} = require('../../config/plans');
const subscriptionManager = require('../../managers/subscriptionManager');
const entitlementManager = require('../../managers/entitlementManager');

const router = express.Router();

function success(res, payload = {}) {
  return res.json({ success: true, ...payload });
}

function failure(res, error, status = 500) {
  console.error('[Billing API]', error);

  return res.status(status).json({
    success: false,
    error: error.message || 'Billing API request failed.',
  });
}

function getGuildId(req) {
  const guildId = String(req.params.guildId || '').trim();
  if (!/^\d{15,25}$/.test(guildId)) {
    throw new Error('Invalid guild ID.');
  }
  return guildId;
}

function publicPlan(plan) {
  return {
    id: plan.id,
    name: plan.name,
    icon: plan.icon,
    public: plan.public !== false,
    rank: plan.rank,
    features: [...(plan.features || [])],
    limits: { ...(plan.limits || {}) },
  };
}

router.get('/plans', (req, res) => {
  try {
    const plans = Object.values(PLAN_DEFINITIONS).map(publicPlan);
    return success(res, { plans });
  } catch (error) {
    return failure(res, error, 500);
  }
});

router.get('/subscription/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const subscription = subscriptionManager.getSubscription(guildId);
    const plan = publicPlan(getPlanDefinition(subscription.plan));

    return success(res, {
      guildId,
      subscription,
      plan,
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

router.get('/entitlements/:guildId', (req, res) => {
  try {
    const guildId = getGuildId(req);
    const summary = entitlementManager.getEntitlementSummary(guildId);

    return success(res, {
      guildId,
      ...summary,
      plan: publicPlan(summary.plan),
    });
  } catch (error) {
    return failure(res, error, 400);
  }
});

module.exports = router;
