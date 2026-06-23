// src/server/routes/tickets.js

const express = require("express");

const {
  getGuildTickets,
  getTicketById,
  createNewTicket,
  closeTicket,
  reopenTicket,
  claimTicket,
  assignTicket,
  updateTicketStatus,
  addTicketNote,
  archiveTicket,
  removeTicket,
} = require("../../modules/tickets/ticketManager");

const {
  getPanels,
  getTicketSettings,
  saveTicketSettings,
} = require("../../modules/tickets/ticketStore");

const {
  MANAGE_CHANNEL_PERMISSIONS,
  guardCategoryAccess,
  isGoliathPermissionError,
  validateRoleSelection,
} = require("../../core/security/goliathPermissionGuard");

const router = express.Router();

function countByStatus(tickets = [], status) {
  return tickets.filter((ticket) => ticket.status === status).length;
}

function isToday(dateValue) {
  if (!dateValue) return false;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return date.getUTCFullYear() === now.getUTCFullYear() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCDate() === now.getUTCDate();
}

function cleanDiscordId(value) {
  const id = String(value || "").replace(/[<@#!&>]/g, "").trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function cleanDiscordIds(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values]).map(cleanDiscordId).filter(Boolean))];
}

async function fetchGuild(req, guildId) {
  const client = req.app?.locals?.client || req.app?.locals?.discordClient || global.client || global.discordClient;
  if (!client?.guilds?.fetch) return null;
  return client.guilds.cache.get(guildId) || client.guilds.fetch(guildId).catch(() => null);
}

function getTicketRoleIds(settings = {}) {
  const permissions = settings.permissions || {};

  return cleanDiscordIds([
    ...(settings.staffRoleIds || []),
    ...(settings.managerRoleIds || []),
    ...(settings.viewerRoleIds || []),
    ...(permissions.staffRoles || []),
    ...(permissions.managerRoles || []),
    ...(permissions.viewerRoles || []),
  ]);
}

function getTicketCategoryIds(settings = {}) {
  const tickets = settings.tickets || {};

  return cleanDiscordIds([
    settings.categoryId,
    settings.outputCategoryId,
    settings.archiveCategoryId,
    tickets.categoryId,
    tickets.outputCategoryId,
    tickets.archiveCategoryId,
  ]);
}

async function guardTicketSettings(req, guildId, settings = {}) {
  const roleIds = getTicketRoleIds(settings);
  const categoryIds = getTicketCategoryIds(settings);

  if (!roleIds.length && !categoryIds.length) return null;

  const guild = await fetchGuild(req, guildId);
  if (!guild) throw new Error("Guild is unavailable.");

  if (roleIds.length) {
    const roleResult = await validateRoleSelection(guild, roleIds, {
      scope: "ticket_settings.roles",
      requireManageable: false,
    });

    if (!roleResult.ok) throw roleResult.toError();
  }

  for (const categoryId of categoryIds) {
    await guardCategoryAccess(guild, categoryId, MANAGE_CHANNEL_PERMISSIONS, {
      scope: "ticket_settings.categories",
      autoFix: true,
      throwOnFail: true,
      reason: "Goliath ticket settings permission validation",
    });
  }

  return true;
}

function failure(res, error, fallbackMessage, fallbackStatus = 500) {
  if (isGoliathPermissionError(error)) {
    const details = error.details || {};

    return res.status(403).json({
      success: false,
      code: error.code,
      error: error.message,
      message: details.message || error.message,
      scope: details.scope || null,
      guildId: details.guildId || null,
      channelId: details.channelId || null,
      channelName: details.channelName || null,
      missingPermissions: details.missingPermissions || [],
      failures: details.failures || [],
      metadata: details.metadata || {},
      autoFixAvailable: Boolean(details.autoFixAvailable),
      confirmationRequired: Boolean(details.confirmationRequired),
    });
  }

  return res.status(fallbackStatus).json({
    success: false,
    error: error.message || fallbackMessage,
  });
}

router.get("/:guildId/overview", async (req, res) => {
  try {
    const { guildId } = req.params;
    const tickets = getGuildTickets(guildId);
    const panels = getPanels(guildId).panels || [];
    const settings = getTicketSettings(guildId) || {};
    const openCount = countByStatus(tickets, "open");
    const claimedCount = countByStatus(tickets, "claimed");
    const closedCount = countByStatus(tickets, "closed");
    const archivedCount = countByStatus(tickets, "archived");

    return res.json({
      success: true,
      guildId,
      overview: {
  enabled: settings.enabled !== false,
  ticketCount: tickets.length,
  openCount,
  claimedCount,
  closedCount,
  archivedCount,
  activeCount: openCount + claimedCount,
  closedTodayCount: tickets.filter((ticket) => isToday(ticket.closedAt)).length,
  transcriptCount: tickets.filter((ticket) => ticket.transcript).length,

  panelCount: panels.length,

  deployedPanelCount: panels.filter(
    (panel) => panel.deployed || (panel.channelId && panel.messageId)
  ).length,

  panels: panels.map((panel) => ({
    id: panel.id || null,
    name: panel.name || "Unnamed Panel",
    type: panel.type || "support",

    deployed: Boolean(
      panel.deployed ||
      (panel.channelId && panel.messageId)
    ),

    channelId: panel.channelId || null,
    messageId: panel.messageId || null,

    ticketLimit: panel.ticketLimit || 0,
    cooldown: panel.cooldown || 0,

    staffRoles: Array.isArray(panel.staffRoles)
      ? panel.staffRoles
      : [],
  })),

  settings,
},
    });
  } catch (error) {
    console.error("[TicketsRoute] OVERVIEW:", error);
    return failure(res, error, "Failed to fetch ticket overview.");
  }
});

router.get("/:guildId/settings", async (req, res) => {
  try {
    const { guildId } = req.params;
    const settings = getTicketSettings(guildId) || {};
    return res.json({ success: true, guildId, settings });
  } catch (error) {
    console.error("[TicketsRoute] SETTINGS GET:", error);
    return failure(res, error, "Failed to fetch ticket settings.");
  }
});

router.patch("/:guildId/settings", async (req, res) => {
  try {
    const { guildId } = req.params;
    const settings = req.body?.settings || req.body || {};

    await guardTicketSettings(req, guildId, settings);

    const savedSettings = saveTicketSettings(guildId, settings);
    return res.json({ success: true, guildId, settings: savedSettings });
  } catch (error) {
    console.error("[TicketsRoute] SETTINGS PATCH:", error);
    return failure(res, error, "Failed to update ticket settings.", 400);
  }
});

router.get("/:guildId", async (req, res) => {
  try {
    const { guildId } = req.params;
    const tickets = getGuildTickets(guildId);
    return res.json({ success: true, count: tickets.length, tickets });
  } catch (error) {
    console.error("[TicketsRoute] GET ALL:", error);
    return failure(res, error, "Failed to fetch tickets.");
  }
});

router.get("/:guildId/:ticketId", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const ticket = getTicketById(guildId, ticketId);
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] GET ONE:", error);
    return failure(res, error, "Failed to fetch ticket.");
  }
});

router.post("/:guildId", async (req, res) => {
  try {
    const { guildId } = req.params;
    const { creatorId, type, title, description, priority, source, sourceId, tags, metadata } = req.body;
    const ticket = await createNewTicket({ guildId, creatorId, type, title, description, priority, source, sourceId, tags, metadata });
    return res.status(201).json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] CREATE:", error);
    return failure(res, error, "Failed to create ticket.");
  }
});

router.post("/:guildId/:ticketId/claim", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId } = req.body;
    const ticket = await claimTicket({ guildId, ticketId, actorId });
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] CLAIM:", error);
    return failure(res, error, "Failed to claim ticket.");
  }
});

router.post("/:guildId/:ticketId/assign", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId, assignedUserId } = req.body;
    const ticket = await assignTicket({ guildId, ticketId, actorId, assignedUserId });
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] ASSIGN:", error);
    return failure(res, error, "Failed to assign ticket.");
  }
});

router.patch("/:guildId/:ticketId/status", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId, status } = req.body;
    const ticket = await updateTicketStatus({ guildId, ticketId, actorId, status });
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] STATUS:", error);
    return failure(res, error, "Failed to update status.");
  }
});

router.post("/:guildId/:ticketId/note", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId, note } = req.body;
    const noteData = await addTicketNote({ guildId, ticketId, actorId, note });
    if (!noteData) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, note: noteData });
  } catch (error) {
    console.error("[TicketsRoute] NOTE:", error);
    return failure(res, error, "Failed to add note.");
  }
});

router.post("/:guildId/:ticketId/close", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId, reason } = req.body;
    const ticket = await closeTicket({ guildId, ticketId, actorId, reason });
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] CLOSE:", error);
    return failure(res, error, "Failed to close ticket.");
  }
});

router.post("/:guildId/:ticketId/reopen", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId } = req.body;
    const ticket = await reopenTicket({ guildId, ticketId, actorId });
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] REOPEN:", error);
    return failure(res, error, "Failed to reopen ticket.");
  }
});

router.post("/:guildId/:ticketId/archive", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const { actorId } = req.body;
    const ticket = await archiveTicket({ guildId, ticketId, actorId });
    if (!ticket) return res.status(404).json({ success: false, error: "Ticket not found." });
    return res.json({ success: true, ticket });
  } catch (error) {
    console.error("[TicketsRoute] ARCHIVE:", error);
    return failure(res, error, "Failed to archive ticket.");
  }
});

router.delete("/:guildId/:ticketId", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const success = await removeTicket({ guildId, ticketId });
    return res.json({ success });
  } catch (error) {
    console.error("[TicketsRoute] DELETE:", error);
    return failure(res, error, "Failed to delete ticket.");
  }
});

module.exports = router;
