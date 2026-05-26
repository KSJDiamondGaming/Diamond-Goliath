// src/modules/tickets/ticketAnalytics.js

const {
  getGuildSection,
  saveGuildSection,
} = require('../../guild/guildManager');

function now() {
  return new Date().toISOString();
}

function defaultAnalytics() {
  return {
    totals: {
      created: 0,
      closed: 0,
      reopened: 0,
      archived: 0,
      deleted: 0,
    },

    status: {
      open: 0,
      claimed: 0,
      closed: 0,
      archived: 0,
    },

    ticketTypes: {},

    panels: {},

    staff: {},

    performance: {
      averageClaimTimeMs: 0,
      averageCloseTimeMs: 0,
    },

    activity: {
      lastTicketCreatedAt: null,
      lastTicketClosedAt: null,
      lastTicketReopenedAt: null,
    },

    updatedAt: now(),
  };
}

function getAnalytics(guildId) {
  const tickets = getGuildSection(
    guildId,
    'tickets',
    {}
  );

  return {
    ...defaultAnalytics(),
    ...(tickets.analytics || {}),
  };
}

function saveAnalytics(
  guildId,
  analytics
) {
  const tickets = getGuildSection(
    guildId,
    'tickets',
    {}
  );

  tickets.analytics = {
    ...defaultAnalytics(),
    ...(analytics || {}),
    updatedAt: now(),
  };

  saveGuildSection(
    guildId,
    'tickets',
    tickets
  );

  return tickets.analytics;
}

function incrementCounter(
  object,
  key,
  amount = 1
) {
  object[key] =
    Number(object[key] || 0) + amount;
}

function trackTicketCreated(
  guildId,
  ticket
) {
  const analytics =
    getAnalytics(guildId);

  incrementCounter(
    analytics.totals,
    'created'
  );

  incrementCounter(
    analytics.status,
    'open'
  );

  if (ticket?.type) {
    incrementCounter(
      analytics.ticketTypes,
      ticket.type
    );
  }

  const panelId =
    ticket?.metadata?.panelId;

  if (panelId) {
    incrementCounter(
      analytics.panels,
      panelId
    );
  }

  analytics.activity.lastTicketCreatedAt =
    now();

  return saveAnalytics(
    guildId,
    analytics
  );
}

function trackTicketClaimed(
  guildId,
  ticket,
  actorId
) {
  const analytics =
    getAnalytics(guildId);

  incrementCounter(
    analytics.status,
    'claimed'
  );

  if (actorId) {
    if (!analytics.staff[actorId]) {
      analytics.staff[actorId] = {
        claimed: 0,
        closed: 0,
        reopened: 0,
        messages: 0,
      };
    }

    incrementCounter(
      analytics.staff[actorId],
      'claimed'
    );
  }

  if (ticket?.createdAt) {
    const claimMs =
      Date.now() -
      new Date(
        ticket.createdAt
      ).getTime();

    const current =
      Number(
        analytics.performance
          .averageClaimTimeMs || 0
      );

    analytics.performance.averageClaimTimeMs =
      current <= 0
        ? claimMs
        : Math.floor(
            (current + claimMs) / 2
          );
  }

  return saveAnalytics(
    guildId,
    analytics
  );
}

function trackTicketClosed(
  guildId,
  ticket,
  actorId
) {
  const analytics =
    getAnalytics(guildId);

  incrementCounter(
    analytics.totals,
    'closed'
  );

  incrementCounter(
    analytics.status,
    'closed'
  );

  if (actorId) {
    if (!analytics.staff[actorId]) {
      analytics.staff[actorId] = {
        claimed: 0,
        closed: 0,
        reopened: 0,
        messages: 0,
      };
    }

    incrementCounter(
      analytics.staff[actorId],
      'closed'
    );
  }

  if (ticket?.createdAt) {
    const closeMs =
      Date.now() -
      new Date(
        ticket.createdAt
      ).getTime();

    const current =
      Number(
        analytics.performance
          .averageCloseTimeMs || 0
      );

    analytics.performance.averageCloseTimeMs =
      current <= 0
        ? closeMs
        : Math.floor(
            (current + closeMs) / 2
          );
  }

  analytics.activity.lastTicketClosedAt =
    now();

  return saveAnalytics(
    guildId,
    analytics
  );
}

function trackTicketReopened(
  guildId,
  actorId
) {
  const analytics =
    getAnalytics(guildId);

  incrementCounter(
    analytics.totals,
    'reopened'
  );

  if (actorId) {
    if (!analytics.staff[actorId]) {
      analytics.staff[actorId] = {
        claimed: 0,
        closed: 0,
        reopened: 0,
        messages: 0,
      };
    }

    incrementCounter(
      analytics.staff[actorId],
      'reopened'
    );
  }

  analytics.activity.lastTicketReopenedAt =
    now();

  return saveAnalytics(
    guildId,
    analytics
  );
}

function trackTicketArchived(
  guildId
) {
  const analytics =
    getAnalytics(guildId);

  incrementCounter(
    analytics.totals,
    'archived'
  );

  incrementCounter(
    analytics.status,
    'archived'
  );

  return saveAnalytics(
    guildId,
    analytics
  );
}

function trackTicketDeleted(
  guildId
) {
  const analytics =
    getAnalytics(guildId);

  incrementCounter(
    analytics.totals,
    'deleted'
  );

  return saveAnalytics(
    guildId,
    analytics
  );
}

module.exports = {
  getAnalytics,
  saveAnalytics,

  trackTicketCreated,
  trackTicketClaimed,
  trackTicketClosed,
  trackTicketReopened,
  trackTicketArchived,
  trackTicketDeleted,
};
