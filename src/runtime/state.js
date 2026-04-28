/**
 * Global bot state (persistent)
 * Controls maintenance mode and owner bypass
 */

const fs = require('fs');
const path = require('path');

const STATE_PATH = path.join(__dirname, 'state.json');

/* ---------------- INTERNAL ---------------- */

function loadState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return null;
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to load state:', err);
    return null;
  }
}

function saveState(data) {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Failed to save state:', err);
  }
}

/* ---------------- INIT ---------------- */

const saved = loadState();

/* ---------------- STATE ---------------- */

const state = {
  // 🟢 Default: active unless saved otherwise
  isActive: saved?.isActive ?? true,

  // 👑 Owner IDs (bypass maintenance)
  owners: new Set([
    '1168285714732036096',
  ]),

  /* ---------------- CHECKS ---------------- */

  isOwner(userId) {
    return this.owners.has(userId);
  },

  shouldBlock(userId) {
    return !this.isActive && !this.isOwner(userId);
  },

  /* ---------------- CONTROL ---------------- */

  toggle() {
    this.isActive = !this.isActive;
    saveState({ isActive: this.isActive });
    return this.isActive;
  },

  set(value) {
    this.isActive = Boolean(value);
    saveState({ isActive: this.isActive });
  },

  enable() {
    this.set(true);
  },

  disable() {
    this.set(false);
  },
};

module.exports = state;