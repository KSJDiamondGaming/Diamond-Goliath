const fs = require('fs');
const path = require('path');

const dataDir = path.join(process.cwd(), 'data');
const filePath = path.join(dataDir, 'embedTemplates.json');

function ensureFile() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({}, null, 2), 'utf8');
  }
}

function readStore() {
  ensureFile();

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw || '{}');
  } catch (error) {
    console.error('[embedStore] Failed to read store:', error);
    return {};
  }
}

function writeStore(data) {
  ensureFile();

  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error('[embedStore] Failed to write store:', error);
  }
}

function defaultTemplate() {
  return {
    title: '',
    description: '',
    color: '#5865F2',
    footer: '',
    image: '',
    thumbnail: '',
    authorName: '',
    authorIcon: '',
    authorUrl: '',
    channelId: '',
    content: '',
    buttons: []
  };
}

function sanitizeButton(button = {}) {
  return {
    label: button.label || '',
    style: button.style || 'Link',
    url: button.url || '',
    customId: button.customId || '',
    emoji: button.emoji || '',
    disabled: Boolean(button.disabled)
  };
}

function sanitizeTemplate(template = {}) {
  return {
    title: template.title || '',
    description: template.description || '',
    color: template.color || '#5865F2',
    footer: template.footer || '',
    image: template.image || '',
    thumbnail: template.thumbnail || '',
    authorName: template.authorName || '',
    authorIcon: template.authorIcon || '',
    authorUrl: template.authorUrl || '',
    channelId: template.channelId || '',
    content: template.content || '',
    buttons: Array.isArray(template.buttons)
      ? template.buttons.slice(0, 5).map(sanitizeButton)
      : []
  };
}

function getGuildData(guildId) {
  const store = readStore();

  if (!store[guildId]) {
    store[guildId] = { embeds: {} };
    writeStore(store);
  }

  return store[guildId];
}

function getEmbedTemplate(guildId, type) {
  const guildData = getGuildData(guildId);
  const template = guildData.embeds[type];

  if (!template) return null;
  return sanitizeTemplate(template);
}

function saveEmbedTemplate(guildId, type, template) {
  const store = readStore();

  if (!store[guildId]) {
    store[guildId] = { embeds: {} };
  }

  store[guildId].embeds[type] = sanitizeTemplate({
    ...defaultTemplate(),
    ...template
  });

  writeStore(store);
  return store[guildId].embeds[type];
}

function deleteEmbedTemplate(guildId, type) {
  const store = readStore();

  if (!store[guildId] || !store[guildId].embeds[type]) {
    return false;
  }

  delete store[guildId].embeds[type];
  writeStore(store);
  return true;
}

function clearAllGuildTemplates(guildId) {
  const store = readStore();

  if (!store[guildId]) {
    store[guildId] = { embeds: {} };
  }

  store[guildId].embeds = {};
  writeStore(store);
  return true;
}

module.exports = {
  defaultTemplate,
  getGuildData,
  getEmbedTemplate,
  saveEmbedTemplate,
  deleteEmbedTemplate,
  clearAllGuildTemplates
};