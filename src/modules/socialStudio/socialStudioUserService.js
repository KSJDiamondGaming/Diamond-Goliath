'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../core/guild/guildManager');
const security = require('../../core/security/securityCore');

const ACTIVE = 'active';
const LEFT_SERVER = 'left_server';

function clean(value, max = 2000) {
  return String(value || '').trim().slice(0, max);
}

function getSection(guildId) {
  const section = guildManager.getGuildSection(guildId, 'social', {});
  return section && typeof section === 'object' && !Array.isArray(section) ? section : {};
}

function saveSection(guildId, section) {
  guildManager.saveGuildSection(guildId, 'social', section, { guildId });
  return section;
}

function getConfiguredRoleIds(guildId) {
  const section = getSection(guildId);
  return Array.isArray(section.userRoleIds) ? [...new Set(section.userRoleIds.map(String).filter(Boolean))] : [];
}

function getAccess(interaction) {
  const roleIds = getConfiguredRoleIds(interaction.guildId);
  const override = Boolean(
    security.isBotOwner?.(interaction.user?.id)
    || interaction.guild?.ownerId === interaction.user?.id
    || interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator),
  );
  const allowed = override || !roleIds.length || roleIds.some((id) => interaction.member?.roles?.cache?.has?.(id));
  return { allowed, roleIds, override };
}

function creators(section) {
  if (!section.creators || typeof section.creators !== 'object' || Array.isArray(section.creators)) section.creators = {};
  return section.creators;
}

function findByOwnerDiscordId(guildId, ownerDiscordId) {
  const ownerId = clean(ownerDiscordId, 25);
  if (!ownerId) return null;
  return Object.values(creators(getSection(guildId))).find((creator) => creator?.ownerDiscordId === ownerId) || null;
}

function getAccountsForCreator(guildId, creator) {
  if (!creator) return [];
  const section = getSection(guildId);
  const accounts = section.accounts && typeof section.accounts === 'object' && !Array.isArray(section.accounts)
    ? section.accounts
    : {};
  const accountIds = Array.isArray(creator.accountIds) ? creator.accountIds.map(String) : [];
  return accountIds.map((accountId) => accounts[accountId]).filter(Boolean);
}

function nextCreatorId(section) {
  const used = new Set(Object.keys(creators(section)));
  let sequence = Math.max(0, Number(section.creatorSequence || 0));
  let id;
  do {
    sequence += 1;
    id = `creator_${String(sequence).padStart(6, '0')}`;
  } while (used.has(id));
  section.creatorSequence = sequence;
  return id;
}

function createForMember(member) {
  const guildId = member.guild.id;
  const ownerDiscordId = member.user.id;
  const existing = findByOwnerDiscordId(guildId, ownerDiscordId);
  if (existing) return { creator: existing, created: false };

  const section = getSection(guildId);
  const creatorId = nextCreatorId(section);
  const timestamp = new Date().toISOString();
  const creator = {
    creatorId,
    ownerDiscordId,
    displayName: clean(member.displayName || member.user.globalName || member.user.username, 120),
    group: '',
    tags: [],
    notes: '',
    enabled: true,
    status: ACTIVE,
    accountIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  creators(section)[creatorId] = creator;
  saveSection(guildId, section);
  return { creator, created: true };
}

function markMemberActive(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const creator = Object.values(creators(section)).find((item) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!creator) return null;
  creator.status = ACTIVE;
  creator.updatedAt = new Date().toISOString();
  saveSection(guildId, section);
  return creator;
}

function markMemberLeft(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const creator = Object.values(creators(section)).find((item) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!creator) return null;
  creator.status = LEFT_SERVER;
  creator.updatedAt = new Date().toISOString();
  saveSection(guildId, section);
  return creator;
}

function deleteCreatorOwnedData(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const entry = Object.entries(creators(section)).find(([, item]) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!entry) return false;
  const [creatorId, creator] = entry;
  const accountIds = new Set(Array.isArray(creator.accountIds) ? creator.accountIds : []);
  delete section.creators[creatorId];
  if (section.accounts && typeof section.accounts === 'object') {
    for (const accountId of accountIds) delete section.accounts[accountId];
  }
  for (const key of ['drafts', 'scheduledPosts', 'creatorPreferences', 'notifications']) {
    if (!section[key] || typeof section[key] !== 'object') continue;
    for (const [id, value] of Object.entries(section[key])) {
      if (value?.creatorId === creatorId || value?.ownerDiscordId === String(ownerDiscordId)) delete section[key][id];
    }
  }
  saveSection(guildId, section);
  return true;
}

module.exports = {
  ACTIVE,
  LEFT_SERVER,
  getConfiguredRoleIds,
  getAccess,
  findByOwnerDiscordId,
  getAccountsForCreator,
  createForMember,
  markMemberActive,
  markMemberLeft,
  deleteCreatorOwnedData,
};
