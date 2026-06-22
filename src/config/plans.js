'use strict';

const PLAN_IDS = Object.freeze({
  FREE: 'free',
  PLUS: 'plus',
  PRO: 'pro',
  LIFETIME: 'lifetime',
});

const FEATURE_KEYS = Object.freeze({
  TICKETS_BASIC: 'tickets.basic',
  TICKETS_ADVANCED: 'tickets.advanced',
  FORMS_BASIC: 'forms.basic',
  FORMS_ADVANCED: 'forms.advanced',
  EMBEDS_BASIC: 'embeds.basic',
  EMBEDS_PRESETS: 'embeds.presets',
  MODERATION_BASIC: 'moderation.basic',
  DASHBOARD_BASIC: 'dashboard.basic',
  SECURITY_BASIC: 'security.basic',
  SECURITY_ADVANCED: 'security.advanced',
  BACKUPS_RESTORE: 'backup.restore',
  TRANSLATION_HUB: 'translation.hub',
  ANALYTICS_BASIC: 'analytics.basic',
  ANALYTICS_ADVANCED: 'analytics.advanced',
  PREMIUM_MODULES: 'modules.premium',
});

const FREE_FEATURES = Object.freeze([
  FEATURE_KEYS.TICKETS_BASIC,
  FEATURE_KEYS.FORMS_BASIC,
  FEATURE_KEYS.EMBEDS_BASIC,
  FEATURE_KEYS.MODERATION_BASIC,
  FEATURE_KEYS.DASHBOARD_BASIC,
  FEATURE_KEYS.SECURITY_BASIC,
]);

const PLUS_FEATURES = Object.freeze([
  ...FREE_FEATURES,
  FEATURE_KEYS.TICKETS_ADVANCED,
  FEATURE_KEYS.FORMS_ADVANCED,
  FEATURE_KEYS.EMBEDS_PRESETS,
  FEATURE_KEYS.ANALYTICS_BASIC,
]);

const PRO_FEATURES = Object.freeze([
  ...PLUS_FEATURES,
  FEATURE_KEYS.TRANSLATION_HUB,
  FEATURE_KEYS.SECURITY_ADVANCED,
  FEATURE_KEYS.BACKUPS_RESTORE,
  FEATURE_KEYS.ANALYTICS_ADVANCED,
  FEATURE_KEYS.PREMIUM_MODULES,
]);

const PLAN_DEFINITIONS = Object.freeze({
  [PLAN_IDS.FREE]: Object.freeze({
    id: PLAN_IDS.FREE,
    name: 'Basic',
    icon: '🆓',
    public: true,
    rank: 0,
    features: FREE_FEATURES,
    limits: Object.freeze({
      ticketPanels: 2,
      forms: 3,
      embedPresets: 5,
      activeTicketsPerUser: 2,
      translationsPerMonth: 0,
    }),
  }),

  [PLAN_IDS.PLUS]: Object.freeze({
    id: PLAN_IDS.PLUS,
    name: 'Plus',
    icon: '⭐',
    public: true,
    rank: 10,
    features: PLUS_FEATURES,
    limits: Object.freeze({
      ticketPanels: 15,
      forms: 25,
      embedPresets: 50,
      activeTicketsPerUser: 5,
      translationsPerMonth: 0,
    }),
  }),

  [PLAN_IDS.PRO]: Object.freeze({
    id: PLAN_IDS.PRO,
    name: 'Pro',
    icon: '👑',
    public: true,
    rank: 20,
    features: PRO_FEATURES,
    limits: Object.freeze({
      ticketPanels: null,
      forms: null,
      embedPresets: null,
      activeTicketsPerUser: null,
      translationsPerMonth: null,
    }),
  }),

  [PLAN_IDS.LIFETIME]: Object.freeze({
    id: PLAN_IDS.LIFETIME,
    name: 'Lifetime',
    icon: '💎',
    public: false,
    rank: 20,
    features: PRO_FEATURES,
    limits: Object.freeze({
      ticketPanels: null,
      forms: null,
      embedPresets: null,
      activeTicketsPerUser: null,
      translationsPerMonth: null,
    }),
  }),
});

function normalizePlanId(planId) {
  const key = String(planId || PLAN_IDS.FREE).trim().toLowerCase();
  return PLAN_DEFINITIONS[key] ? key : PLAN_IDS.FREE;
}

function getPlanDefinition(planId) {
  return PLAN_DEFINITIONS[normalizePlanId(planId)];
}

function getPlanFeatures(planId) {
  return [...getPlanDefinition(planId).features];
}

function getPlanLimits(planId) {
  return { ...getPlanDefinition(planId).limits };
}

function planHasFeature(planId, featureKey) {
  return getPlanFeatures(planId).includes(String(featureKey || '').trim());
}

function getRequiredPlanForFeature(featureKey) {
  const key = String(featureKey || '').trim();
  return Object.values(PLAN_DEFINITIONS)
    .filter((plan) => plan.public !== false)
    .sort((a, b) => a.rank - b.rank)
    .find((plan) => plan.features.includes(key)) || null;
}

module.exports = {
  PLAN_IDS,
  FEATURE_KEYS,
  PLAN_DEFINITIONS,
  normalizePlanId,
  getPlanDefinition,
  getPlanFeatures,
  getPlanLimits,
  planHasFeature,
  getRequiredPlanForFeature,
};
