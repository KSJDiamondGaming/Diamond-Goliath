// src/modules/tickets/ticketStore.js

const crypto = require('crypto');

const {
  getGuildSection,
  saveGuildSection,
  updateGuildSection,
} = require('../../core/guild/guildManager');
const planLimitManager = require('../../server/billing/planLimitManager');

const {
  DEFAULT_TICKET_SETTINGS,
} = require('./ticketDefaults');

function now() {
  return new Date().toISOString();
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function asArray(value) {
  return Array.isArray(value) ? [...new Set(value.filter(Boolean))] : [];
}

function asObject(value, fallback = {}) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : fallback;
}

function asNumber(value, fallback = 0) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return fallback;
  }

  return number;
}

function asNonNegativeInt(value, fallback = 0) {
  const number = asNumber(value, fallback);

  if (number < 0) {
    return fallback;
  }

  return Math.floor(number);
}

function normaliseStatus(status = 'open') {
  return String(status || 'open').toLowerCase();
}

function normalisePriority(priority = 'low') {
  const value = String(priority || 'low').toLowerCase();

  if (['low', 'normal', 'high', 'urgent'].includes(value)) {
    return value;
  }

  return 'low';
}

function normaliseTicketType(type = 'support') {
  return (
    String(type || 'support')
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'support'
  );
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
  const base = defaultTicketSection();

  return {
    ...base,
    ...(section || {}),

    settings: {
      ...base.settings,
      ...(section.settings || {}),
      numbering: {
        ...(base.settings?.numbering || {}),
        ...(section.settings?.numbering || {}),
      },
      tickets: {
        ...(base.settings?.tickets || {}),
        ...(section.settings?.tickets || {}),
      },
      permissions: {
        ...(base.settings?.permissions || {}),
        ...(section.settings?.permissions || {}),
      },
      transcripts: {
        ...(base.settings?.transcripts || {}),
        ...(section.settings?.transcripts || {}),
      },
      analytics: {
        ...(base.settings?.analytics || {}),
        ...(section.settings?.analytics || {}),
      },
    },

    panels: Array.isArray(section.panels)
      ? section.panels.map(normalizePanel)
      : [],

    tickets: Array.isArray(section.tickets)
      ? section.tickets.map(normalizeTicket)
      : [],

    analytics: asObject(section.analytics, {}),
  };
}

function normalizeTicket(ticket = {}) {
  const createdAt = ticket.createdAt || now();

  return {
    ...ticket,
    ticketId: ticket.ticketId || ticket.id || crypto.randomUUID(),
    guildId: ticket.guildId || null,
    number: asNonNegativeInt(ticket.number ?? ticket.ticketNumber ?? 0, 0),
    ticketNumber: asNonNegativeInt(ticket.ticketNumber ?? ticket.number ?? 0, 0),
    displayId: ticket.displayId || ticket.metadata?.displayId || null,
    creatorId: ticket.creatorId || ticket.userId || ticket.createdBy || null,
    userId: ticket.userId || ticket.creatorId || ticket.createdBy || null,
    createdBy: ticket.createdBy || ticket.creatorId || ticket.userId || null,
    type: normaliseTicketType(ticket.type || 'support'),
    title: ticket.title || 'Untitled Ticket',
    description: ticket.description || '',
    status: normaliseStatus(ticket.status || 'open'),
    priority: normalisePriority(ticket.priority || 'low'),
    source: ticket.source || null,
    sourceId: ticket.sourceId || null,
    formSubmissionId: ticket.formSubmissionId || null,
    moderationCaseId: ticket.moderationCaseId || null,
    securityIncidentId: ticket.securityIncidentId || null,
    discordChannelId: ticket.discordChannelId || ticket.channelId || null,
    channelId: ticket.channelId || ticket.discordChannelId || null,
    discordMessageId: ticket.discordMessageId || ticket.messageId || null,
    messageId: ticket.messageId || ticket.discordMessageId || null,
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
    assignedStaffIds: asArray(ticket.assignedStaffIds),
    allowedUserIds: asArray(ticket.allowedUserIds),
    notes: Array.isArray(ticket.notes) ? ticket.notes : [],
    timeline: Array.isArray(ticket.timeline) ? ticket.timeline : [],
    tags: asArray(ticket.tags),
    metadata: asObject(ticket.metadata, {}),
    analytics: asObject(ticket.analytics, {}),
    transcript: ticket.transcript || null,
    statusChangedAt: ticket.statusChangedAt || ticket.updatedAt || createdAt,
    createdAt,
    updatedAt: ticket.updatedAt || createdAt,
  };
}

function defaultPanelAppearance(panel = {}) {
  const type = normaliseTicketType(panel.ticketType || panel.type || 'support');

  let title = 'Open a Ticket';
  let description = 'Need help? Open a ticket and our staff team will assist you.';
  let buttonLabel = 'Open Ticket';
  let buttonEmoji = '🎫';

  if (type === 'support') {
    title = 'Need Support?';
    description = 'Press the button below to open a private support ticket.';
    buttonLabel = 'Open Support Ticket';
    buttonEmoji = '🎫';
  }

  if (type === 'appeal') {
    title = 'Submit an Appeal';
    description = 'Press the button below to open a private appeal ticket.';
    buttonLabel = 'Open Appeal Ticket';
    buttonEmoji = '⚖️';
  }

  if (type === 'report') {
    title = 'Submit a Report';
    description = 'Press the button below to report an issue privately.';
    buttonLabel = 'Open Report Ticket';
    buttonEmoji = '🚨';
  }

  if (type === 'application') {
    title = 'Submit an Application';
    description = 'Press the button below to open a private application ticket.';
    buttonLabel = 'Open Application Ticket';
    buttonEmoji = '📝';
  }

  return {
    title,
    description,
    color: '#5865F2',
    buttonLabel,
    buttonEmoji,
    imageUrl: null,
    thumbnailUrl: null,
    footerText: 'Goliath • Ticket System',
  };
}

function defaultPanelLimit(type) {
  const cleanType = normaliseTicketType(type);

  if (cleanType === 'appeal') return 1;
  if (cleanType === 'application') return 1;
  if (cleanType === 'report') return 3;

  return 2;
}

function normalizePanel(panel = {}) {
  const ticketType = normaliseTicketType(panel.ticketType || panel.type || 'support');
  const createdAt = panel.createdAt || now();
  const appearance = {
    ...defaultPanelAppearance({ ticketType }),
    ...asObject(panel.appearance, {}),
  };
  const maxOpenTicketsPerUser = asNonNegativeInt(
    panel.maxOpenTicketsPerUser ?? panel.maxActiveTicketsPerUser ?? defaultPanelLimit(ticketType),
    defaultPanelLimit(ticketType)
  );
  const cooldownMs = asNonNegativeInt(panel.cooldownMs ?? 60 * 1000, 60 * 1000);

  return {
    ...panel,
    panelId: panel.panelId || panel.id || `panel_${crypto.randomUUID()}`,
    id: panel.id || panel.panelId || null,
    guildId: panel.guildId || null,
    name: panel.name || `${ticketType.charAt(0).toUpperCase()}${ticketType.slice(1)} Panel`,
    enabled: panel.enabled !== false,
    deployed: panel.deployed === true,
    status: panel.status || (panel.deployed ? 'deployed' : 'draft'),
    deployChannelId: panel.deployChannelId || panel.channelId || null,
    channelId: panel.channelId || panel.deployChannelId || null,
    deployMessageId: panel.deployMessageId || panel.messageId || null,
    messageId: panel.messageId || panel.deployMessageId || null,
    lastDeployAt: panel.lastDeployAt || null,
    lastDeployById: panel.lastDeployById || null,
    ticketType,
    ticketPriority: normalisePriority(panel.ticketPriority || panel.priority || 'low'),
    outputCategoryId: panel.outputCategoryId || null,
    archiveCategoryId: panel.archiveCategoryId || null,
    logsChannelId: panel.logsChannelId || null,
    transcriptsChannelId: panel.transcriptsChannelId || null,
    staffRoleIds: asArray(panel.staffRoleIds),
    managerRoleIds: asArray(panel.managerRoleIds),
    viewerRoleIds: asArray(panel.viewerRoleIds),
    allowedRoleIds: asArray(panel.allowedRoleIds),
    blockedRoleIds: asArray(panel.blockedRoleIds),
    allowUserClose: panel.allowUserClose === true,
    allowUserAddMembers: panel.allowUserAddMembers === true,
    autoAssignStaff: panel.autoAssignStaff === true,
    autoCloseEnabled: panel.autoCloseEnabled === true,
    autoCloseHours: asNonNegativeInt(panel.autoCloseHours ?? 72, 72),
    autoArchiveEnabled: panel.autoArchiveEnabled === true,
    autoArchiveHours: asNonNegativeInt(panel.autoArchiveHours ?? 72, 72),
    createPrivateChannel: panel.createPrivateChannel !== false,
    useThreads: panel.useThreads === true,
    oneActivePerType: panel.oneActivePerType !== false,
    maxOpenTicketsPerUser,
    maxActiveTicketsPerUser: asNonNegativeInt(panel.maxActiveTicketsPerUser ?? maxOpenTicketsPerUser, maxOpenTicketsPerUser),
    cooldownMs,
    priorityIndicators: panel.priorityIndicators !== false,
    sla: {
      low: asNonNegativeInt(panel.sla?.low ?? 1440, 1440),
      normal: asNonNegativeInt(panel.sla?.normal ?? 720, 720),
      high: asNonNegativeInt(panel.sla?.high ?? 120, 120),
      urgent: asNonNegativeInt(panel.sla?.urgent ?? 15, 15),
    },
    reminders: {
      enabled: panel.reminders?.enabled !== false,
      repeat: panel.reminders?.repeat !== false,
      repeatMinutes: asNonNegativeInt(panel.reminders?.repeatMinutes ?? 60, 60),
      pingRoleIds: asArray(panel.reminders?.pingRoleIds),
      escalationRoleIds: asArray(panel.reminders?.escalationRoleIds),
      escalationMinutes: asNonNegativeInt(panel.reminders?.escalationMinutes ?? 60, 60),
    },
    dmCreatorOnOpen: panel.dmCreatorOnOpen !== false,
    dmCreatorOnClose: panel.dmCreatorOnClose !== false,
    notifyStaffOnOpen: panel.notifyStaffOnOpen !== false,
    linkedFormId: panel.linkedFormId || null,
    appearance,
    buttonStyle: panel.buttonStyle || 'Primary',
    analytics: {
      opens: 0,
      closes: 0,
      claims: 0,
      archives: 0,
      averageCloseTimeMs: 0,
      ...asObject(panel.analytics, {}),
    },
    tags: asArray(panel.tags),
    metadata: asObject(panel.metadata, {}),
    createdAt,
    updatedAt: panel.updatedAt || createdAt,
  };
}

function getTicketSection(guildId) {
  const section = getGuildSection(guildId, 'tickets', defaultTicketSection());
  return normalizeTicketSection(section);
}

function saveTicketSection(guildId, section = {}) {
  const normalized = normalizeTicketSection(section);
  saveGuildSection(guildId, 'tickets', normalized);
  return normalized;
}

function assertTicketPanelLimitForNewPanel(guildId, currentCount) {
  return planLimitManager.assertCanCreateResource(guildId, 'ticketPanels', currentCount, {
    upgradeHint: 'Upgrade to Plus for 15 ticket panels or Pro for unlimited ticket panels.',
  });
}

function assertTicketPanelLimitForTotal(guildId, nextTotal) {
  const check = planLimitManager.canCreateResource(guildId, 'ticketPanels', Math.max(Number(nextTotal || 0) - 1, 0));
  if (!check.allowed) {
    throw planLimitManager.createLimitError(check, {
      upgradeHint: 'Upgrade to Plus for 15 ticket panels or Pro for unlimited ticket panels.',
    });
  }
  return check;
}

function bootstrapGuildTickets(guildId) {
  const section = getTicketSection(guildId);
  saveTicketSection(guildId, section);
  return section;
}

function getAllTickets(guildId) {
  return getTicketSection(guildId).tickets;
}

function getTicket(guildId, ticketId) {
  return (
    getAllTickets(guildId).find(
      (ticket) =>
        ticket.ticketId === ticketId ||
        ticket.id === ticketId ||
        ticket.displayId === ticketId
    ) || null
  );
}

function saveTickets(guildId, data = {}) {
  return updateGuildSection(
    guildId,
    'tickets',
    (section) => ({
      ...normalizeTicketSection(section),
      tickets: Array.isArray(data.tickets) ? data.tickets.map(normalizeTicket) : [],
    }),
    defaultTicketSection()
  );
}

function createTicket(guildId, ticketData = {}) {
  const section = getTicketSection(guildId);
  const nextNumber = asNonNegativeInt(section.settings?.numbering?.nextNumber || 1, 1);
  const ticket = normalizeTicket({
    ...ticketData,
    guildId,
    number: ticketData.number || nextNumber,
    ticketNumber: ticketData.ticketNumber || ticketData.number || nextNumber,
  });

  if (!ticket.displayId) {
    const padding = asNonNegativeInt(section.settings?.numbering?.padding || 4, 4);
    ticket.displayId = `${ticket.type}-${String(ticket.number).padStart(padding, '0')}`;
    ticket.metadata = {
      ...(ticket.metadata || {}),
      displayId: ticket.displayId,
    };
  }

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
    (ticket) => ticket.ticketId === ticketId || ticket.id === ticketId || ticket.displayId === ticketId
  );

  if (index === -1) return null;

  const existing = normalizeTicket(section.tickets[index]);
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
    (ticket) => ticket.ticketId !== ticketId && ticket.id !== ticketId && ticket.displayId !== ticketId
  );

  const changed = before !== section.tickets.length;
  if (changed) saveTicketSection(guildId, section);
  return changed;
}

function getTicketSettings(guildId) {
  return getTicketSection(guildId).settings;
}

function saveTicketSettings(guildId, settings = {}) {
  const section = getTicketSection(guildId);
  section.settings = {
    ...(section.settings || {}),
    ...(settings || {}),
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

  section.settings.numbering.nextNumber = asNonNegativeInt(section.settings.numbering.nextNumber || 1, 1) + 1;
  saveTicketSection(guildId, section);
  return section.settings.numbering.nextNumber;
}

function getPanels(guildId) {
  const section = getTicketSection(guildId);
  return { panels: section.panels.map(normalizePanel) };
}

function savePanels(guildId, data = {}) {
  const section = getTicketSection(guildId);
  const nextPanels = Array.isArray(data.panels)
    ? data.panels.map((panel) => normalizePanel({ ...panel, guildId }))
    : [];

  if (nextPanels.length > section.panels.length) {
    assertTicketPanelLimitForTotal(guildId, nextPanels.length);
  }

  section.panels = nextPanels;
  saveTicketSection(guildId, section);
  return true;
}

function getPanel(guildId, panelId) {
  return (
    getPanels(guildId).panels.find(
      (panel) => panel.panelId === panelId || panel.id === panelId
    ) || null
  );
}

function createPanel(guildId, panelData = {}) {
  const section = getTicketSection(guildId);
  const panel = normalizePanel({
    ...panelData,
    guildId,
    createdAt: panelData.createdAt || now(),
    updatedAt: now(),
  });
  const existingIndex = section.panels.findIndex(
    (existingPanel) => existingPanel.panelId === panel.panelId || existingPanel.id === panel.panelId
  );

  if (existingIndex !== -1) {
    section.panels[existingIndex] = normalizePanel({
      ...section.panels[existingIndex],
      ...panel,
      guildId,
      updatedAt: now(),
    });
    saveTicketSection(guildId, section);
    return section.panels[existingIndex];
  }

  assertTicketPanelLimitForNewPanel(guildId, section.panels.length);
  section.panels.push(panel);
  saveTicketSection(guildId, section);
  return panel;
}

function updatePanel(guildId, panelId, updates = {}) {
  const section = getTicketSection(guildId);
  const index = section.panels.findIndex((panel) => panel.panelId === panelId || panel.id === panelId);
  if (index === -1) return null;

  const existing = normalizePanel(section.panels[index]);
  const updated = normalizePanel({
    ...existing,
    ...updates,
    guildId,
    appearance: {
      ...(existing.appearance || {}),
      ...(updates.appearance || {}),
    },
    sla: {
      ...(existing.sla || {}),
      ...(updates.sla || {}),
    },
    reminders: {
      ...(existing.reminders || {}),
      ...(updates.reminders || {}),
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
  section.panels = section.panels.filter((panel) => panel.panelId !== panelId && panel.id !== panelId);
  const changed = before !== section.panels.length;
  if (changed) saveTicketSection(guildId, section);
  return changed;
}

function markPanelDeployed(guildId, panelId, deployData = {}) {
  return updatePanel(guildId, panelId, {
    deployed: true,
    status: 'deployed',
    deployChannelId: deployData.deployChannelId || deployData.channelId || null,
    channelId: deployData.channelId || deployData.deployChannelId || null,
    deployMessageId: deployData.deployMessageId || deployData.messageId || null,
    messageId: deployData.messageId || deployData.deployMessageId || null,
    lastDeployAt: now(),
    lastDeployById: deployData.actorId || null,
  });
}

function markPanelUndeployed(guildId, panelId) {
  return updatePanel(guildId, panelId, {
    deployed: false,
    status: 'draft',
    deployChannelId: null,
    channelId: null,
    deployMessageId: null,
    messageId: null,
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
  normalizeTicketSection,
};
