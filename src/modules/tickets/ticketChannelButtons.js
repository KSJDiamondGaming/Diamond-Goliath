'use strict';

/**
 * GOLIATH TICKET CHANNEL BUTTONS
 *
 * Enterprise reusable action row system.
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
  DELETE_CONFIRM:
    'goliath_ticket_delete_confirm',
};

function normaliseStatus(status) {
  return String(
    status || 'open'
  ).toLowerCase();
}

function button(
  id,
  label,
  emoji,
  style = ButtonStyle.Secondary,
  disabled = false
) {
  const builder =
    new ButtonBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setDisabled(
        Boolean(disabled)
      );

  if (emoji) {
    builder.setEmoji(emoji);
  }

  return builder;
}

function chunkButtons(
  buttons = [],
  max = 5
) {
  const rows = [];

  for (
    let i = 0;
    i < buttons.length;
    i += max
  ) {
    rows.push(
      new ActionRowBuilder().addComponents(
        buttons.slice(i, i + max)
      )
    );
  }

  return rows;
}

function buildClaimButton(
  ticket,
  isLocked
) {
  const claimedById =
    ticket.claimedById ||
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

function buildCloseButton(
  isLocked
) {
  return button(
    CUSTOM_IDS.CLOSE,
    'Close',
    '🔒',
    ButtonStyle.Danger,
    isLocked
  );
}

function buildArchiveButton(
  isArchived
) {
  return button(
    CUSTOM_IDS.ARCHIVE,
    'Archive',
    '📁',
    ButtonStyle.Secondary,
    isArchived
  );
}

function buildTranscriptButton() {
  return button(
    CUSTOM_IDS.TRANSCRIPT,
    'Transcript',
    '📄',
    ButtonStyle.Secondary,
    false
  );
}

function buildAddUserButton(
  isLocked
) {
  return button(
    CUSTOM_IDS.ADD_USER,
    'Add User',
    '👤',
    ButtonStyle.Secondary,
    isLocked
  );
}

function buildPriorityButton(
  isLocked
) {
  return button(
    CUSTOM_IDS.PRIORITY,
    'Priority',
    '⚠️',
    ButtonStyle.Secondary,
    isLocked
  );
}

function buildReopenButton() {
  return button(
    CUSTOM_IDS.REOPEN,
    'Reopen',
    '🔓',
    ButtonStyle.Success,
    false
  );
}

function buildDeleteButton() {
  return button(
    CUSTOM_IDS.DELETE,
    'Delete',
    '🗑️',
    ButtonStyle.Danger,
    false
  );
}

function buildDeleteConfirmButton() {
  return button(
    CUSTOM_IDS.DELETE_CONFIRM,
    'Confirm Delete',
    '⚠️',
    ButtonStyle.Danger,
    false
  );
}

function getTicketActionRows(
  ticket = {},
  options = {}
) {
  const status =
    normaliseStatus(
      ticket.status
    );

  const isClosed =
    status === 'closed';

  const isArchived =
    status === 'archived';

  const isLocked =
    isClosed || isArchived;

  const allowDelete =
    Boolean(
      options.allowDelete
    );

  const allowReopen =
    Boolean(
      options.allowReopen
    );

  const confirmDelete =
    Boolean(
      options.confirmDelete
    );

  const primaryButtons = [
    buildClaimButton(
      ticket,
      isLocked
    ),

    buildCloseButton(
      isLocked
    ),

    buildArchiveButton(
      isArchived
    ),

    buildTranscriptButton(),
  ];

  const secondaryButtons = [
    buildAddUserButton(
      isLocked
    ),

    buildPriorityButton(
      isLocked
    ),
  ];

  if (
    allowReopen &&
    isClosed
  ) {
    secondaryButtons.push(
      buildReopenButton()
    );
  }

  if (allowDelete) {
    secondaryButtons.push(
      confirmDelete
        ? buildDeleteConfirmButton()
        : buildDeleteButton()
    );
  }

  return [
    ...chunkButtons(
      primaryButtons
    ),

    ...chunkButtons(
      secondaryButtons
    ),
  ];
}

function getClosedTicketActionRows(
  ticket = {},
  options = {}
) {
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

function getArchivedTicketActionRows(
  ticket = {},
  options = {}
) {
  const allowDelete =
    Boolean(options.allowDelete);

  const confirmDelete =
    Boolean(options.confirmDelete);

  const buttons = [
    buildReopenButton(),
    buildTranscriptButton(),
  ];

  if (allowDelete) {
    buttons.push(
      confirmDelete
        ? buildDeleteConfirmButton()
        : buildDeleteButton()
    );
  }

  return chunkButtons(buttons);
}


function isTicketButton(
  customId
) {
  return Object.values(
    CUSTOM_IDS
  ).includes(customId);
}

module.exports = {
  CUSTOM_IDS,

  getTicketActionRows,
  getClosedTicketActionRows,
  getArchivedTicketActionRows,

  isTicketButton,

  chunkButtons,
};