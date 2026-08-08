'use strict';

const crypto = require('crypto');
const { AuditLogEvent } = require('discord.js');
const auditStore = require('./auditStore');
const auditRouter = require('./auditRouter');
const { snapshotMember, snapshotUser } = require('./userIntelligence');

const AUDIT_ACTIONS = {
  'role.create': AuditLogEvent.RoleCreate,
  'role.update': AuditLogEvent.RoleUpdate,
  'role.delete': AuditLogEvent.RoleDelete,
  'channel.create': AuditLogEvent.ChannelCreate,
  'channel.update': AuditLogEvent.ChannelUpdate,
  'channel.delete': AuditLogEvent.ChannelDelete,
  'member.kick': AuditLogEvent.MemberKick,
  'member.ban': AuditLogEvent.MemberBanAdd,
  'member.unban': AuditLogEvent.MemberBanRemove,
  'member.prune': AuditLogEvent.MemberPrune,
  'member.update': AuditLogEvent.MemberUpdate,
  'member.nickname': AuditLogEvent.MemberUpdate,
  'member.timeout': AuditLogEvent.MemberUpdate,
  'member.roles': AuditLogEvent.MemberRoleUpdate,
  'invite.create': AuditLogEvent.InviteCreate,
  'invite.delete': AuditLogEvent.InviteDelete,
  'message.delete': AuditLogEvent.MessageDelete,
  'message.bulkDelete': AuditLogEvent.MessageBulkDelete,
  'thread.create': AuditLogEvent.ThreadCreate,
  'thread.update': AuditLogEvent.ThreadUpdate,
  'thread.delete': AuditLogEvent.ThreadDelete,
  'emoji.create': AuditLogEvent.EmojiCreate,
  'emoji.update': AuditLogEvent.EmojiUpdate,
  'emoji.delete': AuditLogEvent.EmojiDelete,
  'sticker.create': AuditLogEvent.StickerCreate,
  'sticker.update': AuditLogEvent.StickerUpdate,
  'sticker.delete': AuditLogEvent.StickerDelete,
  'scheduledEvent.create': AuditLogEvent.GuildScheduledEventCreate,
  'scheduledEvent.update': AuditLogEvent.GuildScheduledEventUpdate,
  'scheduledEvent.delete': AuditLogEvent.GuildScheduledEventDelete,
  'automod.ruleCreate': AuditLogEvent.AutoModerationRuleCreate,
  'automod.ruleUpdate': AuditLogEvent.AutoModerationRuleUpdate,
  'automod.ruleDelete': AuditLogEvent.AutoModerationRuleDelete,
  'guild.update': AuditLogEvent.GuildUpdate,
};

function id() { return `AUD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function plain(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function actor(user) { return user ? { id: user.id, username: user.username || null, globalName: user.globalName || null, bot: Boolean(user.bot) } : null; }

async function correlate(guild, type, targetId, observedAt = Date.now(), options = {}) {
  const action = AUDIT_ACTIONS[type];
  if (!guild || action === undefined) return null;
  const maxAgeMs = Number(options.maxAgeMs || 15000);
  const limit = Math.min(20, Math.max(1, Number(options.limit || 8)));
  const allowTargetless = options.allowTargetless === true;
  try {
    const logs = await guild.fetchAuditLogs({ type: action, limit });
    const match = logs.entries.find((entry) => {
      const age = Math.abs(observedAt - entry.createdTimestamp);
      const auditTargetId = entry.target?.id ? String(entry.target.id) : null;
      const targetMatches = !targetId || auditTargetId === String(targetId) || (allowTargetless && !auditTargetId);
      return age <= maxAgeMs && targetMatches;
    });
    if (!match) return null;
    return {
      actor: actor(match.executor),
      reason: match.reason || null,
      auditLogId: match.id,
      auditCreatedAt: match.createdAt?.toISOString?.() || null,
      extra: plain(match.extra || null),
      changes: plain(match.changes || []),
    };
  } catch {
    return null;
  }
}

function normalize(input = {}) {
  const guild = input.guild || input.member?.guild || input.channel?.guild || null;
  const user = input.user || input.member?.user || null;
  const now = new Date();
  return {
    eventId: input.eventId || id(),
    timestamp: input.timestamp || now.toISOString(),
    type: input.type || 'unknown',
    category: input.category || 'system',
    action: input.action || 'observe',
    title: input.title || input.type || 'Audit Event',
    icon: input.icon || '🧾',
    summary: input.summary || null,
    source: input.source || 'Discord Gateway',
    result: input.result || 'Observed',
    guildId: guild?.id || input.guildId || null,
    guildName: guild?.name || input.guildName || null,
    channel: input.channel ? { id: input.channel.id || null, name: input.channel.name || null, type: input.channel.type ?? null } : null,
    target: plain(input.target || null),
    user: input.member ? snapshotMember(input.member) : snapshotUser(user),
    actor: plain(input.actor || null),
    reason: input.reason || null,
    before: plain(input.before),
    after: plain(input.after),
    metadata: plain(input.metadata || {}),
  };
}

function confirmGoliathOutcome(client, event, correlation) {
  if (!correlation?.auditLogId) return false;
  const botId = String(client?.user?.id || '');
  const actorId = String(correlation.actor?.id || '');
  if (!botId || actorId !== botId) return false;

  event.source = 'Goliath + Discord Audit Log';
  event.result = 'Success';
  event.category = event.category === 'system' ? 'goliath' : event.category;
  event.metadata = {
    ...(event.metadata || {}),
    goliath: {
      confirmed: true,
      botId,
      confirmation: 'Discord Audit Log',
      auditLogId: correlation.auditLogId,
    },
  };
  return true;
}

async function capture(client, input = {}) {
  const event = normalize(input);
  const guild = input.guild || input.member?.guild || input.channel?.guild || client?.guilds?.cache?.get?.(event.guildId) || null;
  let correlation = null;

  if (!event.actor && guild) {
    correlation = await correlate(guild, event.type, event.target?.id || event.user?.id, new Date(event.timestamp).getTime());
    if (correlation) {
      event.actor = correlation.actor;
      event.reason = event.reason || correlation.reason;
      event.metadata.auditLog = correlation;
      event.source = 'Discord Gateway + Audit Log';
    }
  } else if (event.metadata?.auditLog?.auditLogId) {
    correlation = event.metadata.auditLog;
  }

  confirmGoliathOutcome(client, event, correlation);

  try {
    auditStore.appendEvent(event);
  } catch (error) {
    console.warn('[Audit Intelligence] storage failed:', error?.message || error);
  }
  if (guild) await auditRouter.deliver(client, guild, event).catch((error) => console.warn('[Audit Intelligence] delivery failed:', error?.message || error));
  return event;
}

function captureGoliathAction(client, input = {}) {
  return capture(client, { ...input, source: 'Goliath', category: input.category || 'goliath', action: input.action || 'execute' });
}

module.exports = { capture, captureGoliathAction, correlate, normalize, confirmGoliathOutcome };
