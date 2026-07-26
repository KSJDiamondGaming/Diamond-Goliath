'use strict';

// Canonical Embed tracking and socket layer.

const {
  emitGuildUpdate,
} = require('../../../server/sockets/socketHub');

const EVENTS = Object.freeze({
  EMBED_CREATED: 'embed.created',
  EMBED_UPDATED: 'embed.updated',
  EMBED_DELETED: 'embed.deleted',
  EMBED_STATUS_UPDATED: 'embed.status.updated',
});

function now() {
  return new Date().toISOString();
}

function createPayload(event, guildId, data = {}) {
  const timestamp = now();

  return {
    module: 'embeds',
    event,
    guildId: String(guildId),
    timestamp,
    updatedAt: timestamp,
    data,
  };
}

function emit(event, guildId, data = {}) {
  const payload = createPayload(event, guildId, data);
  const update = emitGuildUpdate(guildId, payload);

  if (!update) return payload;

  return update;
}

function deploymentPayload(deployment = {}) {
  return {
    key: deployment.key || null,
    channelId: deployment.channelId || null,
    messageId: deployment.messageId || null,
    template: deployment.template || null,
    preset: deployment.preset || null,
    status: deployment.status || null,
    createdAt: deployment.createdAt || null,
    createdBy: deployment.createdBy || null,
    lastUpdatedAt: deployment.lastUpdatedAt || null,
    lastUpdatedBy: deployment.lastUpdatedBy || null,
    lastCheckedAt: deployment.lastCheckedAt || null,
    missingReason: deployment.missingReason || null,
  };
}

function emitEmbedUpdated(guildId, deployment) {
  return emit(EVENTS.EMBED_UPDATED, guildId, deploymentPayload(deployment));
}

function emitEmbedStatusUpdated(guildId, deployment) {
  return emit(EVENTS.EMBED_STATUS_UPDATED, guildId, deploymentPayload(deployment));
}

function emitEmbedDeleted(guildId, key) {
  return emit(EVENTS.EMBED_DELETED, guildId, { key });
}

module.exports = {
  EVENTS,
  emit,
  emitEmbedUpdated,
  emitEmbedStatusUpdated,
  emitEmbedDeleted,
};
