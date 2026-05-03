const fs = require('fs');
const path = require('path');

const PRESETS_DIR = path.join(__dirname, '../../data/presets');

const presetCache = new Map();

/* ---------------- BASIC HELPERS ---------------- */

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function ensureDir() {
  fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

function normalizeGuildId(guildId) {
  const id = String(guildId || '').trim();

  if (!/^\d{16,20}$/.test(id)) {
    throw new Error(`Invalid guild ID: ${guildId}`);
  }

  return id;
}

function sanitizePresetName(name) {
  const safeName = String(name || '').trim();

  if (!safeName) {
    throw new Error('Preset name is required.');
  }

  return safeName.slice(0, 50);
}

function getFile(guildId) {
  ensureDir();

  return path.join(PRESETS_DIR, `${normalizeGuildId(guildId)}.json`);
}

function readJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) return clone(fallback);

    const raw = fs.readFileSync(filePath, 'utf8');
    if (!raw.trim()) return clone(fallback);

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return clone(fallback);
    }

    return parsed;
  } catch (error) {
    console.error(`Failed to read presets JSON from ${filePath}:`, error);
    return clone(fallback);
  }
}

function writeJson(filePath, data) {
  ensureDir();

  const tempPath = `${filePath}.tmp`;

  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tempPath, filePath);
}

/* ---------------- LOAD / SAVE ---------------- */

function loadPresets(guildId, options = {}) {
  const safeGuildId = normalizeGuildId(guildId);

  if (!options.forceReload && presetCache.has(safeGuildId)) {
    return clone(presetCache.get(safeGuildId));
  }

  const file = getFile(safeGuildId);
  const presets = readJson(file, {});

  presetCache.set(safeGuildId, clone(presets));

  return clone(presets);
}

function savePresets(guildId, data = {}) {
  const safeGuildId = normalizeGuildId(guildId);
  const file = getFile(safeGuildId);

  const presets =
    data && typeof data === 'object' && !Array.isArray(data) ? data : {};

  const nextData = {
    ...clone(presets),
    updatedAt: new Date().toISOString(),
  };

  writeJson(file, nextData);

  presetCache.set(safeGuildId, clone(nextData));

  return clone(nextData);
}

/* ---------------- CORE ---------------- */

function savePreset(guildId, name, embedData = {}) {
  const presetName = sanitizePresetName(name);
  const presets = loadPresets(guildId);

  presets[presetName] = {
    ...clone(embedData),
    name: presetName,
    updatedAt: new Date().toISOString(),
  };

  const saved = savePresets(guildId, presets);

  return clone(saved[presetName]);
}

function getPreset(guildId, name) {
  const presetName = sanitizePresetName(name);
  const presets = loadPresets(guildId);

  return presets[presetName] && typeof presets[presetName] === 'object'
    ? clone(presets[presetName])
    : null;
}

function getAllPresets(guildId) {
  return loadPresets(guildId);
}

function deletePreset(guildId, name) {
  const presetName = sanitizePresetName(name);
  const presets = loadPresets(guildId);

  if (!Object.prototype.hasOwnProperty.call(presets, presetName)) {
    return false;
  }

  delete presets[presetName];

  savePresets(guildId, presets);

  return true;
}

function renamePreset(guildId, oldName, newName) {
  const currentName = sanitizePresetName(oldName);
  const nextName = sanitizePresetName(newName);
  const presets = loadPresets(guildId);

  if (!presets[currentName]) {
    return null;
  }

  if (presets[nextName]) {
    throw new Error(`Preset "${nextName}" already exists.`);
  }

  presets[nextName] = {
    ...clone(presets[currentName]),
    name: nextName,
    updatedAt: new Date().toISOString(),
  };

  delete presets[currentName];

  const saved = savePresets(guildId, presets);

  return clone(saved[nextName]);
}

function duplicatePreset(guildId, sourceName, duplicateName) {
  const sourcePresetName = sanitizePresetName(sourceName);
  const newPresetName = sanitizePresetName(duplicateName);
  const presets = loadPresets(guildId);

  if (!presets[sourcePresetName]) {
    return null;
  }

  if (presets[newPresetName]) {
    throw new Error(`Preset "${newPresetName}" already exists.`);
  }

  presets[newPresetName] = {
    ...clone(presets[sourcePresetName]),
    name: newPresetName,
    updatedAt: new Date().toISOString(),
  };

  const saved = savePresets(guildId, presets);

  return clone(saved[newPresetName]);
}

/* ---------------- CACHE ---------------- */

function reloadPresets(guildId) {
  const safeGuildId = normalizeGuildId(guildId);

  presetCache.delete(safeGuildId);

  return loadPresets(safeGuildId, { forceReload: true });
}

function clearPresetCache(guildId = null) {
  if (guildId) {
    presetCache.delete(normalizeGuildId(guildId));
    return;
  }

  presetCache.clear();
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  PRESETS_DIR,

  loadPresets,
  savePresets,

  savePreset,
  getPreset,
  getAllPresets,
  deletePreset,
  renamePreset,
  duplicatePreset,

  reloadPresets,
  clearPresetCache,
};