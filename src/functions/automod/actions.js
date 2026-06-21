const { shouldBlockOwnerDestructiveAction } = require('../../security/testModeGuard');

const VALID_PUNISHMENTS = ['dm', 'delete', 'warn', 'timeout', 'kick', 'ban'];

function normalizePunishments(value, fallback = ['delete']) {
  const base = Array.isArray(value) ? value : value ? [value] : fallback;

  const cleaned = base
    .map((entry) => String(entry).trim().toLowerCase())
    .filter((entry) => VALID_PUNISHMENTS.includes(entry));

  return cleaned.length ? [...new Set(cleaned)] : [...fallback];
}

function shouldBlockDestructiveAction(message, punishment) {
  return shouldBlockOwnerDestructiveAction({
    guild: message?.guild,
    member: message?.member,
    user: message?.author,
    action: punishment,
  });
}

async function safeDelete(message) {
  try {
    if (message.deletable) {
      await message.delete();
      return true;
    }
  } catch (error) {
    console.error('❌ Failed to delete automod message:', error);
  }
  return false;
}

async function safeTimeout(member, durationMs, reason) {
  try {
    if (!member || !member.moderatable) return false;
    await member.timeout(durationMs, reason);
    return true;
  } catch (error) {
    console.error('❌ Failed to timeout automod member:', error);
    return false;
  }
}

async function safeKick(member, reason) {
  try {
    if (!member || !member.kickable) return false;
    await member.kick(reason);
    return true;
  } catch (error) {
    console.error('❌ Failed to kick automod member:', error);
    return false;
  }
}

async function safeBan(member, reason) {
  try {
    if (!member || !member.bannable) return false;
    await member.ban({ reason });
    return true;
  } catch (error) {
    console.error('❌ Failed to ban automod member:', error);
    return false;
  }
}

async function safeWarnChannel(message, text) {
  try {
    const sent = await message.channel.send({ content: text });

    setTimeout(() => {
      sent.delete().catch(() => {});
    }, 5000);

    return true;
  } catch (error) {
    console.error('❌ Failed to send automod warning message:', error);
    return false;
  }
}

async function safeWarnDM(user, text) {
  try {
    await user.send({ content: text });
    return true;
  } catch (error) {
    console.error('❌ Failed to send automod DM warning:', error);
    return false;
  }
}

async function sendWarningNotice(message, reason, config) {
  const text = `⚠️ Your message was blocked in **${
    message.guild?.name || 'this server'
  }**: ${reason}`;

  if (config?.dmWarnings) {
    const sentDM = await safeWarnDM(message.author, text);
    if (sentDM) return 'dm';
  }

  const sentChannel = await safeWarnChannel(
    message,
    `⚠️ ${message.author}, your message was blocked: ${reason}`
  );

  return sentChannel ? 'channel' : 'none';
}

async function applyPunishment(
  message,
  type,
  reason,
  timeoutMinutes = 10,
  config = null
) {
  const punishments = normalizePunishments(type);
  const timeoutMs = Number(timeoutMinutes || 10) * 60 * 1000;

  const applied = [];
  let deleted = false;

  for (const punishment of punishments) {
    if (shouldBlockDestructiveAction(message, punishment)) {
      console.log(
        `[TEST MODE] Automod ${punishment} blocked for protected owner ${message.author?.tag || message.author?.id || 'unknown'} in guild ${message.guild?.id || 'unknown'}`
      );
      applied.push(`blocked-${punishment}`);
      continue;
    }

    switch (punishment) {

      // 👇 NEW: DM SUPPORT (handled in service.js)
      case 'dm': {
        applied.push('dm');
        break;
      }

      case 'delete': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        applied.push('delete');
        break;
      }

      case 'warn': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const warningMode = await sendWarningNotice(message, reason, config);
        applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        break;
      }

      case 'timeout': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const timedOut = await safeTimeout(
          message.member,
          timeoutMs,
          `Automod: ${reason}`
        );

        if (timedOut) {
          applied.push('timeout');
        } else {
          const warningMode = await sendWarningNotice(message, reason, config);
          applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        }

        break;
      }

      case 'kick': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const kicked = await safeKick(message.member, `Automod: ${reason}`);

        if (kicked) {
          applied.push('kick');
        } else {
          const warningMode = await sendWarningNotice(message, reason, config);
          applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        }

        break;
      }

      case 'ban': {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        const banned = await safeBan(message.member, `Automod: ${reason}`);

        if (banned) {
          applied.push('ban');
        } else {
          const warningMode = await sendWarningNotice(message, reason, config);
          applied.push(warningMode === 'dm' ? 'warn-dm' : 'warn');
        }

        break;
      }

      default: {
        if (!deleted) {
          const didDelete = await safeDelete(message);
          if (didDelete) deleted = true;
        }

        applied.push('delete');
        break;
      }
    }
  }

  return [...new Set(applied)].join(', ');
}

module.exports = {
  VALID_PUNISHMENTS,
  normalizePunishments,
  applyPunishment,
};
