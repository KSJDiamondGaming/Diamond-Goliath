const roleStore = require('./roleStore');

function getRoleConfig(guildId, client) {
  if (typeof roleStore.loadRoleData === 'function') {
    return roleStore.loadRoleData(guildId, client);
  }

  if (typeof roleStore.loadRoles === 'function') {
    return roleStore.loadRoles(guildId, client);
  }

  return { reactionRoles: {}, buttonRoles: {} };
}

function saveRoleConfig(guildId, data, client) {
  if (typeof roleStore.saveRoleData === 'function') {
    return roleStore.saveRoleData(guildId, data, client);
  }

  if (typeof roleStore.saveRoles === 'function') {
    return roleStore.saveRoles(guildId, data, client);
  }

  return data;
}

function canManageRole(guild, role) {
  const botMember = guild?.members?.me;
  if (!botMember || !role) return false;

  return botMember.roles.highest.position > role.position && !role.managed;
}

async function toggleMemberRole(member, roleId) {
  if (!member || !roleId) return null;

  const role = member.guild.roles.cache.get(roleId);
  if (!canManageRole(member.guild, role)) return null;

  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId, 'Goliath reaction/button role toggle');
    return { action: 'removed', role };
  }

  await member.roles.add(roleId, 'Goliath reaction/button role toggle');
  return { action: 'added', role };
}

function getReactionRole(data, messageId, emojiKey) {
  const entries = data.reactionRoles || {};
  const messageConfig = entries[messageId];

  if (!messageConfig) return null;

  return messageConfig.roles?.[emojiKey] || null;
}

function getButtonRole(data, customId) {
  const entries = data.buttonRoles || {};
  return entries[customId] || null;
}

async function handleReactionRole(reaction, user, client) {
  if (!reaction?.message?.guild || user?.bot) return null;

  if (reaction.partial) await reaction.fetch().catch(() => null);
  if (reaction.message?.partial) await reaction.message.fetch().catch(() => null);

  const guild = reaction.message.guild;
  const emojiKey = reaction.emoji.id || reaction.emoji.name;
  const data = getRoleConfig(guild.id, client);
  const roleId = getReactionRole(data, reaction.message.id, emojiKey);

  if (!roleId) return null;

  const member = await guild.members.fetch(user.id).catch(() => null);
  return toggleMemberRole(member, roleId);
}

async function handleButtonRole(interaction, client) {
  if (!interaction?.guild || !interaction.isButton?.()) return null;

  const data = getRoleConfig(interaction.guild.id, client);
  const roleId = getButtonRole(data, interaction.customId);

  if (!roleId) return null;

  const result = await toggleMemberRole(interaction.member, roleId);

  if (!interaction.replied && !interaction.deferred) {
    const label = result?.role?.name || 'role';
    const action = result?.action === 'removed' ? 'removed from' : 'added to';

    await interaction.reply({
      content: result
        ? `✅ ${label} ${action} your roles.`
        : '⚠️ I could not update that role. Please check my permissions and role position.',
      ephemeral: true,
    });
  }

  return result;
}

function registerReactionRole(guildId, messageId, emojiKey, roleId, client) {
  const data = getRoleConfig(guildId, client);

  data.reactionRoles = data.reactionRoles || {};
  data.reactionRoles[messageId] = data.reactionRoles[messageId] || { roles: {} };
  data.reactionRoles[messageId].roles[emojiKey] = roleId;

  saveRoleConfig(guildId, data, client);
  return data.reactionRoles[messageId];
}

function registerButtonRole(guildId, customId, roleId, client) {
  const data = getRoleConfig(guildId, client);

  data.buttonRoles = data.buttonRoles || {};
  data.buttonRoles[customId] = roleId;

  saveRoleConfig(guildId, data, client);
  return data.buttonRoles[customId];
}

module.exports = {
  handleReactionRole,
  handleButtonRole,
  registerReactionRole,
  registerButtonRole,
  toggleMemberRole,
};
