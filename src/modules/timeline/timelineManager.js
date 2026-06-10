const timelineStore = require('./timelineStore');

const TYPES = {
  SYSTEM: 'system',
  ADMIN: 'admin',
  MODERATION: 'moderation',
  AUTOMOD: 'automod',
  TICKET: 'ticket',
  ROLE: 'role',
  STICKY: 'sticky',
  SUGGESTION: 'suggestion',
  SECURITY: 'security',
  EMBED: 'embed',
};

function isDev(client) {
  return String(client?.botMode || process.env.BOT_MODE || '').toUpperCase() === 'DEV';
}

function getActorInfo(actor) {
  if (!actor) {
    return {
      actorId: null,
      actorTag: null,
    };
  }

  return {
    actorId: actor.id || actor.user?.id || null,
    actorTag:
      actor.tag ||
      actor.user?.tag ||
      actor.displayName ||
      actor.username ||
      null,
  };
}

function cleanText(value, fallback, maxLength) {
  const text = String(value || fallback || '').trim();
  return text.slice(0, maxLength);
}

function createTimelineEvent(guildId, input = {}, client) {
  if (!guildId) return null;

  const actor = getActorInfo(input.actor);

  const event = timelineStore.addTimelineEvent(
    guildId,
    {
      type: cleanText(input.type, TYPES.SYSTEM, 40),
      title: cleanText(input.title, 'Timeline Event', 120),
      description: input.description
        ? cleanText(input.description, null, 500)
        : null,
      actorId: input.actorId || actor.actorId,
      actorTag: input.actorTag || actor.actorTag,
      channelId: input.channelId || input.channel?.id || null,
      targetId: input.targetId || input.target?.id || null,
      meta: input.meta || {},
    },
    client
  );

  if (event && isDev(client)) {
    console.log(
      `[Timeline] ${event.type}: ${event.title} (${guildId})`
    );
  }

  return event;
}

function listTimeline(guildId, options = {}, client) {
  if (!guildId) return [];
  return timelineStore.listTimelineEvents(guildId, options, client);
}

function clearTimeline(guildId, client) {
  if (!guildId) return null;
  return timelineStore.clearTimeline(guildId, client);
}

module.exports = {
  TYPES,
  createTimelineEvent,
  listTimeline,
  clearTimeline,
};
