'use strict';

const {
  PLAN_IDS,
  getPlanDefinition,
  getPlanFeatures,
  getPlanLimits,
  planHasFeature,
  getRequiredPlanForFeature,
} = require('../config/plans');

const subscriptionManager = require('./subscriptionManager');

function getPlan(guildId) {
  return subscriptionManager.getActivePlan(guildId);
}

function getSubscription(guildId) {
  return subscriptionManager.getSubscription(guildId);
}

function getCurrentPlanDefinition(guildId) {
  return getPlanDefinition(getPlan(guildId));
}

function getFeatures(guildId) {
  return getPlanFeatures(getPlan(guildId));
}

function getLimits(guildId) {
  return getPlanLimits(getPlan(guildId));
}

function canUseFeature(guildId, featureKey) {
  return planHasFeature(getPlan(guildId), featureKey);
}

function requireFeature(guildId, featureKey) {
  if (canUseFeature(guildId, featureKey)) return true;

  const requiredPlan = getRequiredPlanForFeature(featureKey);
  const planName = requiredPlan?.name || 'Plus or Pro';
  const error = new Error(`This feature requires Goliath ${planName}.`);
  error.code = 'FEATURE_LOCKED';
  error.featureKey = featureKey;
  error.requiredPlan = requiredPlan?.id || PLAN_IDS.PLUS;
  error.currentPlan = getPlan(guildId);
  throw error;
}

function isPremium(guildId) {
  return subscriptionManager.hasActivePremium(guildId);
}

function isPro(guildId) {
  return subscriptionManager.hasActivePro(guildId);
}

function isLifetime(guildId) {
  return getPlan(guildId) === PLAN_IDS.LIFETIME;
}

function getLimit(guildId, limitKey, fallback = null) {
  const limits = getLimits(guildId);
  return Object.prototype.hasOwnProperty.call(limits, limitKey) ? limits[limitKey] : fallback;
}

function isWithinLimit(guildId, limitKey, currentValue) {
  const limit = getLimit(guildId, limitKey, null);
  if (limit == null) return true;
  return Number(currentValue || 0) < Number(limit);
}

function requireWithinLimit(guildId, limitKey, currentValue) {
  if (isWithinLimit(guildId, limitKey, currentValue)) return true;

  const error = new Error('You have reached the limit for your current Goliath plan.');
  error.code = 'PLAN_LIMIT_REACHED';
  error.limitKey = limitKey;
  error.limit = getLimit(guildId, limitKey, null);
  error.currentValue = Number(currentValue || 0);
  error.currentPlan = getPlan(guildId);
  throw error;
}

function getEntitlementSummary(guildId) {
  const subscription = getSubscription(guildId);
  const plan = getCurrentPlanDefinition(guildId);

  return {
    subscription,
    plan,
    features: getFeatures(guildId),
    limits: getLimits(guildId),
    premium: isPremium(guildId),
    pro: isPro(guildId),
    lifetime: isLifetime(guildId),
  };
}

module.exports = {
  getPlan,
  getSubscription,
  getCurrentPlanDefinition,
  getFeatures,
  getLimits,
  getLimit,
  canUseFeature,
  requireFeature,
  isPremium,
  isPro,
  isLifetime,
  isWithinLimit,
  requireWithinLimit,
  getEntitlementSummary,
};
