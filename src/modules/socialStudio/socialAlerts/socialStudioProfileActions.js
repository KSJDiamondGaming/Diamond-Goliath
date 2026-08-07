'use strict';

const store = require('./socialStudioStore');

function now() {
  return new Date().toISOString();
}

function clearCreatorProfile(guildId, creatorId, meta = {}) {
  return store.updateCreator(guildId, creatorId, (creator) => ({
    ...creator,
    group: '',
    tags: [],
    notes: '',
    adminNotes: '',
    updatedAt: now(),
  }), meta);
}

function deleteCreatorProfile(guildId, creatorId, meta = {}) {
  return store.deleteCreator(guildId, creatorId, meta);
}

module.exports = {
  clearCreatorProfile,
  deleteCreatorProfile,
};
