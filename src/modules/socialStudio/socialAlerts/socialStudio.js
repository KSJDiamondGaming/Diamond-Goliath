'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const security = require('../../../core/security/securityCore');
const panels = require('./socialStudioPanel');

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
  return Array.isArray(section.userRoleIds)
    ? [...new Set(section.userRoleIds.map(String).filter(Boolean))]
    : [];
}

function getAccess(interaction) {
  const roleIds = getConfiguredRoleIds(interaction.guildId);
  const override = Boolean(
    security.isBotOwner?.(interaction.user?.id)
    || interaction.guild?.ownerId === interaction.user?.id
    || interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator),
  );
  const allowed = override
    || !roleIds.length
    || roleIds.some((id) => interaction.member?.roles?.cache?.has?.(id));
  return { allowed, roleIds, override };
}

function creators(section) {
  if (!section.creators || typeof section.creators !== 'object' || Array.isArray(section.creators)) {
    section.creators = {};
  }
  return section.creators;
}

function findByOwnerDiscordId(guildId, ownerDiscordId) {
  const ownerId = clean(ownerDiscordId, 25);
  if (!ownerId) return null;
  return Object.values(creators(getSection(guildId)))
    .find((creator) => creator?.ownerDiscordId === ownerId) || null;
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
  let creatorId;
  do {
    sequence += 1;
    creatorId = `creator_${String(sequence).padStart(6, '0')}`;
  } while (used.has(creatorId));
  section.creatorSequence = sequence;
  return creatorId;
}

function createForMember(member) {
  const guildId = member.guild.id;
  const ownerDiscordId = member.user.id;
  const existing = findByOwnerDiscordId(guildId, ownerDiscordId);
  if (existing) return { creator: existing, created: false };

  const section = getSection(guildId);
  const timestamp = new Date().toISOString();
  const creator = {
    creatorId: nextCreatorId(section),
    ownerDiscordId,
    displayName: clean(member.displayName || member.user.globalName || member.user.username, 120),
    group: '',
    tags: [],
    notes: '',
    enabled: true,
    status: ACTIVE,
    accountIds: [],
    profileCompleted: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  creators(section)[creator.creatorId] = creator;
  saveSection(guildId, section);
  return { creator, created: true };
}

function completeCreatorProfile(member, values) {
  const guildId = member.guild.id;
  const ownerDiscordId = String(member.user.id);
  const section = getSection(guildId);
  let creator = Object.values(creators(section))
    .find((entry) => entry?.ownerDiscordId === ownerDiscordId) || null;
  const timestamp = new Date().toISOString();
  const wasCompleted = creator?.profileCompleted === true;

  if (!creator) {
    creator = {
      creatorId: nextCreatorId(section),
      ownerDiscordId,
      enabled: true,
      status: ACTIVE,
      accountIds: [],
      createdAt: timestamp,
    };
    creators(section)[creator.creatorId] = creator;
  }

  creator.ownerDiscordId = ownerDiscordId;
  creator.displayName = clean(values.displayName, 120);
  creator.group = clean(values.group, 120);
  creator.tags = String(values.tags || '')
    .split(',')
    .map((value) => clean(value, 60))
    .filter(Boolean);
  creator.notes = clean(values.notes, 1000);
  creator.enabled = creator.enabled !== false;
  creator.status = ACTIVE;
  creator.accountIds = Array.isArray(creator.accountIds) ? creator.accountIds : [];
  creator.profileCompleted = true;
  creator.updatedAt = timestamp;
  saveSection(guildId, section);

  return { creator, created: !wasCompleted };
}

function markMemberActive(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const creator = Object.values(creators(section))
    .find((item) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!creator) return null;
  creator.status = ACTIVE;
  creator.updatedAt = new Date().toISOString();
  saveSection(guildId, section);
  return creator;
}

function markMemberLeft(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const creator = Object.values(creators(section))
    .find((item) => item?.ownerDiscordId === String(ownerDiscordId));
  if (!creator) return null;
  creator.status = LEFT_SERVER;
  creator.updatedAt = new Date().toISOString();
  saveSection(guildId, section);
  return creator;
}

function deleteCreatorOwnedData(guildId, ownerDiscordId) {
  const section = getSection(guildId);
  const entry = Object.entries(creators(section))
    .find(([, item]) => item?.ownerDiscordId === String(ownerDiscordId));
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
      if (value?.creatorId === creatorId || value?.ownerDiscordId === String(ownerDiscordId)) {
        delete section[key][id];
      }
    }
  }

  saveSection(guildId, section);
  return true;
}

function getCreatorContext(interaction) {
  const access = getAccess(interaction);
  if (!access.allowed) {
    return { payload: panels.user.buildDenied(interaction, access.roleIds) };
  }
  const creator = findByOwnerDiscordId(interaction.guildId, interaction.user.id);
  if (!creator) return { payload: panels.user.buildCreate(interaction) };
  return { creator, accounts: getAccountsForCreator(interaction.guildId, creator) };
}

async function handleUserInteraction(interaction, updatePanel) {
  const customId = String(interaction?.customId || '');
  const isSocial = customId === 'user:category:social'
    || customId === 'user:module:social'
    || customId === 'user:social:open'
    || customId === 'user:social:create'
    || customId === 'user:social:create:submit'
    || /^user:social:(details|accounts|alerts|templates|notifications)$/.test(customId);
  if (!isSocial) return false;

  if (customId === 'user:category:social') {
    return updatePanel(interaction, panels.user.buildLanding(interaction));
  }

  if (customId === 'user:social:create' && interaction.isButton?.()) {
    const access = getAccess(interaction);
    if (!access.allowed) {
      return updatePanel(interaction, panels.user.buildDenied(interaction, access.roleIds));
    }

    const creator = findByOwnerDiscordId(interaction.guildId, interaction.user.id);
    if (creator?.profileCompleted === true) {
      return updatePanel(
        interaction,
        panels.user.buildProfile(
          interaction,
          creator,
          getAccountsForCreator(interaction.guildId, creator),
        ),
      );
    }

    await interaction.showModal(panels.user.creatorModal(creator, interaction));
    return true;
  }

  if (customId === 'user:social:create:submit' && interaction.isModalSubmit?.()) {
    const access = getAccess(interaction);
    if (!access.allowed) {
      await interaction.reply({ content: 'You no longer have access to Social Studio.', flags: 64 });
      return true;
    }

    const displayName = interaction.fields.getTextInputValue('displayName').trim();
    if (!displayName) {
      await interaction.reply({ content: 'Creator display name is required.', flags: 64 });
      return true;
    }

    const result = completeCreatorProfile(interaction.member, {
      displayName,
      group: interaction.fields.getTextInputValue('group'),
      tags: interaction.fields.getTextInputValue('tags'),
      notes: interaction.fields.getTextInputValue('notes'),
    });
    const accounts = getAccountsForCreator(interaction.guildId, result.creator);
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    return updatePanel(
      interaction,
      panels.user.buildProfile(interaction, result.creator, accounts, true),
    );
  }

  const context = getCreatorContext(interaction);
  if (context.payload) return updatePanel(interaction, context.payload);

  const match = customId.match(/^user:social:(details|accounts|alerts|templates|notifications)$/);
  return updatePanel(
    interaction,
    match
      ? panels.user.buildSection(interaction, context.creator, match[1], context.accounts)
      : panels.user.buildProfile(interaction, context.creator, context.accounts),
  );
}

const user = {
  buildLanding: panels.user.buildLanding,
  buildDenied: panels.user.buildDenied,
  buildCreate: panels.user.buildCreate,
  buildProfile: panels.user.buildProfile,
  buildSection: panels.user.buildSection,
  handleInteraction: handleUserInteraction,
  canAccess: (interaction) => getAccess(interaction).allowed,
};

module.exports = {
  startup() {},
  shutdown() {},
  admin: panels.admin,
  user,
  ACTIVE,
  LEFT_SERVER,
  getConfiguredRoleIds,
  getAccess,
  findByOwnerDiscordId,
  getAccountsForCreator,
  createForMember,
  completeCreatorProfile,
  markMemberActive,
  markMemberLeft,
  deleteCreatorOwnedData,
};
