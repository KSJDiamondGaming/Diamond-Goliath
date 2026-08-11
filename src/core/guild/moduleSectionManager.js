'use strict';

// src/core/guild/moduleSectionManager.js

const {
  getGuildSection,
  updateGuildSection,
} = require('./guildManager');

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanModuleName(moduleName) {
  const name = String(moduleName || '').trim();
  if (!/^[a-zA-Z0-9_-]{2,80}$/.test(name)) {
    throw new Error(`Invalid module name: ${moduleName}`);
  }
  return name;
}

function prepareSection(_moduleName, sectionData = {}) {
  return isPlainObject(sectionData) ? clone(sectionData) : {};
}

function getModules(guildId) {
  const modules = getGuildSection(guildId, 'modules', {});
  return isPlainObject(modules) ? modules : {};
}

/**
 * Known legacy Role Studio locations. These are copied into the modern module
 * section the first time that module is loaded. The legacy data is retained so
 * migration is non-destructive and can be removed by a dedicated cleanup later.
 */
function getLegacyModuleSection(modules, moduleName) {
  const roles = isPlainObject(modules.roles) ? modules.roles : {};

  if (moduleName === 'autoRoles' && isPlainObject(roles.joinRoles)) {
    return {
      enabled: roles.enabled !== false,
      joinRoles: clone(roles.joinRoles),
      settings: clone(roles.settings || {}),
      analytics: clone(roles.analytics || {}),
    };
  }

  if (moduleName === 'reactionRoles' && isPlainObject(roles.reactionPanels)) {
    return {
      enabled: roles.enabled !== false,
      panels: clone(roles.reactionPanels),
      settings: clone(roles.settings || {}),
      analytics: clone(roles.analytics || {}),
    };
  }

  if (moduleName === 'timedRoles' && isPlainObject(roles.timedRoles)) {
    return {
      enabled: roles.enabled !== false,
      rules: clone(roles.timedRoles),
      settings: clone(roles.settings || {}),
      analytics: clone(roles.analytics || {}),
    };
  }

  return {};
}

/**
 * Ensure modules.<moduleName> exists in the mode-specific guild JSON.
 *
 * This is intentionally called by getModuleSection as well as write methods.
 * Consequently, any new module that uses moduleSectionManager is automatically
 * registered in that guild's single source-of-truth file without adding a
 * second data file or manually editing guild defaults.
 */
function ensureModuleSection(guildId, moduleName, fallback = {}, guildOrMeta = {}) {
  const safeModuleName = cleanModuleName(moduleName);
  const modules = getModules(guildId);
  const current = modules[safeModuleName];

  if (isPlainObject(current)) {
    return {
      ...clone(fallback),
      ...clone(current),
    };
  }

  const legacy = getLegacyModuleSection(modules, safeModuleName);
  const initialSection = {
    ...prepareSection(safeModuleName, fallback),
    ...legacy,
  };

  if (!Object.prototype.hasOwnProperty.call(initialSection, 'enabled')) {
    initialSection.enabled = false;
  }

  initialSection.createdAt = initialSection.createdAt || new Date().toISOString();
  initialSection.updatedAt = new Date().toISOString();

  updateGuildSection(
    guildId,
    'modules',
    (existingModules = {}) => ({
      ...(isPlainObject(existingModules) ? existingModules : {}),
      [safeModuleName]: initialSection,
    }),
    {},
    guildOrMeta
  );

  return clone(initialSection);
}

function getModuleSection(guildId, moduleName, fallback = {}, guildOrMeta = {}) {
  return ensureModuleSection(guildId, moduleName, fallback, guildOrMeta);
}

function saveModuleSection(guildId, moduleName, sectionData = {}, guildOrMeta = {}) {
  const safeModuleName = cleanModuleName(moduleName);
  const currentSection = ensureModuleSection(guildId, safeModuleName, {}, guildOrMeta);
  const nextSection = prepareSection(safeModuleName, sectionData);
  const hasExplicitEnabled = Object.prototype.hasOwnProperty.call(nextSection, 'enabled');

  if (!hasExplicitEnabled && Object.prototype.hasOwnProperty.call(currentSection, 'enabled')) {
    nextSection.enabled = currentSection.enabled !== false;
  }

  if (!Object.prototype.hasOwnProperty.call(nextSection, 'createdAt') && currentSection.createdAt) {
    nextSection.createdAt = currentSection.createdAt;
  }

  updateGuildSection(
    guildId,
    'modules',
    (modules = {}) => ({
      ...(isPlainObject(modules) ? modules : {}),
      [safeModuleName]: {
        ...nextSection,
        updatedAt: new Date().toISOString(),
      },
    }),
    {},
    guildOrMeta
  );

  return ensureModuleSection(guildId, safeModuleName, nextSection, guildOrMeta);
}

function updateModuleSection(guildId, moduleName, updater, fallback = {}, guildOrMeta = {}) {
  const current = ensureModuleSection(guildId, moduleName, fallback, guildOrMeta);
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;

  return saveModuleSection(
    guildId,
    moduleName,
    isPlainObject(next) ? next : {},
    guildOrMeta
  );
}

module.exports = {
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
};
