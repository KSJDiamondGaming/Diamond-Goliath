'use strict';

/**
 * GOLIATH TICKET CHANNEL BUTTONS
 *
 * Reusable Discord button/action-row builder for ticket channels.
 *
 * Standardized ticket statuses:
 * - open
 * - claimed
 * - waiting_user
 * - in_review
 * - approved
 * - denied
 * - closed
 * - archived
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
};

function normaliseStatus(status) {
  return String(status || 'open').toLowerCase();
}

function button(
  id,
  label,
  emoji,
  style = ButtonStyle.Secondary,
  disabled = false
) {
  return new ButtonBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style)
    .setDisabled(Boolean(disabled));
}

function getTicketActionRows(ticket = {}, options = {}) {
  const status = normaliseStatus(ticket.status);

  const isClosed = status === 'closed';
  const isArchived = status === 'archived';
  const isLocked = isClosed || isArchived;

  const allowDelete = Boolean(options.allowDelete);
  const allowReopen = Boolean(options.allowReopen);

  const rowOne = new ActionRowBuilder().addComponents(
    button(
      CUSTOM_IDS.CLAIM,
      'Claim',
      '🎫',
      ButtonStyle.Primary,
      isLocked
    ),
    button(
      CUSTOM_IDS.CLOSE,
      'Close',
      '🔒',
      ButtonStyle.Danger,
      isLocked
    ),
    button(
      CUSTOM_IDS.ARCHIVE,
      'Archive',
      '📁',
      ButtonStyle.Secondary,
      isArchived
    ),
    button(
      CUSTOM_IDS.TRANSCRIPT,
      'Transcript',
      '📄',
      ButtonStyle.Secondary,
      false
    )
  );

  const rowTwo = new ActionRowBuilder().addComponents(
    button(
      CUSTOM_IDS.ADD_USER,
      'Add User',
      '👤',
      ButtonStyle.Secondary,
      isLocked
    ),
    button(
      CUSTOM_IDS.PRIORITY,
      'Priority',
      '⚠️',
      ButtonStyle.Secondary,
      isLocked
    )
  );

  if (allowReopen && isClosed) {
    rowTwo.addComponents(
      button(
        CUSTOM_IDS.REOPEN,
        'Reopen',
        '🔓',
        ButtonStyle.Success,
        false
      )
    );
  }

  if (allowDelete) {
    rowTwo.addComponents(
      button(
        CUSTOM_IDS.DELETE,
        'Delete',
        '🗑️',
        ButtonStyle.Danger,
        false
      )
    );
  }

  return [rowOne, rowTwo];
}

function getClosedTicketActionRows(ticket = {}, options = {}) {
  return getTicketActionRows(
    {
      ...ticket,
      status: 'closed',
    },
    {
      ...options,
      allowReopen: true,
    }
  );
}

function getArchivedTicketActionRows(ticket = {}, options = {}) {
  return getTicketActionRows(
    {
      ...ticket,
      status: 'archived',
    },
    options
  );
}

function isTicketButton(customId) {
  return Object.values(CUSTOM_IDS).includes(customId);
}

module.exports = {
  CUSTOM_IDS,

  getTicketActionRows,
  getClosedTicketActionRows,
  getArchivedTicketActionRows,

  isTicketButton,
};