'use strict';

// src/guild/moduleSectionManager.js

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

function getModules(guildId) {
  const modules = getGuildSection(guildId, 'modules', {});
  return isPlainObject(modules) ? modules : {};
}

function getModuleSection(guildId, moduleName, fallback = {}) {
  const modules = getModules(guildId);
  const section = modules[moduleName];

  if (!isPlainObject(section)) {
    return clone(fallback);
  }

  return {
    ...clone(fallback),
    ...clone(section),
  };
}

function saveModuleSection(guildId, moduleName, sectionData = {}, guildOrMeta = {}) {
  const nextSection = isPlainObject(sectionData) ? clone(sectionData) : {};

  updateGuildSection(
    guildId,
    'modules',
    (modules = {}) => ({
      ...(isPlainObject(modules) ? modules : {}),
      [moduleName]: {
        ...nextSection,
        updatedAt: new Date().toISOString(),
      },
    }),
    {},
    guildOrMeta
  );

  return getModuleSection(guildId, moduleName, nextSection);
}

function updateModuleSection(guildId, moduleName, updater, fallback = {}, guildOrMeta = {}) {
  const current = getModuleSection(guildId, moduleName, fallback);
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;

  return saveModuleSection(
    guildId,
    moduleName,
    isPlainObject(next) ? next : {},
    guildOrMeta
  );
}

module.exports = {
  getModules,
  getModuleSection,
  saveModuleSection,
  updateModuleSection,
};
