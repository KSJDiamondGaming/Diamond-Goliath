'use strict';

// src/modules/roles/reactionRoleHandler.js

const roleStore = require('./roleStore');
const roleManager = require('./roleManager');

function emojiMatches(configEmoji, reactionEmoji) {
  const expected = String(configEmoji || '').trim();
  if (!expected || !reactionEmoji) return false;

  const emojiId = reactionEmoji.id || null;
  const emojiName = reactionEmoji.name || null;
  const fullCustom = emojiId && emojiName ? `<:${emojiName}:${emojiId}>` : null;

  return (
    expected === emojiName ||
    expected === emojiId ||
    expected === fullCustom ||
    expected.includes(`:${emojiId}>`)
  );
}

function findPanelByMessage(guildId, messageId) {
  return roleStore
    .getReactionPanels(guildId)
    .find((panel) => panel.enabled !== false && panel.messageId === messageId) || null;
}

function findRoleByEmoji(panel, reactionEmoji) {
  return (panel.roles || []).find(
    (role) => role.enabled !== false && emojiMatches(role.emoji, reactionEmoji)
  ) || null;
}

function canUseReactionRoles(panel) {
  return Boolean(panel && Array.isArray(panel.roles) && panel.roles.some((role) => role.emoji));
}

async function handleReactionAdd(reaction, user) {
  if (user?.bot) return null;

  if (reaction?.partial) {
    await reaction.fetch().catch(() => null);
  }

  if (reaction?.message?.partial) {
    await reaction.message.fetch().catch(() => null);
  }

  const message = reaction?.message;
  const guild = message?.guild;

  if (!guild?.id || !message?.id) return null;

  const panel = findPanelByMessage(guild.id, message.id);
  if (!canUseReactionRoles(panel)) return null;

  const roleConfig = findRoleByEmoji(panel, reaction.emoji);
  if (!roleConfig) return null;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return null;

  const fakeInteraction = {
    guild,
    guildId: guild.id,
    member,
    user,
  };

  return roleManager.applyRoleToggle(
    fakeInteraction,
    panel.panelId || panel.id,
    roleConfig.id || roleConfig.roleId
  );
}

async function handleReactionRemove(reaction, user) {
  if (user?.bot) return null;

  if (reaction?.partial) {
    await reaction.fetch().catch(() => null);
  }

  if (reaction?.message?.partial) {
    await reaction.message.fetch().catch(() => null);
  }

  const message = reaction?.message;
  const guild = message?.guild;

  if (!guild?.id || !message?.id) return null;

  const panel = findPanelByMessage(guild.id, message.id);
  if (!canUseReactionRoles(panel)) return null;

  const roleConfig = findRoleByEmoji(panel, reaction.emoji);
  if (!roleConfig || roleConfig.mode === roleManager.ROLE_MODES.ADD || roleConfig.mode === roleManager.ROLE_MODES.VERIFY) {
    return null;
  }

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member || !member.roles.cache.has(roleConfig.roleId)) return null;

  const role = guild.roles.cache.get(roleConfig.roleId) || await guild.roles.fetch(roleConfig.roleId).catch(() => null);
  const safety = roleManager.validateRoleSafety(guild, role);

  if (!safety.ok) return null;

  await member.roles.remove(role, 'Goliath reaction role removed');
  roleStore.addAnalytics(guild.id, { removed: 1 });

  return { ok: true, message: `Removed ${role.name}.` };
}

module.exports = {
  handleReactionAdd,
  handleReactionRemove,
  findPanelByMessage,
  findRoleByEmoji,
};
