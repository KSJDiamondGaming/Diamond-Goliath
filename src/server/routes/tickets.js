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
} = require("../../modules/tickets/ticketStore");

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
        deployedPanelCount: panels.filter((panel) => panel.deployed || (panel.channelId && panel.messageId)).length,
        settings,
      },
    });
  } catch (error) {
    console.error("[TicketsRoute] OVERVIEW:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch ticket overview." });
  }
});

router.get("/:guildId", async (req, res) => {
  try {
    const { guildId } = req.params;
    const tickets = getGuildTickets(guildId);
    return res.json({ success: true, count: tickets.length, tickets });
  } catch (error) {
    console.error("[TicketsRoute] GET ALL:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch tickets." });
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
    return res.status(500).json({ success: false, error: "Failed to fetch ticket." });
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
    return res.status(500).json({ success: false, error: "Failed to create ticket." });
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
    return res.status(500).json({ success: false, error: "Failed to claim ticket." });
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
    return res.status(500).json({ success: false, error: "Failed to assign ticket." });
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
    return res.status(500).json({ success: false, error: "Failed to update status." });
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
    return res.status(500).json({ success: false, error: "Failed to add note." });
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
    return res.status(500).json({ success: false, error: "Failed to close ticket." });
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
    return res.status(500).json({ success: false, error: "Failed to reopen ticket." });
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
    return res.status(500).json({ success: false, error: "Failed to archive ticket." });
  }
});

router.delete("/:guildId/:ticketId", async (req, res) => {
  try {
    const { guildId, ticketId } = req.params;
    const success = await removeTicket({ guildId, ticketId });
    return res.json({ success });
  } catch (error) {
    console.error("[TicketsRoute] DELETE:", error);
    return res.status(500).json({ success: false, error: "Failed to delete ticket." });
  }
});

module.exports = router;
