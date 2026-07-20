'use strict';

require('../roleStudioNavigationPatch');
require('../roleStudioChildNavigationPatch');

const reactionPanel = require('./reactionRolesPanelV7');
const roleStudio = require('../roleStudioPanel');
const temporaryRolesPanel = require('../temporaryRoles/temporaryRolesPanel');

const replacements = [
  [/Role Studio Builder/g, 'Reaction Roles Builder'],
  [/Role Studio/g, 'Reaction Roles'],
  [/Exit Studio/g, 'Exit Reaction Roles'],
  [/Role Studio templates/g, 'Reaction Role templates'],
];

function replaceText(value) {
  if (typeof value !== 'string') return value;
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

function transformValue(value) {
  if (typeof value === 'string') return replaceText(value);
  if (Array.isArray(value)) return value.map(transformValue);
  if (!value || typeof value !== 'object') return value;

  const source = typeof value.toJSON === 'function' ? value.toJSON() : value;
  return Object.fromEntries(Object.entries(source).map(([key, item]) => [key, transformValue(item)]));
}

function transformPayload(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return transformValue(payload);
}

function displayName(interaction) {
  return interaction.member?.displayName || interaction.user?.username || 'Unknown User';
}

async function respond(interaction, payload) {
  const transformed = transformPayload(payload);
  if (interaction.deferred || interaction.replied) return interaction.editReply(transformed);
  if (interaction.isButton?.() || interaction.isAnySelectMenu?.()) return interaction.update(transformed);
  return interaction.reply({ ...transformed, ephemeral: true });
}

async function buildReactionRolesAdminPanel(guild, memberDisplayName = 'Unknown User') {
  return transformPayload(await roleStudio.buildRoleStudioPanel(guild, memberDisplayName));
}

async function handleReactionRolesAdminInteraction(interaction) {
  const id = String(interaction.customId || '');
  if (!id.startsWith('admin:reactionRoles')) return false;

  if (id === 'admin:reactionRoles') {
    return respond(interaction, await roleStudio.buildRoleStudioPanel(interaction.guild, displayName(interaction)));
  }

  if (id === 'admin:reactionRoles:open') {
    interaction.customId = 'admin:reactionRoles';
  }

  if (id === 'admin:reactionRoles:analytics') {
    return respond(interaction, await roleStudio.buildRoleAnalyticsPanel(interaction.guild, displayName(interaction)));
  }

  if (id === 'admin:reactionRoles:health') {
    return respond(interaction, await roleStudio.buildRoleHealthPanel(interaction.guild, displayName(interaction)));
  }

  if (id.startsWith(temporaryRolesPanel.PREFIX)) {
    return temporaryRolesPanel.handleTemporaryRolesInteraction(interaction);
  }

  const originalReply = interaction.reply?.bind(interaction);
  const originalUpdate = interaction.update?.bind(interaction);
  const originalEditReply = interaction.editReply?.bind(interaction);

  if (originalReply) interaction.reply = (payload) => originalReply(transformPayload(payload));
  if (originalUpdate) interaction.update = (payload) => originalUpdate(transformPayload(payload));
  if (originalEditReply) interaction.editReply = (payload) => originalEditReply(transformPayload(payload));

  try {
    return await reactionPanel.handleReactionRolesAdminInteraction(interaction);
  } finally {
    if (originalReply) interaction.reply = originalReply;
    if (originalUpdate) interaction.update = originalUpdate;
    if (originalEditReply) interaction.editReply = originalEditReply;
  }
}

module.exports = {
  buildReactionRolesAdminPanel,
  handleReactionRolesAdminInteraction,
};
