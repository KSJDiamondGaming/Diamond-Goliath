const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', '..', '..', 'data');
const filePath = path.join(dataDir, 'embedTemplates.json');

function ensureFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ guilds: {} }, null, 2));
  }
}

function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { guilds: {} };
  }

  if (!raw.guilds || typeof raw.guilds !== 'object' || Array.isArray(raw.guilds)) {
    raw.guilds = {};
  }

  return raw;
}

function readStore() {
  ensureFile();

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const normalized = normalizeStore(parsed);
    writeStore(normalized);
    return normalized;
  } catch {
    const fallback = { guilds: {} };
    writeStore(fallback);
    return fallback;
  }
}

function writeStore(data) {
  ensureFile();
  fs.writeFileSync(filePath, JSON.stringify(normalizeStore(data), null, 2));
}

function ensureGuild(store, guildId) {
  store.guilds = store.guilds && typeof store.guilds === 'object' ? store.guilds : {};

  if (!store.guilds[guildId] || typeof store.guilds[guildId] !== 'object') {
    store.guilds[guildId] = {
      templates: [],
    };
  }

  if (!Array.isArray(store.guilds[guildId].templates)) {
    store.guilds[guildId].templates = [];
  }
}

function createTemplate(guildId, name) {
  const store = readStore();
  ensureGuild(store, guildId);

  const template = {
    id: `tpl_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
    name,
    channelId: null,
    messageContent: '',
    embed: {
      title: '',
      description: '',
      color: '#5865F2',
      footer: '',
      image: '',
      thumbnail: '',
      authorName: '',
      authorIcon: '',
      authorUrl: '',
    },
    buttons: [],
  };

  store.guilds[guildId].templates.push(template);
  writeStore(store);

  return template;
}

function getTemplates(guildId) {
  const store = readStore();
  ensureGuild(store, guildId);
  return store.guilds[guildId].templates;
}

function getTemplate(guildId, templateId) {
  const templates = getTemplates(guildId);
  return templates.find((t) => t.id === templateId) || null;
}

function updateTemplate(guildId, templateId, updates) {
  const store = readStore();
  ensureGuild(store, guildId);

  const template = store.guilds[guildId].templates.find((t) => t.id === templateId);
  if (!template) return null;

  Object.assign(template, updates);

  writeStore(store);
  return template;
}

function updateTemplateEmbed(guildId, templateId, embedUpdates) {
  const store = readStore();
  ensureGuild(store, guildId);

  const template = store.guilds[guildId].templates.find((t) => t.id === templateId);
  if (!template) return null;

  template.embed = {
    ...template.embed,
    ...embedUpdates,
  };

  writeStore(store);
  return template;
}

function updateTemplateButtons(guildId, templateId, buttons) {
  const store = readStore();
  ensureGuild(store, guildId);

  const template = store.guilds[guildId].templates.find((t) => t.id === templateId);
  if (!template) return null;

  template.buttons = Array.isArray(buttons) ? buttons.slice(0, 5) : [];

  writeStore(store);
  return template;
}

function deleteTemplate(guildId, templateId) {
  const store = readStore();
  ensureGuild(store, guildId);

  store.guilds[guildId].templates =
    store.guilds[guildId].templates.filter((t) => t.id !== templateId);

  writeStore(store);
}

module.exports = {
  createTemplate,
  getTemplates,
  getTemplate,
  updateTemplate,
  updateTemplateEmbed,
  updateTemplateButtons,
  deleteTemplate,
};