'use strict';

const {
  fetchTarget,
  parseDuration,
  isValidTimeoutDuration,
  parseDeleteDays,
  isValidDeleteDays,
} = require('./punishments');
const { parseWarningExpiry } = require('./warns');
const { canActOnTarget, canBotActOnTarget } = require('./permissions');

function getMemberFromInteraction(interaction) {
  return (
    interaction.options?.getMember?.('user') ||
    interaction.options?.getMember?.('target') ||
    interaction.options?.getMember?.('member') ||
    interaction.guild?.members?.cache?.get(interaction.targetId) ||
    null
  );
}

function getUserFromInteraction(interaction) {
  return (
    interaction.options?.getUser?.('user') ||
    interaction.options?.getUser?.('target') ||
    interaction.options?.getUser?.('member') ||
    interaction.user ||
    null
  );
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

async function findMemberByQuery(guild, query) {
  if (!guild) return null;

  const raw = String(query || '').trim();
  if (!raw) return null;

  const mentionId = raw.match(/^<@!?(\d{16,20})>$/)?.[1];
  const directId = mentionId || (/^\d{16,20}$/.test(raw) ? raw : null);

  if (directId) {
    const directMember = await fetchTarget(guild, directId);
    if (directMember) return directMember;
  }

  const needle = normalizeSearchValue(raw);
  const valuesFor = (member) => [
    member.user?.username,
    member.user?.tag,
    member.displayName,
    member.nickname,
  ].map(normalizeSearchValue);

  const exact = guild.members.cache.find((member) =>
    valuesFor(member).some((value) => value === needle)
  );
  if (exact) return exact;

  const partial = guild.members.cache.find((member) =>
    valuesFor(member).some((value) => value && value.includes(needle))
  );
  if (partial) return partial;

  try {
    const results = await guild.members.search({ query: raw, limit: 10 });
    return results.find((member) =>
      valuesFor(member).some((value) => value === needle)
    ) || results.first() || null;
  } catch {
    return null;
  }
}

function getWarningExpiry(value) {
  return parseWarningExpiry(value);
}

function canModerate(interaction, targetMember) {
  if (!interaction?.guild || !interaction?.member || !targetMember) {
    return { ok: false, reason: 'Target member not found.' };
  }

  if (!canActOnTarget(interaction.member, targetMember, interaction.guild.ownerId)) {
    return { ok: false, reason: 'You cannot moderate this member due to role hierarchy.' };
  }

  if (!canBotActOnTarget(interaction.guild.members.me, targetMember)) {
    return { ok: false, reason: 'I cannot moderate this member due to role hierarchy.' };
  }

  return { ok: true, reason: null };
}

module.exports = {
  getMemberFromInteraction,
  getUserFromInteraction,
  fetchTarget,
  findMemberByQuery,
  parseDuration,
  isValidTimeoutDuration,
  parseDeleteDays,
  isValidDeleteDays,
  getWarningExpiry,
  canModerate,
};
