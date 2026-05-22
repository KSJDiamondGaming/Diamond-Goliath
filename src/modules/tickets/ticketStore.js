// src/modules/tickets/ticketStore.js

const fs = require('fs');
const path = require('path');

const runtimeConfig = require('../../config/runtimePaths');

const {
  createDefaultTicket,
  DEFAULT_TICKET_SETTINGS,
} = require('./ticketDefaults');

const CACHE = {
  tickets: new Map(),
  settings: new Map(),
  panels: new Map(),
};

function now() {
  return new Date().toISOString();
}

function getRuntimeGuildsPath() {
  if (runtimeConfig?.runtimePaths?.guilds) {
    return runtimeConfig.runtimePaths.guilds;
  }

  if (runtimeConfig?.guilds) {
    return runtimeConfig.guilds;
  }

  if (typeof runtimeConfig?.getRuntimePaths === 'function') {
    const paths = runtimeConfig.getRuntimePaths();

    if (paths?.guilds) {
      return paths.guilds;
    }
  }

  return path.join(
    process.cwd(),
    'src',
    'runtime',
    String(process.env.BOT_MODE || 'dev').toLowerCase(),
    'guilds'
  );
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, {
      recursive: true,
    });
  }
}

function ensureFile(filePath, defaultData = {}) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify(defaultData, null, 2)
    );
  }
}

function safeReadJson(filePath, fallback = {}) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    return JSON.parse(
      fs.readFileSync(filePath, 'utf8')
    );
  } catch (error) {
    console.error(
      '[TicketStore] Failed to read JSON:',
      filePath,
      error
    );

    return fallback;
  }
}

function safeWriteJson(filePath, data) {
  try {
    fs.writeFileSync(
      filePath,
      JSON.stringify(data, null, 2)
    );

    return true;
  } catch (error) {
    console.error(
      '[TicketStore] Failed to write JSON:',
      filePath,
      error
    );

    return false;
  }
}

function getGuildTicketsPath(guildId) {
  return path.join(
    getRuntimeGuildsPath(),
    String(guildId),
    'tickets'
  );
}

function getTranscriptsPath(guildId) {
  return path.join(
    getGuildTicketsPath(guildId),
    'transcripts'
  );
}

function getTicketsFile(guildId) {
  return path.join(
    getGuildTicketsPath(guildId),
    'tickets.json'
  );
}

function getTicketSettingsFile(guildId) {
  return path.join(
    getGuildTicketsPath(guildId),
    'settings.json'
  );
}

function getTicketPanelsFile(guildId) {
  return path.join(
    getGuildTicketsPath(guildId),
    'panels.json'
  );
}

function bootstrapGuildTickets(guildId) {
  const ticketsPath = getGuildTicketsPath(guildId);

  ensureDir(ticketsPath);
  ensureDir(getTranscriptsPath(guildId));

  ensureFile(getTicketsFile(guildId), {
    tickets: [],
  });

  ensureFile(
    getTicketSettingsFile(guildId),
    DEFAULT_TICKET_SETTINGS
  );

  ensureFile(getTicketPanelsFile(guildId), {
    panels: [],
  });
}

function normalizeTicket(ticket = {}) {
  return {
    ...ticket,

    ticketId:
      ticket.ticketId ||
      ticket.id ||
      null,

    guildId:
      ticket.guildId || null,

    creatorId:
      ticket.creatorId ||
      ticket.userId ||
      ticket.createdBy ||
      null,

    discordChannelId:
      ticket.discordChannelId ||
      ticket.channelId ||
      null,

    claimedById:
      ticket.claimedById || null,

    assignedStaffIds: Array.isArray(ticket.assignedStaffIds)
      ? ticket.assignedStaffIds
      : [],

    allowedUserIds: Array.isArray(ticket.allowedUserIds)
      ? ticket.allowedUserIds
      : [],

    tags: Array.isArray(ticket.tags)
      ? ticket.tags
      : [],

    notes: Array.isArray(ticket.notes)
      ? ticket.notes
      : [],

    timeline: Array.isArray(ticket.timeline)
      ? ticket.timeline
      : [],

    metadata:
      typeof ticket.metadata === 'object' &&
      ticket.metadata !== null
        ? ticket.metadata
        : {},

    createdAt:
      ticket.createdAt || now(),

    updatedAt:
      ticket.updatedAt || now(),
  };
}

function loadTickets(guildId) {
  bootstrapGuildTickets(guildId);

  const cacheKey = String(guildId);

  if (CACHE.tickets.has(cacheKey)) {
    return CACHE.tickets.get(cacheKey);
  }

  const raw = safeReadJson(
    getTicketsFile(guildId),
    {
      tickets: [],
    }
  );

  const normalized = {
    tickets: Array.isArray(raw.tickets)
      ? raw.tickets.map(normalizeTicket)
      : [],
  };

  CACHE.tickets.set(cacheKey, normalized);

  return normalized;
}

function saveTickets(guildId, data) {
  const cacheKey = String(guildId);

  const normalized = {
    tickets: Array.isArray(data?.tickets)
      ? data.tickets.map(normalizeTicket)
      : [],
  };

  CACHE.tickets.set(cacheKey, normalized);

  return safeWriteJson(
    getTicketsFile(guildId),
    normalized
  );
}

function getAllTickets(guildId) {
  const data = loadTickets(guildId);

  return Array.isArray(data.tickets)
    ? data.tickets
    : [];
}

function getTicket(guildId, ticketId) {
  const tickets = getAllTickets(guildId);

  return (
    tickets.find(
      (ticket) => ticket.ticketId === ticketId
    ) || null
  );
}

function createTicket(guildId, ticketData = {}) {
  const data = loadTickets(guildId);

  const nextNumber =
    getTicketSettings(guildId)?.numbering?.nextNumber || 1;

  const ticket = normalizeTicket(
    createDefaultTicket({
      guildId,
      number: nextNumber,
      ...ticketData,
    })
  );

  data.tickets.push(ticket);

  saveTickets(guildId, data);

  incrementTicketNumber(guildId);

  return ticket;
}

function updateTicket(guildId, ticketId, updates = {}) {
  const data = loadTickets(guildId);

  const index = data.tickets.findIndex(
    (ticket) => ticket.ticketId === ticketId
  );

  if (index === -1) {
    return null;
  }

  const existingTicket = data.tickets[index];

  const updatedTicket = normalizeTicket({
    ...existingTicket,
    ...updates,
    updatedAt: now(),
  });

  data.tickets[index] = updatedTicket;

  saveTickets(guildId, data);

  return updatedTicket;
}

function deleteTicket(guildId, ticketId) {
  const data = loadTickets(guildId);

  const before = data.tickets.length;

  data.tickets = data.tickets.filter(
    (ticket) => ticket.ticketId !== ticketId
  );

  const changed = before !== data.tickets.length;

  if (changed) {
    saveTickets(guildId, data);
  }

  return changed;
}

function getTicketSettings(guildId) {
  bootstrapGuildTickets(guildId);

  const cacheKey = String(guildId);

  if (CACHE.settings.has(cacheKey)) {
    return CACHE.settings.get(cacheKey);
  }

  const settings = safeReadJson(
    getTicketSettingsFile(guildId),
    DEFAULT_TICKET_SETTINGS
  );

  CACHE.settings.set(cacheKey, settings);

  return settings;
}

function saveTicketSettings(guildId, settings) {
  bootstrapGuildTickets(guildId);

  const cacheKey = String(guildId);

  CACHE.settings.set(cacheKey, settings);

  return safeWriteJson(
    getTicketSettingsFile(guildId),
    settings
  );
}

function incrementTicketNumber(guildId) {
  const settings = getTicketSettings(guildId);

  if (!settings.numbering) {
    settings.numbering = {
      nextNumber: 1,
    };
  }

  settings.numbering.nextNumber += 1;

  saveTicketSettings(
    guildId,
    settings
  );

  return settings.numbering.nextNumber;
}

function getPanels(guildId) {
  bootstrapGuildTickets(guildId);

  const cacheKey = String(guildId);

  if (CACHE.panels.has(cacheKey)) {
    return CACHE.panels.get(cacheKey);
  }

  const panels = safeReadJson(
    getTicketPanelsFile(guildId),
    {
      panels: [],
    }
  );

  if (!Array.isArray(panels.panels)) {
    panels.panels = [];
  }

  CACHE.panels.set(cacheKey, panels);

  return panels;
}

function savePanels(guildId, data) {
  bootstrapGuildTickets(guildId);

  const cacheKey = String(guildId);

  const normalized = {
    panels: Array.isArray(data?.panels)
      ? data.panels
      : [],
  };

  CACHE.panels.set(cacheKey, normalized);

  return safeWriteJson(
    getTicketPanelsFile(guildId),
    normalized
  );
}

function clearTicketCache(guildId = null) {
  if (!guildId) {
    CACHE.tickets.clear();
    CACHE.settings.clear();
    CACHE.panels.clear();
    return;
  }

  const key = String(guildId);

  CACHE.tickets.delete(key);
  CACHE.settings.delete(key);
  CACHE.panels.delete(key);
}

function reloadGuildTickets(guildId) {
  clearTicketCache(guildId);

  return {
    tickets: loadTickets(guildId),
    settings: getTicketSettings(guildId),
    panels: getPanels(guildId),
  };
}

module.exports = {
  bootstrapGuildTickets,

  getGuildTicketsPath,
  getTranscriptsPath,

  getAllTickets,
  getTicket,

  createTicket,
  updateTicket,
  deleteTicket,

  getTicketSettings,
  saveTicketSettings,

  getPanels,
  savePanels,

  clearTicketCache,
  reloadGuildTickets,

  normalizeTicket,
};