'use strict';

// src/modules/admin/moduleRouter.js

const path = require('path');

const MODULE_REGISTRY = {
  verification: {
    key: 'verification',
    label: 'Verification',
    menuPath: path.join('..', 'verification', 'verificationMenu'),
    managerPath: path.join('..', 'verification', 'verificationManager'),
    storePath: path.join('..', 'verification', 'verificationStore'),
  },
  autoRoles: {
    key: 'autoRoles',
    label: 'Auto Roles',
    menuPath: path.join('..', 'autoRoles', 'autoRoleMenu'),
    managerPath: path.join('..', 'autoRoles', 'autoRoleManager'),
    storePath: path.join('..', 'autoRoles', 'autoRoleStore'),
  },
  forms: {
    key: 'forms',
    label: 'Forms',
    managerPath: path.join('..', 'forms', 'formManager'),
    storePath: path.join('..', 'forms', 'formStore'),
  },
  tickets: {
    key: 'tickets',
    label: 'Tickets',
    managerPath: path.join('..', 'tickets', 'ticketManager'),
  },
  translation: {
    key: 'translation',
    label: 'Translation',
  },
  embedStudio: {
    key: 'embedStudio',
    label: 'Embed Studio',
  },
};

function safeRequire(modulePath) {
  if (!modulePath) return null;

  try {
    return require(modulePath);
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }
    return null;
  }
}

function listModules() {
  return Object.values(MODULE_REGISTRY).map(({ key, label }) => ({ key, label }));
}

function hasModule(moduleKey) {
  return Boolean(MODULE_REGISTRY[moduleKey]);
}

function getModuleDefinition(moduleKey) {
  const definition = MODULE_REGISTRY[moduleKey];
  if (!definition) return null;

  return {
    ...definition,
    menu: safeRequire(definition.menuPath),
    manager: safeRequire(definition.managerPath),
    store: safeRequire(definition.storePath),
  };
}

function getAllModuleDefinitions() {
  return Object.keys(MODULE_REGISTRY)
    .map((key) => getModuleDefinition(key))
    .filter(Boolean);
}

function requireModuleDefinition(moduleKey) {
  const definition = getModuleDefinition(moduleKey);
  if (!definition) {
    throw new Error(`Unknown admin module: ${moduleKey}`);
  }
  return definition;
}

module.exports = {
  MODULE_REGISTRY,
  listModules,
  hasModule,
  getAllModuleDefinitions,
  getModuleDefinition,
  requireModuleDefinition,
};