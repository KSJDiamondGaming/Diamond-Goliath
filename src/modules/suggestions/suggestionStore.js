const fs = require('fs');
const path = require('path');

const DEFAULT_DATA = {
  enabled: true,
  nextId: 1,
  suggestions: [],
};

function getRuntimeRoot(client) {
  return (
    client?.runtimePaths?.mode ||
    process.env.GOLIATH_RUNTIME_PATH ||
    path.join(process.cwd(), 'data')
  );
}

function getSuggestionPath(guildId, client) {
  return path.join(getRuntimeRoot(client), 'guilds', guildId, 'suggestions.json');
}

function cloneDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function loadSuggestions(guildId, client) {
  const filePath = getSuggestionPath(guildId, client);

  if (!fs.existsSync(filePath)) {
    return cloneDefaultData();
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    return {
      ...cloneDefaultData(),
      ...parsed,
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
      nextId: Number(parsed.nextId || 1),
    };
  } catch (error) {
    console.error(`❌ Failed to load suggestions for guild ${guildId}`);
    console.error(error);
    return cloneDefaultData();
  }
}

function saveSuggestions(guildId, data, client) {
  const filePath = getSuggestionPath(guildId, client);

  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));

  return data;
}

function createSuggestion(guildId, input = {}, client) {
  const data = loadSuggestions(guildId, client);
  const now = new Date().toISOString();

  if (!data.enabled) return null;

  const suggestion = {
    id: data.nextId,
    status: 'pending',
    content: String(input.content || '').trim().slice(0, 1500),
    authorId: input.authorId || null,
    authorTag: input.authorTag || null,
    channelId: input.channelId || null,
    messageId: input.messageId || null,
    upvotes: [],
    downvotes: [],
    createdAt: now,
    updatedAt: now,
  };

  data.nextId += 1;
  data.suggestions.unshift(suggestion);

  saveSuggestions(guildId, data, client);
  return suggestion;
}

function getSuggestion(guildId, suggestionId, client) {
  const data = loadSuggestions(guildId, client);
  return data.suggestions.find((item) => Number(item.id) === Number(suggestionId)) || null;
}

function updateSuggestion(guildId, suggestionId, updates = {}, client) {
  const data = loadSuggestions(guildId, client);
  const index = data.suggestions.findIndex((item) => Number(item.id) === Number(suggestionId));

  if (index === -1) return null;

  data.suggestions[index] = {
    ...data.suggestions[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  saveSuggestions(guildId, data, client);
  return data.suggestions[index];
}

function listSuggestions(guildId, options = {}, client) {
  const data = loadSuggestions(guildId, client);
  const limit = Math.min(Math.max(Number(options.limit || 10), 1), 50);

  let suggestions = data.suggestions;

  if (options.status) {
    suggestions = suggestions.filter((item) => item.status === options.status);
  }

  return suggestions.slice(0, limit);
}

module.exports = {
  loadSuggestions,
  saveSuggestions,
  createSuggestion,
  getSuggestion,
  updateSuggestion,
  listSuggestions,
};
