// src/modules/feedbackStudio/tickets/ticketAnalytics.js

const {
  getGuildSection,
  saveGuildSection,
} = require('../../../core/guild/guildManager');

const {
  emitAnalyticsUpdated,
} = require('./ticketSocketEvents');

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

function saveAndEmitAnalytics(
  guildId,
  analytics
) {
  const saved =
    saveAnalytics(
      guildId,
      analytics
    );

  emitAnalyticsUpdated(
    guildId,
    saved
  );

  return saved;
}

function incrementCounter(
  object,
  key,
  amount = 1
) {
  object[key] =
    Number(object[key] || 0) + amount;
}

function ensureStaffStats(
  analytics,
  actorId
) {
  if (!actorId) return null;

  if (!analytics.staff[actorId]) {
    analytics.staff[actorId] = {
      claimed: 0,
      closed: 0,
      reopened: 0,
      archived: 0,
      messages: 0,
    };
  }

  return analytics.staff[actorId];
}

function updateRollingAverage(
  currentAverage,
  nextValue
) {
  const current =
    Number(currentAverage || 0);

  const next =
    Number(nextValue || 0);

  if (next <= 0) {
    return current;
  }

  if (current <= 0) {
    return next;
  }

  return Math.floor(
    (current + next) / 2
  );
}

function getElapsedMsFrom(
  isoDate
) {
  if (!isoDate) return 0;

  const start =
    new Date(isoDate).getTime();

  if (!Number.isFinite(start)) {
    return 0;
  }

  return Math.max(
    0,
    Date.now() - start
  );
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

  return saveAndEmitAnalytics(
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

  const staffStats =
    ensureStaffStats(
      analytics,
      actorId
    );

  if (staffStats) {
    incrementCounter(
      staffStats,
      'claimed'
    );
  }

  const claimMs =
    getElapsedMsFrom(
      ticket?.createdAt
    );

  analytics.performance.averageClaimTimeMs =
    updateRollingAverage(
      analytics.performance.averageClaimTimeMs,
      claimMs
    );

  return saveAndEmitAnalytics(
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

  const staffStats =
    ensureStaffStats(
      analytics,
      actorId
    );

  if (staffStats) {
    incrementCounter(
      staffStats,
      'closed'
    );
  }

  const closeMs =
    getElapsedMsFrom(
      ticket?.createdAt
    );

  analytics.performance.averageCloseTimeMs =
    updateRollingAverage(
      analytics.performance.averageCloseTimeMs,
      closeMs
    );

  analytics.activity.lastTicketClosedAt =
    now();

  return saveAndEmitAnalytics(
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

  const staffStats =
    ensureStaffStats(
      analytics,
      actorId
    );

  if (staffStats) {
    incrementCounter(
      staffStats,
      'reopened'
    );
  }

  analytics.activity.lastTicketReopenedAt =
    now();

  return saveAndEmitAnalytics(
    guildId,
    analytics
  );
}

function trackTicketArchived(
  guildId,
  ticket = null,
  actorId = null
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

  const staffStats =
    ensureStaffStats(
      analytics,
      actorId
    );

  if (staffStats) {
    incrementCounter(
      staffStats,
      'archived'
    );
  }

  return saveAndEmitAnalytics(
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

  return saveAndEmitAnalytics(
    guildId,
    analytics
  );
}

module.exports = {
  getAnalytics,
  saveAnalytics,
  saveAndEmitAnalytics,

  trackTicketCreated,
  trackTicketClaimed,
  trackTicketClosed,
  trackTicketReopened,
  trackTicketArchived,
  trackTicketDeleted,
};
