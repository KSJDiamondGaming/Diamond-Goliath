'use strict';

const { PermissionFlagsBits } = require('discord.js');

const DISCORD_ID_RE = /^\d{16,20}$/;
const MAX_TIMEOUT_MS = 28 * 24 * 60 * 60 * 1000;
const DURATION_UNITS = Object.freeze({
  s: 1000,
  m: 60 * 1000,
  h: 60 * 60 * 1000,
  d: 24 * 60 * 60 * 1000,
  w: 7 * 24 * 60 * 60 * 1000,
});

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

async function fetchTarget(guild, userId) {
  const id = String(userId || '').trim();
  if (!guild || !DISCORD_ID_RE.test(id)) return null;

  return guild.members.fetch(id).catch(() => guild.members.cache.get(id) || null);
}

function normalizeSearchValue(value) {
  return String(value || '').trim().toLowerCase();
}

async function findMemberByQuery(guild, query) {
  if (!guild) return null;

  const raw = String(query || '').trim();
  if (!raw) return null;

  const mentionId = raw.match(/^<@!?(\d{16,20})>$/)?.[1];
  const directId = mentionId || (DISCORD_ID_RE.test(raw) ? raw : null);

  if (directId) {
    const directMember = await fetchTarget(guild, directId);
    if (directMember) return directMember;
  }

  const needle = normalizeSearchValue(raw);

  const cached = guild.members.cache.find((member) => {
    const values = [
      member.user?.username,
      member.user?.tag,
      member.displayName,
      member.nickname,
    ].map(normalizeSearchValue);

    return values.some((value) => value === needle);
  });

  if (cached) return cached;

  const partial = guild.members.cache.find((member) => {
    const values = [
      member.user?.username,
      member.user?.tag,
      member.displayName,
      member.nickname,
    ].map(normalizeSearchValue);

    return values.some((value) => value && value.includes(needle));
  });

  if (partial) return partial;

  try {
    const results = await guild.members.search({ query: raw, limit: 10 });
    return results.find((member) => {
      const values = [
        member.user?.username,
        member.user?.tag,
        member.displayName,
        member.nickname,
      ].map(normalizeSearchValue);
      return values.some((value) => value === needle);
    }) || results.first() || null;
  } catch {
    return null;
  }
}

function parseDuration(value) {
  const raw = String(value || '').trim().toLowerCase();
  const match = raw.match(/^(\d+(?:\.\d+)?)\s*([smhdw])$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const multiplier = DURATION_UNITS[match[2]];
  const durationMs = Math.floor(amount * multiplier);

  if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
  return durationMs;
}

function isValidTimeoutDuration(durationMs) {
  const value = Number(durationMs);
  return Number.isFinite(value) && value > 0 && value <= MAX_TIMEOUT_MS;
}

function parseDeleteDays(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) return null;

  const days = Number(raw);
  return isValidDeleteDays(days) ? days : null;
}

function isValidDeleteDays(value) {
  const days = Number(value);
  return Number.isInteger(days) && days >= 0 && days <= 7;
}

function getWarningExpiry(value) {
  const raw = String(value || 'never').trim().toLowerCase();

  if (!raw || raw === 'never' || raw === 'none') return null;

  const match = raw.match(/^(\d+)\s*([dwm])$/);
  if (!match) return null;

  const amount = Number(match[1]);
  if (!Number.isInteger(amount) || amount <= 0) return null;

  const now = new Date();

  if (match[2] === 'm') {
    const expiry = new Date(now);
    expiry.setUTCMonth(expiry.getUTCMonth() + amount);
    return expiry.toISOString();
  }

  const multiplier = match[2] === 'w'
    ? DURATION_UNITS.w
    : DURATION_UNITS.d;

  return new Date(now.getTime() + (amount * multiplier)).toISOString();
}

function canModerate(interaction, targetMember) {
  if (!interaction.guild || !interaction.member || !targetMember) {
    return { ok: false, reason: 'Target member not found.' };
  }

  if (targetMember.id === interaction.user.id) {
    return { ok: false, reason: 'You cannot moderate yourself.' };
  }

  if (targetMember.id === interaction.guild.ownerId) {
    return { ok: false, reason: 'You cannot moderate the server owner.' };
  }

  if (interaction.member.id !== interaction.guild.ownerId) {
    const actorHighestRole = interaction.member.roles?.highest;
    const targetHighestRole = targetMember.roles?.highest;

    if (
      actorHighestRole &&
      targetHighestRole &&
      targetHighestRole.position >= actorHighestRole.position
    ) {
      return {
        ok: false,
        reason: 'You cannot moderate a member with an equal or higher role.',
      };
    }
  }

  const botMember =
    interaction.guild.members.me ||
    interaction.guild.members.cache.get(interaction.client.user.id);

  if (!botMember) {
    return { ok: false, reason: 'Bot member not found.' };
  }

  const botHighestRole = botMember.roles?.highest;
  const targetHighestRole = targetMember.roles?.highest;

  if (
    botHighestRole &&
    targetHighestRole &&
    targetHighestRole.position >= botHighestRole.position
  ) {
    return {
      ok: false,
      reason: 'I cannot moderate a member with an equal or higher role than mine.',
    };
  }

  return { ok: true, reason: null };
}

function hasModerationPermission(member) {
  if (!member) return false;

  return member.permissions.has([
    PermissionFlagsBits.ModerateMembers,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ManageMessages,
  ]);
}

module.exports = {
  MAX_TIMEOUT_MS,
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
  hasModerationPermission,
};
