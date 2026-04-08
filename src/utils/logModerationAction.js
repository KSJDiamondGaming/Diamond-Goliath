const fs = require('fs');
const path = require('path');
const buildEmbed = require('./buildEmbed');
const { createCase } = require('./cases/createCase');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

module.exports = async function logModerationAction({
  guild,
  action,
  target,
  moderator,
  reason,
  duration = null,
  evidence = null,
}) {
  try {
    const logChannelsPath = path.join(__dirname, '..', 'data', 'logChannels.json');
    const casesPath = path.join(__dirname, '..', 'data', 'modCases.json');
    const caseDetailsPath = path.join(__dirname, '..', 'data', 'modCaseDetails.json');

    const logChannels = readJson(logChannelsPath);
    const modCases = readJson(casesPath);
    const modCaseDetails = readJson(caseDetailsPath);

    const channelId = logChannels[guild.id];
    if (!channelId) return;

    const logChannel = guild.channels.cache.get(channelId);
    if (!logChannel) return;

    if (!modCases[guild.id]) {
      modCases[guild.id] = {
        lastCaseNumber: 0,
      };
    }

    if (!modCaseDetails[guild.id]) {
      modCaseDetails[guild.id] = {};
    }

    modCases[guild.id].lastCaseNumber += 1;
    const caseNumber = modCases[guild.id].lastCaseNumber;
    const timestamp = Date.now();

    modCaseDetails[guild.id][caseNumber] = {
      caseNumber,
      action,
      targetId: target.id,
      targetTag: target.tag,
      moderatorId: moderator.id,
      moderatorTag: moderator.tag,
      reason: reason || 'No reason provided',
      duration: duration || null,
      evidence: evidence || null,
      createdAt: timestamp,
      notes: [],
    };

    writeJson(casesPath, modCases);
    writeJson(caseDetailsPath, modCaseDetails);

    const createdCase = createCase({
      guild,
      action,
      target,
      moderator,
      reason: reason || 'No reason provided.',
      duration,
      evidence,
      active: !['Unban', 'ClearWarnings'].includes(action),
      expiresAt: null,
    });

    const styles = {
      Ban: {
        color: '#ff3b30',
        title: '🔨 User Banned',
        description: '**{targetTag}** has been banned from the server.',
      },
      Kick: {
        color: '#ff9500',
        title: '🥾 User Kicked',
        description: '**{targetTag}** has been kicked from the server.',
      },
      Timeout: {
        color: '#ffcc00',
        title: '⏳ User Timed Out',
        description: '**{targetTag}** has been timed out.',
      },
      Unban: {
        color: '#34c759',
        title: '✅ User Unbanned',
        description: '**{targetTag}** has been unbanned.',
      },
      Warn: {
        color: '#5ac8fa',
        title: '⚠️ User Warned',
        description: '**{targetTag}** has received a warning.',
      },
      ClearWarnings: {
        color: '#8e8e93',
        title: '🧹 Warnings Cleared',
        description: '**{targetTag}** had their warnings cleared.',
      },
    };

    const style = styles[action] || {
      color: '#2b2d31',
      title: `📋 ${action} Log`,
      description: 'A moderation action has been performed.',
    };

    const fields = [
      {
        name: '📁 Case',
        value: `#${caseNumber}`,
        inline: true,
      },
      {
        name: '🗂️ Persistent Case',
        value: `#${createdCase.caseNumber}`,
        inline: true,
      },
      {
        name: '📌 Action',
        value: action,
        inline: true,
      },
      {
        name: '🕒 Time',
        value: `<t:${Math.floor(timestamp / 1000)}:F>`,
        inline: true,
      },
      {
        name: '👤 Target',
        value: `${target.tag}\n\`${target.id}\``,
        inline: true,
      },
      {
        name: '🛡️ Moderator',
        value: `${moderator.tag}\n\`${moderator.id}\``,
        inline: true,
      },
      {
        name: '📝 Reason',
        value: reason || 'No reason provided',
        inline: false,
      },
    ];

    if (duration) {
      fields.push({
        name: '⏱️ Duration',
        value: duration,
        inline: true,
      });
    }

    if (evidence) {
      fields.push({
        name: '📎 Evidence',
        value: evidence,
        inline: false,
      });
    }

    const embed = buildEmbed(guild.id, {
      title: `${style.title} • Case #${caseNumber}`,
      description: style.description,
      color: style.color,
      thumbnail: target.displayAvatarURL
        ? target.displayAvatarURL({ forceStatic: false })
        : null,
      placeholders: {
        targetTag: target.tag,
      },
      fields,
    });

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Failed to send moderation log:', error);
  }
};