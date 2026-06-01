// src/modules/tickets/ticketStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  saveGuildSection,
  updateGuildSection,
} = require('../../guild/guildManager');

const {
  DEFAULT_TICKET_SETTINGS,
} = require('./ticketDefaults');

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function defaultTicketSection() {
  return {
    settings: clone(DEFAULT_TICKET_SETTINGS),
    panels: [],
    tickets: [],
    analytics: {},
  };
}

function normalizeTicketSection(section = {}) {
  return {
    ...defaultTicketSection(),
    ...(section || {}),
    settings: {
      ...clone(DEFAULT_TICKET_SETTINGS),
      ...(section.settings || {}),
    },
    panels: Array.isArray(section.panels) ? section.panels : [],
    tickets: Array.isArray(section.tickets) ? section.tickets : [],
    analytics:
      section.analytics && typeof section.analytics === 'object'
        ? section.analytics
        : {},
  };
}

function normalizeTicket(ticket = {}) {
  return {
    ...ticket,

    ticketId: ticket.ticketId || ticket.id || crypto.randomUUID(),

    guildId: ticket.guildId || null,

    creatorId:
      ticket.creatorId ||
      ticket.userId ||
      ticket.createdBy ||
      null,

    discordChannelId:
      ticket.discordChannelId ||
      ticket.channelId ||
      null,

    claimedById: ticket.claimedById || null,
    claimedAt: ticket.claimedAt || null,

    reopenedById: ticket.reopenedById || null,
    reopenedAt: ticket.reopenedAt || null,

    closedById: ticket.closedById || null,
    closedAt: ticket.closedAt || null,
    closeReason: ticket.closeReason || null,

    archivedById: ticket.archivedById || null,
    archivedAt: ticket.archivedAt || null,
    archiveReason: ticket.archiveReason || null,

    deletedById: ticket.deletedById || null,
    deletedAt: ticket.deletedAt || null,

    assignedStaffIds: Array.isArray(ticket.assignedStaffIds)
      ? ticket.assignedStaffIds
      : [],

    allowedUserIds: Array.isArray(ticket.allowedUserIds)
      ? ticket.allowedUserIds
      : [],

    notes: Array.isArray(ticket.notes)
      ? ticket.notes
      : [],

    timeline: Array.isArray(ticket.timeline)
      ? ticket.timeline
      : [],

    tags: Array.isArray(ticket.tags)
      ? ticket.tags
      : [],

    metadata:
      ticket.metadata &&
      typeof ticket.metadata === 'object'
        ? ticket.metadata
        : {},

    analytics:
      ticket.analytics &&
      typeof ticket.analytics === 'object'
        ? ticket.analytics
        : {},

    transcript: ticket.transcript || null,

    statusChangedAt:
      ticket.statusChangedAt ||
      ticket.updatedAt ||
      now(),

    createdAt: ticket.createdAt || now(),
    updatedAt: ticket.updatedAt || now(),
  };
}

function normalizePanel(panel = {}) {
  const appearance =
    panel.appearance &&
    typeof panel.appearance === 'object'
      ? panel.appearance
      : {};

  return {
    ...panel,

    panelId:
      panel.panelId ||
      panel.id ||
      `panel_${crypto.randomUUID()}`,

    guildId: panel.guildId || null,

    name: panel.name || 'Support Panel',

    enabled: panel.enabled !== false,

    deployed: panel.deployed === true,

    status:
      panel.status ||
      (panel.deployed ? 'deployed' : 'draft'),

    deployChannelId:
      panel.deployChannelId ||
      panel.channelId ||
      null,

    deployMessageId:
      panel.deployMessageId ||
      panel.messageId ||
      null,

    lastDeployAt: panel.lastDeployAt || null,
    lastDeployById: panel.lastDeployById || null,

    ticketType: panel.ticketType || 'support',
    ticketPriority: panel.ticketPriority || 'normal',

    outputCategoryId:
      panel.outputCategoryId || null,

    archiveCategoryId:
      panel.archiveCategoryId || null,

    logsChannelId:
      panel.logsChannelId || null,

    transcriptsChannelId:
      panel.transcriptsChannelId || null,

    staffRoleIds: Array.isArray(panel.staffRoleIds)
      ? panel.staffRoleIds
      : [],

    managerRoleIds: Array.isArray(panel.managerRoleIds)
      ? panel.managerRoleIds
      : [],

    viewerRoleIds: Array.isArray(panel.viewerRoleIds)
      ? panel.viewerRoleIds
      : [],

    oneActivePerType:
      panel.oneActivePerType !== false,

    maxOpenTicketsPerUser:
      Number(panel.maxOpenTicketsPerUser || panel.maxActiveTicketsPerUser || 2),

    cooldownMs:
      panel.cooldownMs || 60 * 1000,

    priorityIndicators:
      panel.priorityIndicators !== false,

    sla: {
      low: Number(panel.sla?.low || 1440),
      normal: Number(panel.sla?.normal || 720),
      high: Number(panel.sla?.high || 120),
      urgent: Number(panel.sla?.urgent || 15),
    },

    reminders: {
      enabled: panel.reminders?.enabled !== false,
      repeat: panel.reminders?.repeat !== false,
      repeatMinutes: Number(panel.reminders?.repeatMinutes || 60),
      pingRoleIds: Array.isArray(panel.reminders?.pingRoleIds)
        ? panel.reminders.pingRoleIds
        : [],
    },

    appearance: {
      title:
        appearance.title ||
        panel.title ||
        'Create a Ticket',

      description:
        appearance.description ||
        panel.description ||
        'Press the button below to open a support ticket.',

      color:
        appearance.color ||
        panel.color ||
        '#5865F2',

      buttonLabel:
        appearance.buttonLabel ||
        panel.buttonLabel ||
        'Open Ticket',

      buttonEmoji:
        appearance.buttonEmoji ||
        panel.buttonEmoji ||
        panel.emoji ||
        '🎫',

      imageUrl:
        appearance.imageUrl ||
        panel.imageUrl ||
        null,

      thumbnailUrl:
        appearance.thumbnailUrl ||
        panel.thumbnailUrl ||
        null,

      footerText:
        appearance.footerText ||
        panel.footerText ||
        'Goliath • Ticket System',
    },

    metadata:
      panel.metadata &&
      typeof panel.metadata === 'object'
        ? panel.metadata
        : {},

    analytics:
      panel.analytics &&
      typeof panel.analytics === 'object'
        ? panel.analytics
        : {},

    createdAt: panel.createdAt || now(),
    updatedAt: panel.updatedAt || now(),
  };
}

function getTicketSection(guildId) {
  const section = getGuildSection(
    guildId,
    'tickets',
    defaultTicketSection()
  );

  return normalizeTicketSection(section);
}

function saveTicketSection(guildId, section) {
  return saveGuildSection(
    guildId,
    'tickets',
    normalizeTicketSection(section)
  );
}

function bootstrapGuildTickets(guildId) {
  const section = getTicketSection(guildId);

  saveTicketSection(guildId, section);

  return section;
}

function getAllTickets(guildId) {
  return getTicketSection(guildId)
    .tickets
    .map(normalizeTicket);
}

function getTicket(guildId, ticketId) {
  return (
    getAllTickets(guildId).find(
      (ticket) => ticket.ticketId === ticketId
    ) || null
  );
}

function saveTickets(guildId, data = {}) {
  return updateGuildSection(
    guildId,
    'tickets',
    (section) => ({
      ...normalizeTicketSection(section),

      tickets: Array.isArray(data.tickets)
        ? data.tickets.map(normalizeTicket)
        : [],
    }),
    defaultTicketSection()
  );
}

function createTicket(guildId, ticketData = {}) {
  const section = getTicketSection(guildId);

  const nextNumber =
    section.settings?.numbering?.nextNumber || 1;

  const ticket = normalizeTicket({
    ...ticketData,
    guildId,
    number: ticketData.number || nextNumber,
  });

  section.tickets.push(ticket);

  section.settings.numbering = {
    ...(section.settings.numbering || {}),
    nextNumber: nextNumber + 1,
  };

  saveTicketSection(guildId, section);

  return ticket;
}

function updateTicket(guildId, ticketId, updates = {}) {
  const section = getTicketSection(guildId);

  const index = section.tickets.findIndex(
    (ticket) => ticket.ticketId === ticketId
  );

  if (index === -1) return null;

  const existing = normalizeTicket(
    section.tickets[index]
  );

  const updated = normalizeTicket({
    ...existing,
    ...updates,

    metadata: {
      ...(existing.metadata || {}),
      ...(updates.metadata || {}),
    },

    analytics: {
      ...(existing.analytics || {}),
      ...(updates.analytics || {}),
    },

    updatedAt: now(),
  });

  section.tickets[index] = updated;

  saveTicketSection(guildId, section);

  return updated;
}

function deleteTicket(guildId, ticketId) {
  const section = getTicketSection(guildId);

  const before = section.tickets.length;

  section.tickets = section.tickets.filter(
    (ticket) => ticket.ticketId !== ticketId
  );

  const changed =
    before !== section.tickets.length;

  if (changed) {
    saveTicketSection(guildId, section);
  }

  return changed;
}

function getTicketSettings(guildId) {
  return getTicketSection(guildId).settings;
}

function saveTicketSettings(guildId, settings = {}) {
  const section = getTicketSection(guildId);

  section.settings = {
    ...section.settings,
    ...settings,
    updatedAt: now(),
  };

  saveTicketSection(guildId, section);

  return section.settings;
}

function incrementTicketNumber(guildId) {
  const section = getTicketSection(guildId);

  if (!section.settings.numbering) {
    section.settings.numbering = {
      nextNumber: 1,
      prefix: 'ticket',
      padding: 4,
    };
  }

  section.settings.numbering.nextNumber += 1;

  saveTicketSection(guildId, section);

  return section.settings.numbering.nextNumber;
}

function getPanels(guildId) {
  const section = getTicketSection(guildId);

  return {
    panels: section.panels.map(normalizePanel),
  };
}

function savePanels(guildId, data = {}) {
  const section = getTicketSection(guildId);

  section.panels = Array.isArray(data.panels)
    ? data.panels.map(normalizePanel)
    : [];

  saveTicketSection(guildId, section);

  return true;
}

function getPanel(guildId, panelId) {
  return (
    getPanels(guildId).panels.find(
      (panel) => panel.panelId === panelId
    ) || null
  );
}

function createPanel(guildId, panelData = {}) {
  const section = getTicketSection(guildId);

  const panel = normalizePanel({
    guildId,
    ...panelData,
  });

  const existingIndex = section.panels.findIndex(
    (existing) =>
      existing.panelId === panel.panelId ||
      (
        existing.ticketType === panel.ticketType &&
        String(existing.name || '').toLowerCase() ===
        String(panel.name || '').toLowerCase()
      )
  );

  if (existingIndex !== -1) {
    section.panels[existingIndex] = normalizePanel({
      ...section.panels[existingIndex],
      ...panel,
      updatedAt: now(),
    });

    saveTicketSection(guildId, section);

    return section.panels[existingIndex];
  }

  section.panels.push(panel);

  saveTicketSection(guildId, section);

  return panel;
}

function updatePanel(guildId, panelId, updates = {}) {
  const section = getTicketSection(guildId);

  const index = section.panels.findIndex(
    (panel) => panel.panelId === panelId
  );

  if (index === -1) return null;

  const existing = normalizePanel(
    section.panels[index]
  );

  const updated = normalizePanel({
    ...existing,
    ...updates,

    appearance: {
      ...(existing.appearance || {}),
      ...(updates.appearance || {}),
    },

    metadata: {
      ...(existing.metadata || {}),
      ...(updates.metadata || {}),
    },

    analytics: {
      ...(existing.analytics || {}),
      ...(updates.analytics || {}),
    },

    updatedAt: now(),
  });

  section.panels[index] = updated;

  saveTicketSection(guildId, section);

  return updated;
}

function deletePanel(guildId, panelId) {
  const section = getTicketSection(guildId);

  const before = section.panels.length;

  section.panels = section.panels.filter(
    (panel) => panel.panelId !== panelId
  );

  const changed =
    before !== section.panels.length;

  if (changed) {
    saveTicketSection(guildId, section);
  }

  return changed;
}

function markPanelDeployed(
  guildId,
  panelId,
  deployData = {}
) {
  return updatePanel(guildId, panelId, {
    deployed: true,
    status: 'deployed',

    deployChannelId:
      deployData.deployChannelId ||
      deployData.channelId ||
      null,

    deployMessageId:
      deployData.deployMessageId ||
      deployData.messageId ||
      null,

    lastDeployAt: now(),
    lastDeployById: deployData.actorId || null,
  });
}

function markPanelUndeployed(guildId, panelId) {
  return updatePanel(guildId, panelId, {
    deployed: false,
    status: 'draft',
    deployChannelId: null,
    deployMessageId: null,
  });
}

function clearTicketCache() {
  return true;
}

function reloadGuildTickets(guildId) {
  return {
    tickets: getAllTickets(guildId),
    settings: getTicketSettings(guildId),
    panels: getPanels(guildId).panels,
  };
}

module.exports = {
  bootstrapGuildTickets,

  getAllTickets,
  getTicket,

  createTicket,
  updateTicket,
  deleteTicket,
  saveTickets,

  getTicketSettings,
  saveTicketSettings,
  incrementTicketNumber,

  getPanels,
  savePanels,
  getPanel,
  createPanel,
  updatePanel,
  deletePanel,

  markPanelDeployed,
  markPanelUndeployed,

  clearTicketCache,
  reloadGuildTickets,

  normalizeTicket,
  normalizePanel,
};
