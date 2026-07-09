const { sendAutoModDM } = require('./automodDm');
const { shouldBlockOwnerDestructiveAction } = require('../security/testModeGuard');

const VALID_PUNISHMENTS = ['dm', 'delete', 'warn', 'timeout', 'kick', 'ban'];

const ACTION_LABELS = {
  dm: 'DM user',
  delete: 'Delete message',
  warn: 'Warn user',
  timeout: 'Timeout user',
  kick: 'Kick user',
  ban: 'Ban user',
};

function normalizePunishments(value, fallback = ['delete']) {
  const base = Array.isArray(value) ? value : value ? [value] : fallback;

  const cleaned = base
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter((entry) => VALID_PUNISHMENTS.includes(entry));

  return cleaned.length ? [...new Set(cleaned)] : [...fallback];
}

function getContext(input = {}) {
  const message = input.message || null;
  const member = input.member || message?.member || null;
  const user = input.user || member?.user || message?.author || null;
  const guild = input.guild || member?.guild || message?.guild || null;
  const channel = input.channel || message?.channel || null;

  return {
    message,
    member,
    user,
    guild,
    channel,
  };
}

function formatActionList(punishments = []) {
  return punishments
    .map((item) => ACTION_LABELS[item] || item)
    .join(', ');
}

function shouldBlockDestructiveAction(context, punishment) {
  return shouldBlockOwnerDestructiveAction({
    guild: context.guild,
    member: context.member,
    user: context.user,
    action: punishment,
  });
}

async function safeDelete(message) {
  try {
    if (!message?.deletable) return false;

    await message.delete();
    return true;
  } catch (error) {
    console.error('❌ Punishment engine delete failed:', error);
    return false;
  }
}

async function safeTimeout(member, durationMs, reason) {
  try {
    if (!member?.moderatable) return false;

    await member.timeout(durationMs, reason);
    return true;
  } catch (error) {
    console.error('❌ Punishment engine timeout failed:', error);
    return false;
  }
}

async function safeKick(member, reason) {
  try {
    if (!member?.kickable) return false;

    await member.kick(reason);
    return true;
  } catch (error) {
    console.error('❌ Punishment engine kick failed:', error);
    return false;
  }
}

async function safeBan(member, reason, deleteDays = 0) {
  try {
    if (!member?.bannable) return false;

    await member.ban({
      deleteMessageSeconds: Number(deleteDays || 0) * 24 * 60 * 60,
      reason,
    });

    return true;
  } catch (error) {
    console.error('❌ Punishment engine ban failed:', error);
    return false;
  }
}

async function safeWarnChannel(message, reason) {
  try {
    if (!message?.channel || !message?.author) return false;

    const sent = await message.channel.send({
      content: `⚠️ ${message.author}, your message was blocked: ${reason}`,
    });

    setTimeout(() => {
      sent.delete().catch(() => {});
    }, 5000);

    return true;
  } catch (error) {
    console.error('❌ Punishment engine channel warn failed:', error);
    return false;
  }
}

async function applyPunishmentEngine(input = {}, options = {}) {
  const {
    punishments,
    rule = 'Moderation',
    reason = 'No reason provided',
    timeoutMinutes = 10,
    durationMs = null,
    deleteDays = 0,
    moderator = null,
    source = 'moderation',
    messageContent = null,
  } = options;

  const context = getContext(input);
  const list = normalizePunishments(punishments);

  const applied = [];
  const failed = [];
  const blockedActions = [];

  let deleted = false;
  let dmSent = false;

  const finalReason = moderator?.tag
    ? `${reason} | By ${moderator.tag}`
    : reason;

  const timeoutDurationMs =
    Number(durationMs || 0) > 0
      ? Number(durationMs)
      : Number(timeoutMinutes || 10) * 60 * 1000;

  if (list.includes('dm')) {
    if (context.user && context.guild) {
      dmSent = await sendAutoModDM(context.user, context.guild, {
        rule,
        reason,
        action: formatActionList(list),
        messageContent:
          messageContent ||
          context.message?.content ||
          `Moderation action: ${formatActionList(list)}`,
        channel: context.channel,
      });
    }

    if (dmSent) applied.push('dm');
    else failed.push('dm');
  }

  for (const punishment of list) {
    if (punishment === 'dm') continue;

    if (shouldBlockDestructiveAction(context, punishment)) {
      console.log(
        `[TEST MODE] ${punishment} blocked for protected owner ${context.user?.tag || context.member?.id || 'unknown'} in guild ${context.guild?.id || 'unknown'}`
      );

      applied.push(punishment);
      blockedActions.push(punishment);
      continue;
    }

    if (punishment === 'delete') {
      const ok = await safeDelete(context.message);

      if (ok) {
        deleted = true;
        applied.push('delete');
      } else {
        failed.push('delete');
      }

      continue;
    }

    if (punishment === 'warn') {
      const ok = context.message
        ? await safeWarnChannel(context.message, reason)
        : true;

      if (ok) applied.push('warn');
      else failed.push('warn');

      continue;
    }

    if (punishment === 'timeout') {
      const ok = await safeTimeout(
        context.member,
        timeoutDurationMs,
        `${source === 'automod' ? 'AutoMod' : 'Moderation'}: ${finalReason}`
      );

      if (ok) applied.push('timeout');
      else failed.push('timeout');

      continue;
    }

    if (punishment === 'kick') {
      const ok = await safeKick(
        context.member,
        `${source === 'automod' ? 'AutoMod' : 'Moderation'}: ${finalReason}`
      );

      if (ok) applied.push('kick');
      else failed.push('kick');

      continue;
    }

    if (punishment === 'ban') {
      const ok = await safeBan(
        context.member,
        `${source === 'automod' ? 'AutoMod' : 'Moderation'}: ${finalReason}`,
        deleteDays
      );

      if (ok) applied.push('ban');
      else failed.push('ban');
    }
  }

  const uniqueApplied = [...new Set(applied)];
  const uniqueFailed = [...new Set(failed)];
  const uniqueBlockedActions = [...new Set(blockedActions)];

  return {
    ok: uniqueFailed.length === 0,
    punishments: list,
    applied: uniqueApplied,
    failed: uniqueFailed,
    blocked: uniqueBlockedActions.length > 0,
    testMode: uniqueBlockedActions.length > 0,
    blockedActions: uniqueBlockedActions,
    dmSent,
    deleted,
    actionText: uniqueApplied.length ? uniqueApplied.join(', ') : 'none',
    failedText: uniqueFailed.length ? uniqueFailed.join(', ') : 'none',
  };
}

module.exports = {
  VALID_PUNISHMENTS,
  ACTION_LABELS,
  normalizePunishments,
  applyPunishmentEngine,
};
