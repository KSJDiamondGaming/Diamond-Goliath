'use strict';

function displayName(member) {
  return member?.displayName || member?.user?.globalName || member?.user?.username || member?.id || 'Unknown';
}

function renderMessage(template, guild, members, config = {}) {
  const mentions = members.map((member) => `<@${member.id}>`).join(' ');
  const names = members.map((member) => displayName(member)).join(', ');
  const role = config.queueRoleId ? `<@&${config.queueRoleId}>` : '';
  const values = {
    members: mentions,
    memberNames: names,
    memberCount: members.length,
    server: guild?.name || '',
    guild: guild?.name || '',
    role,
    date: new Date().toLocaleDateString('en-GB'),
  };
  let output = String(template || '👋 Welcome our newest members!\n\n{members}');
  for (const [key, value] of Object.entries(values)) output = output.replaceAll(`{${key}}`, String(value));
  return output.trim();
}

function buildBatchPayload(guild, members, config = {}) {
  const content = renderMessage(config.message, guild, members, config).slice(0, 2000);
  const userIds = config.pingMembers === false ? [] : members.map((member) => member.id);
  return {
    content,
    allowedMentions: userIds.length
      ? { users: userIds, roles: [], repliedUser: false }
      : { parse: [], repliedUser: false },
  };
}

function splitIntoBatches(members, config = {}) {
  const requested = Number(config.batchSize || 20);
  const batchSize = Number.isFinite(requested) ? Math.min(50, Math.max(1, Math.floor(requested))) : 20;
  const batches = [];
  for (let index = 0; index < members.length; index += batchSize) batches.push(members.slice(index, index + batchSize));
  return batches;
}

module.exports = {
  displayName,
  renderMessage,
  buildBatchPayload,
  splitIntoBatches,
};