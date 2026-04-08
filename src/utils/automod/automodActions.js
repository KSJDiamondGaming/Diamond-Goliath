const logModerationAction = require('../logModerationAction');
const { logAutomodEvent } = require('./automodLogger');
const { formatDuration, canActOnMember } = require('./automodHelpers');
const { getGuildAutoModConfig } = require('../automodStore');

function getBotUser(client) {
  return client?.user || {
    id: '0',
    tag: 'AutoMod',
  };
}

async function safeDeleteMessage(message) {
  try {
    if (!message?.deletable) return false;
    await message.delete().catch(() => null);
    return true;
  } catch {
    return false;
  }
}

async function executeWarnAction(message, reason) {
  try {
    await message.author.send(
      `You were warned in **${message.guild.name}**.\nReason: **${reason}**`
    ).catch(() => null);
  } catch {}
}

async function executeTimeoutAction(message, member, reason, timeoutMs) {
  if (!member?.moderatable) {
    return {
      success: false,
      actionTaken: 'timeout_failed',
      extraReason: 'Member is not moderatable.',
    };
  }

  const safeTimeoutMs = Math.min(
    Math.max(Number(timeoutMs || 10 * 60 * 1000), 60 * 1000),
    28 * 24 * 60 * 60 * 1000
  );

  await member.timeout(safeTimeoutMs, reason);

  return {
    success: true,
    actionTaken: `timeout (${formatDuration(safeTimeoutMs)})`,
    durationLabel: formatDuration(safeTimeoutMs),
    timeoutMs: safeTimeoutMs,
  };
}

async function executeKickAction(member, reason) {
  if (!member?.kickable) {
    return {
      success: false,
      actionTaken: 'kick_failed',
      extraReason: 'Member is not kickable.',
    };
  }

  await member.kick(reason);

  return {
    success: true,
    actionTaken: 'kick',
  };
}

async function executeBanAction(guild, user, reason) {
  const banResult = await guild.members.ban(user.id, {
    reason,
    deleteMessageSeconds: 0,
  }).catch(() => null);

  if (!banResult) {
    return {
      success: false,
      actionTaken: 'ban_failed',
      extraReason: 'Member could not be banned.',
    };
  }

  return {
    success: true,
    actionTaken: 'ban',
  };
}

async function executeAutomodAction(message, result) {
  const guild = message.guild;
  const member = message.member;
  const botMember = guild.members.me;
  const botUser = getBotUser(message.client);
  const config = getGuildAutoModConfig(guild.id);

  const enrichedResult = {
    ...result,
    configSnapshot: config,
  };

  if (!guild || !member) {
    await logAutomodEvent({
      guild,
      message,
      result: enrichedResult,
      actionTaken: 'skipped',
    });
    return;
  }

  const reason = `[AutoMod: ${result.ruleName}] ${result.reason}`;
  let deleted = false;
  let actionTaken = 'none';
  let moderationLogAction = null;
  let moderationDuration = null;

  if (result.deleteMessage) {
    deleted = await safeDeleteMessage(message);
  }

  const canModerate =
    botMember &&
    canActOnMember(botMember, member, guild.ownerId) &&
    member.id !== botUser.id &&
    member.id !== guild.ownerId;

  switch (String(result.punishment || 'delete').toLowerCase()) {
    case 'delete': {
      actionTaken = deleted ? 'delete' : 'delete_failed';
      break;
    }

    case 'warn': {
      await executeWarnAction(message, reason);
      actionTaken = deleted ? 'delete + warn' : 'warn';
      moderationLogAction = 'Warn';
      break;
    }

    case 'timeout': {
      if (!canModerate) {
        actionTaken = deleted ? 'delete + timeout_failed' : 'timeout_failed';
        break;
      }

      const timeoutResult = await executeTimeoutAction(
        message,
        member,
        reason,
        result.timeoutMs
      );

      actionTaken = deleted
        ? `delete + ${timeoutResult.actionTaken}`
        : timeoutResult.actionTaken;

      if (timeoutResult.success) {
        moderationLogAction = 'Timeout';
        moderationDuration = timeoutResult.durationLabel;
      }
      break;
    }

    case 'kick': {
      if (!canModerate) {
        actionTaken = deleted ? 'delete + kick_failed' : 'kick_failed';
        break;
      }

      const kickResult = await executeKickAction(member, reason);
      actionTaken = deleted ? `delete + ${kickResult.actionTaken}` : kickResult.actionTaken;

      if (kickResult.success) {
        moderationLogAction = 'Kick';
      }
      break;
    }

    case 'ban': {
      if (!canModerate) {
        actionTaken = deleted ? 'delete + ban_failed' : 'ban_failed';
        break;
      }

      const banResult = await executeBanAction(guild, message.author, reason);
      actionTaken = deleted ? `delete + ${banResult.actionTaken}` : banResult.actionTaken;

      if (banResult.success) {
        moderationLogAction = 'Ban';
      }
      break;
    }

    default: {
      actionTaken = deleted ? 'delete' : 'none';
      break;
    }
  }

  if (moderationLogAction) {
    await logModerationAction({
      guild,
      action: moderationLogAction,
      target: message.author,
      moderator: botUser,
      reason,
      duration: moderationDuration,
      evidence: message.url || null,
    });
  }

  await logAutomodEvent({
    guild,
    message,
    result: enrichedResult,
    actionTaken,
  });
}

module.exports = {
  executeAutomodAction,
};