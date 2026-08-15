'use strict';

// Canonical Social Studio compatibility entry point.
// Legacy UI adapters are retained for interaction compatibility, but routing
// precedence is resolved dynamically by socialStudioRoutingResolver and old
// account-route inheritance is stripped before configuration is persisted.

const store = require('../../modules/socialStudio/socialAlerts/socialStudioStore');
const creatorRouting = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorRoutingCompat');
const userRouting = require('../../modules/socialStudio/socialAlerts/socialStudioUserChannelRouting');
const roleHierarchyCompat = require('../../modules/socialStudio/socialAlerts/socialStudioRoleHierarchyCompat');
const testCompat = require('../../modules/socialStudio/socialAlerts/socialStudioTestCompat');
const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');

function object(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanInheritedAccount(accountValue) {
  const account = { ...object(accountValue), alertChannels: { ...object(accountValue?.alertChannels) } };

  if (account.userRouteBaseCaptured) {
    account.alertChannelId = account.userRouteBaseChannelId || null;
    account.alertChannels = { ...object(account.userRouteBaseChannels) };
    delete account.userRouteBaseCaptured;
    delete account.userRouteBaseChannelId;
    delete account.userRouteBaseChannels;
  }

  if (account.creatorRouteInherited) {
    account.alertChannelId = account.creatorRoutePreviousChannelId || null;
    account.alertChannels = { ...object(account.creatorRoutePreviousChannels) };
    delete account.creatorRouteInherited;
    delete account.creatorRouteChannelId;
    delete account.creatorRoutePreviousChannelId;
    delete account.creatorRoutePreviousChannels;
  }

  return account;
}

function cleanInheritedRouting(configValue) {
  const config = { ...object(configValue), accounts: { ...object(configValue?.accounts) } };
  for (const [accountId, account] of Object.entries(config.accounts)) {
    config.accounts[accountId] = cleanInheritedAccount(account);
  }
  return config;
}

function installPersistenceGuard() {
  if (store.__dynamicSocialRoutingPersistenceGuard) return;
  const originalSaveConfig = store.saveConfig.bind(store);
  store.saveConfig = function saveWithoutInheritedRouting(guildId, config, meta = {}) {
    return originalSaveConfig(guildId, cleanInheritedRouting(config), meta);
  };
  store.__dynamicSocialRoutingPersistenceGuard = true;
}

// The older compatibility modules used these installers to rewrite account
// alertChannelId/alertChannels during account creation. Dynamic routing makes
// those inherited writes unnecessary, so keep the methods callable but inert.
creatorRouting.installStoreCompatibility = () => {};
userRouting.installStoreCompatibility = () => {};
installPersistenceGuard();

const core = require('./socialStudioCreatorRoutingCompatCore');

// Preserve established Social Studio precedence explicitly:
// Test -> Role Hierarchy -> Creator Routing Core -> base creator actions.
if (!creatorCompat.__socialCompatibilityPrecedenceComposed) {
  const baseHandle = typeof creatorCompat.handle === 'function'
    ? creatorCompat.handle.bind(creatorCompat)
    : async () => false;

  creatorCompat.handle = async function handleWithSocialCompatibilityPrecedence(interaction) {
    if (await testCompat.handle(interaction)) return true;
    if (await roleHierarchyCompat.handle(interaction)) return true;
    if (await core.handle(interaction)) return true;
    return baseHandle(interaction);
  };

  creatorCompat.__roleHierarchyCompatPatched = true;
  creatorCompat.__testCompatPatched = true;
  creatorCompat.__socialCompatibilityPrecedenceComposed = true;
}

module.exports = core;
module.exports.cleanInheritedRouting = cleanInheritedRouting;
