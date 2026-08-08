'use strict';

const crypto = require('crypto');
const { AuditLogEvent, Events } = require('discord.js');
const auditStore = require('./auditStore');
const auditRouter = require('./auditRouter');
const { snapshotMember, snapshotUser } = require('./userIntelligence');

const outputCaptureWired = new WeakSet();
const recentOperations = new Map();
const OPERATION_WINDOW_MS = 15000;
const OPERATION_MAX_PER_GUILD = 50;

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
function operationId() { return `OP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function plain(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }
function actor(user) { return user ? { id: user.id, username: user.username || null, globalName: user.globalName || null, bot: Boolean(user.bot) } : null; }

function operationReferences(metadata = {}) {
  const refs = new Set();
  const visit = (value) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') return Object.values(value).forEach(visit);
    const text = String(value);
    if (/^\d{15,22}$/.test(text)) refs.add(text);
  };
  visit(metadata.options);
  visit(metadata.values);
  return [...refs];
}

function pruneOperations(guildId, now = Date.now()) {
  const key = String(guildId || '');
  if (!key) return [];
  const active = (recentOperations.get(key) || [])
    .filter((item) => now - item.createdAt <= OPERATION_WINDOW_MS)
    .slice(-OPERATION_MAX_PER_GUILD);
  if (active.length) recentOperations.set(key, active);
  else recentOperations.delete(key);
  return active;
}

function registerOperation(event) {
  if (!event?.guildId || !String(event.type || '').startsWith('goliath.interaction.')) return null;
  const op = {
    operationId: operationId(),
    createdAt: new Date(event.timestamp).getTime() || Date.now(),
    guildId: String(event.guildId),
    channelId: event.channel?.id ? String(event.channel.id) : null,
    actorId: event.actor?.id || event.user?.id || null,
    triggerEventId: event.eventId,
    triggerType: event.type,
    triggerLabel: event.target?.label || null,
    references: operationReferences(event.metadata),
  };
  const active = pruneOperations(op.guildId, op.createdAt);
  active.push(op);
  recentOperations.set(op.guildId, active.slice(-OPERATION_MAX_PER_GUILD));
  event.metadata = {
    ...(event.metadata || {}),
    operation: {
      operationId: op.operationId,
      role: 'trigger',
      confidence: 'direct',
      evidence: 'Goliath interaction created the operation',
    },
  };
  return op;
}

function findOperationForOutput(event) {
  if (!event?.guildId) return null;
  const now = new Date(event.timestamp).getTime() || Date.now();
  const channelId = event.channel?.id ? String(event.channel.id) : null;
  const candidates = pruneOperations(event.guildId, now)
    .filter((item) => now >= item.createdAt && now - item.createdAt <= 10000)
    .filter((item) => !channelId || !item.channelId || item.channelId === channelId)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!candidates.length) return null;
  const exactChannel = candidates.find((item) => channelId && item.channelId === channelId);
  const op = exactChannel || (candidates.length === 1 ? candidates[0] : null);
  if (!op) return null;
  return {
    op,
    confidence: exactChannel ? 'high' : 'medium',
    evidence: exactChannel ? 'Same guild/channel within 10 seconds' : 'Single recent operation in guild',
  };
}

function findOperationForConfirmedOutcome(event) {
  if (!event?.guildId) return null;
  const now = new Date(event.timestamp).getTime() || Date.now();
  const targetId = event.target?.id || event.user?.id || null;
  const candidates = pruneOperations(event.guildId, now)
    .filter((item) => now >= item.createdAt && now - item.createdAt <= 8000)
    .sort((a, b) => b.createdAt - a.createdAt);
  if (!candidates.length) return null;

  if (targetId) {
    const targetMatches = candidates.filter((item) => item.references.includes(String(targetId)));
    if (targetMatches.length === 1) {
      return { op: targetMatches[0], confidence: 'high', evidence: 'Interaction target matches confirmed Discord outcome target' };
    }
  }

  if (candidates.length === 1) {
    return { op: candidates[0], confidence: 'medium', evidence: 'Single Goliath operation within 8 seconds of confirmed outcome' };
  }
  return null;
}

function attachOperation(event, match, role) {
  if (!event || !match?.op) return false;
  event.metadata = {
    ...(event.metadata || {}),
    operation: {
      operationId: match.op.operationId,
      role,
      confidence: match.confidence,
      evidence: match.evidence,
      triggerEventId: match.op.triggerEventId,
      triggerType: match.op.triggerType,
      triggerLabel: match.op.triggerLabel,
      triggeredBy: match.op.actorId,
    },
  };
  return true;
}

function outputMessageState(message) {
  if (!message) return null;
  return {
    id: message.id || null,
    channelId: message.channelId || null,
    content: message.content || null,
    createdAt: message.createdAt?.toISOString?.() || null,
    editedAt: message.editedAt?.toISOString?.() || null,
    pinned: Boolean(message.pinned),
    webhookId: message.webhookId || null,
    interaction: message.interactionMetadata ? plain(message.interactionMetadata) : null,
    embeds: (message.embeds || []).slice(0, 10).map((embed) => {
      try { return typeof embed?.toJSON === 'function' ? embed.toJSON() : plain(embed); }
      catch { return null; }
    }).filter(Boolean),
    attachments: [...(message.attachments?.values?.() || [])].slice(0, 25).map((item) => ({
      id: item.id || null,
      name: item.name || null,
      contentType: item.contentType || null,
      description: item.description || null,
      size: item.size ?? null,
      url: item.url || null,
    })),
    components: (message.components || []).slice(0, 5).map((row) => {
      try { return typeof row?.toJSON === 'function' ? row.toJSON() : plain(row); }
      catch { return null; }
    }).filter(Boolean),
    reference: message.reference ? plain(message.reference) : null,
  };
}

function ensureGoliathOutputCapture(client) {
  if (!client || outputCaptureWired.has(client)) return false;
  outputCaptureWired.add(client);

  client.on(Events.MessageCreate, (message) => {
    try {
      if (!message?.guild || !client.user?.id) return;
      if (String(message.guild.id) === String(auditRouter.getOwnerAuditGuildId() || '')) return;
      if (String(message.author?.id || '') !== String(client.user.id)) return;

      const payload = outputMessageState(message);
      captureGoliathAction(client, {
        type: 'goliath.output.message',
        category: 'goliath',
        action: 'send',
        title: 'Goliath Output Sent',
        icon: '📤',
        guild: message.guild,
        channel: message.channel || null,
        actor: actor(client.user),
        target: { id: message.id, label: `Message ${message.id}` },
        summary: `Goliath sent a message in <#${message.channelId}>.`,
        result: 'Success',
        after: payload,
        metadata: {
          outputType: 'message',
          embedCount: payload?.embeds?.length || 0,
          attachmentCount: payload?.attachments?.length || 0,
          componentRowCount: payload?.components?.length || 0,
        },
      }).catch((error) => console.warn('[Audit Intelligence] Goliath output capture failed:', error?.message || error));
    } catch (error) {
      console.warn('[Audit Intelligence] Goliath output listener failed:', error?.message || error);
    }
  });

  return true;
}

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
  ensureGoliathOutputCapture(client);
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

  const confirmedGoliath = confirmGoliathOutcome(client, event, correlation);

  if (String(event.type || '').startsWith('goliath.interaction.')) {
    registerOperation(event);
  } else if (event.type === 'goliath.output.message') {
    attachOperation(event, findOperationForOutput(event), 'output');
  } else if (confirmedGoliath) {
    attachOperation(event, findOperationForConfirmedOutcome(event), 'outcome');
  }

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

module.exports = {
  capture,
  captureGoliathAction,
  correlate,
  normalize,
  confirmGoliathOutcome,
  ensureGoliathOutputCapture,
  outputMessageState,
  registerOperation,
  findOperationForOutput,
  findOperationForConfirmedOutcome,
};
