'use strict';

/**
 * GOLIATH TICKET CHANNEL BUTTONS
 *
 * Reusable button/action-row system for ticket channels.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');

const CUSTOM_IDS = {
  CLAIM: 'goliath_ticket_claim',
  CLOSE: 'goliath_ticket_close',
  ARCHIVE: 'goliath_ticket_archive',
  TRANSCRIPT: 'goliath_ticket_transcript',
  ADD_USER: 'goliath_ticket_add_user',
  PRIORITY: 'goliath_ticket_priority',
  REOPEN: 'goliath_ticket_reopen',
  DELETE: 'goliath_ticket_delete',
  DELETE_CONFIRM: 'goliath_ticket_delete_confirm',
};

const OPEN_STATUSES = [
  'open',
  'claimed',
  'waiting_user',
  'in_review',
  'approved',
  'denied',
];

const CLOSED_STATUSES = [
  'closed',
];

const ARCHIVED_STATUSES = [
  'archived',
];

const DELETED_STATUSES = [
  'deleted',
];

function normaliseStatus(status) {
  return String(status || 'open').toLowerCase();
}

function isOpenStatus(status) {
  return OPEN_STATUSES.includes(
    normaliseStatus(status)
  );
}

function isClosedStatus(status) {
  return CLOSED_STATUSES.includes(
    normaliseStatus(status)
  );
}

function isArchivedStatus(status) {
  return ARCHIVED_STATUSES.includes(
    normaliseStatus(status)
  );
}

function isDeletedStatus(status) {
  return DELETED_STATUSES.includes(
    normaliseStatus(status)
  );
}

function isDeletedTicket(ticket = {}) {
  return (
    isDeletedStatus(ticket.status) ||
    Boolean(ticket.deletedAt)
  );
}

function isLockedStatus(status) {
  return (
    isClosedStatus(status) ||
    isArchivedStatus(status) ||
    isDeletedStatus(status)
  );
}

function button(
  id,
  label,
  emoji,
  style = ButtonStyle.Secondary,
  disabled = false
) {
  const builder = new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setDisabled(Boolean(disabled));

  if (emoji) {
    builder.setEmoji(emoji);
  }

  return builder;
}

function chunkButtons(buttons = [], max = 5) {
  const rows = [];

  for (let i = 0; i < buttons.length; i += max) {
    rows.push(
      new ActionRowBuilder().addComponents(
        buttons.slice(i, i + max)
      )
    );
  }

  return rows;
}

function buildClaimButton(ticket, isLocked = false) {
  const claimedById =
    ticket?.claimedById ||
    null;

  if (claimedById) {
    return button(
      CUSTOM_IDS.CLAIM,
      'Claimed',
      '✅',
      ButtonStyle.Success,
      true
    );
  }

  return button(
    CUSTOM_IDS.CLAIM,
    'Claim',
    '🎫',
    ButtonStyle.Primary,
    isLocked
  );
}

function buildCloseButton(isLocked = false) {
  return button(
    CUSTOM_IDS.CLOSE,
    'Close',
    '🔒',
    ButtonStyle.Danger,
    isLocked
  );
}

function buildArchiveButton(isArchived = false) {
  return button(
    CUSTOM_IDS.ARCHIVE,
    'Archive',
    '📁',
    ButtonStyle.Secondary,
    isArchived
  );
}

function buildTranscriptButton(disabled = false) {
  return button(
    CUSTOM_IDS.TRANSCRIPT,
    'Transcript',
    '📄',
    ButtonStyle.Secondary,
    disabled
  );
}

function buildAddUserButton(isLocked = false) {
  return button(
    CUSTOM_IDS.ADD_USER,
    'Add User',
    '👤',
    ButtonStyle.Secondary,
    isLocked
  );
}

function buildPriorityButton(isLocked = false) {
  return button(
    CUSTOM_IDS.PRIORITY,
    'Priority',
    '⚠️',
    ButtonStyle.Secondary,
    isLocked
  );
}

function buildReopenButton(disabled = false) {
  return button(
    CUSTOM_IDS.REOPEN,
    'Reopen',
    '🔓',
    ButtonStyle.Success,
    disabled
  );
}

function buildDeleteButton(disabled = false) {
  return button(
    CUSTOM_IDS.DELETE,
    'Delete',
    '🗑️',
    ButtonStyle.Danger,
    disabled
  );
}

function buildDeleteConfirmButton(disabled = false) {
  return button(
    CUSTOM_IDS.DELETE_CONFIRM,
    'Confirm Delete',
    '⚠️',
    ButtonStyle.Danger,
    disabled
  );
}

function getTicketActionButtons(ticket = {}, options = {}) {
  const status = normaliseStatus(ticket.status);
  const locked = isLockedStatus(status) || isDeletedTicket(ticket);

  if (isDeletedTicket(ticket)) {
    return [];
  }

  const allowArchive =
    options.allowArchive !== false;

  const allowTranscript =
    options.allowTranscript !== false;

  const allowAddUser =
    options.allowAddUser !== false;

  const allowPriority =
    options.allowPriority !== false;

  return [
    buildClaimButton(ticket, locked),
    buildCloseButton(locked),
    allowArchive ? buildArchiveButton(false) : null,
    allowTranscript ? buildTranscriptButton(false) : null,
    allowAddUser ? buildAddUserButton(locked) : null,
    allowPriority ? buildPriorityButton(locked) : null,
  ].filter(Boolean);
}

function getClosedTicketActionButtons(ticket = {}, options = {}) {
  if (isDeletedTicket(ticket)) {
    return [];
  }

  const allowReopen =
    options.allowReopen !== false;

  const allowArchive =
    options.allowArchive !== false;

  const allowTranscript =
    options.allowTranscript !== false;

  const allowDelete =
    options.allowDelete === true;

  return [
    allowReopen ? buildReopenButton(false) : null,
    allowArchive ? buildArchiveButton(false) : null,
    allowTranscript ? buildTranscriptButton(false) : null,
    allowDelete ? buildDeleteButton(false) : null,
  ].filter(Boolean);
}

function getArchivedTicketActionButtons(ticket = {}, options = {}) {
  if (isDeletedTicket(ticket)) {
    return [];
  }

  const allowReopen =
    options.allowReopen !== false;

  const allowTranscript =
    options.allowTranscript !== false;

  const allowDelete =
    options.allowDelete === true;

  return [
    allowReopen ? buildReopenButton(false) : null,
    allowTranscript ? buildTranscriptButton(false) : null,
    allowDelete ? buildDeleteButton(false) : null,
  ].filter(Boolean);
}

function getDeletedTicketActionButtons(ticket = {}, options = {}) {
  const allowTranscript =
    options.allowTranscript === true;

  return [
    allowTranscript ? buildTranscriptButton(false) : null,
  ].filter(Boolean);
}

function getDeleteConfirmActionRows(options = {}) {
  const disabled =
    options.disabled === true;

  return chunkButtons([
    buildDeleteConfirmButton(disabled),
  ]);
}

function getTicketActionRows(ticket = {}, options = {}) {
  const status = normaliseStatus(ticket.status);

  if (isDeletedTicket(ticket)) {
    return chunkButtons(
      getDeletedTicketActionButtons(ticket, options)
    );
  }

  if (isArchivedStatus(status)) {
    return getArchivedTicketActionRows(ticket, options);
  }

  if (isClosedStatus(status)) {
    return getClosedTicketActionRows(ticket, options);
  }

  return chunkButtons(
    getTicketActionButtons(ticket, options)
  );
}

function getClosedTicketActionRows(ticket = {}, options = {}) {
  return chunkButtons(
    getClosedTicketActionButtons(ticket, options)
  );
}

function getArchivedTicketActionRows(ticket = {}, options = {}) {
  return chunkButtons(
    getArchivedTicketActionButtons(ticket, options)
  );
}

function getDeletedTicketActionRows(ticket = {}, options = {}) {
  return chunkButtons(
    getDeletedTicketActionButtons(ticket, options)
  );
}

function isTicketButton(customId) {
  return Object.values(CUSTOM_IDS).includes(customId);
}

function isTicketControlButton(customId) {
  return isTicketButton(customId);
}

function getButtonType(customId) {
  const entry = Object.entries(CUSTOM_IDS).find(
    ([, value]) => value === customId
  );

  return entry ? entry[0].toLowerCase() : null;
}

module.exports = {
  CUSTOM_IDS,

  OPEN_STATUSES,
  CLOSED_STATUSES,
  ARCHIVED_STATUSES,
  DELETED_STATUSES,

  normaliseStatus,
  isOpenStatus,
  isClosedStatus,
  isArchivedStatus,
  isDeletedStatus,
  isDeletedTicket,
  isLockedStatus,

  button,
  chunkButtons,

  buildClaimButton,
  buildCloseButton,
  buildArchiveButton,
  buildTranscriptButton,
  buildAddUserButton,
  buildPriorityButton,
  buildReopenButton,
  buildDeleteButton,
  buildDeleteConfirmButton,

  getTicketActionButtons,
  getClosedTicketActionButtons,
  getArchivedTicketActionButtons,
  getDeletedTicketActionButtons,

  getTicketActionRows,
  getClosedTicketActionRows,
  getArchivedTicketActionRows,
  getDeletedTicketActionRows,
  getDeleteConfirmActionRows,

  isTicketButton,
  isTicketControlButton,
  getButtonType,
};
