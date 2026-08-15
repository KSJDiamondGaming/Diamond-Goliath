const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../guild/guildManager');

const ADMIN_ACTION_LABELS = {
  rolecreate: 'Role Created',
  roledelete: 'Role Deleted',
  roleupdate: 'Role Updated',

  channelcreate: 'Channel Created',
  channeldelete: 'Channel Deleted',
  channelupdate: 'Channel Updated',

  settingsupdate: 'Settings Updated',
  configupdate: 'Configuration Updated',
};

function formatAdminAction(action) {
  const actions = Array.isArray(action) ? action : [action];

  return actions
    .filter(Boolean)
    .map((item) => {
      const key = String(item).toLowerCase();
      return ADMIN_ACTION_LABELS[key] || String(item);
    })
    .join(', ');
}

function formatUser(user, fallback = 'Unknown') {
  if (!user) return fallback;

  const name =
    user.tag ||
    user.username ||
    user.displayName ||
    user.name ||
    fallback;

  return `${name} (${user.id || 'N/A'})`;
}

function normalizeDetails(details = []) {
  if (!Array.isArray(details)) return [];

  return details
    .filter((detail) => detail?.name && detail?.value !== undefined && detail?.value !== null)
    .map((detail) => ({
      name: String(detail.name).slice(0, 256),
      value: String(detail.value).slice(0, 1024),
      inline: detail.inline ?? false,
    }));
}

async function resolveLogChannel(guild) {
  const logChannelId = guildManager.getLogChannelId(
    guild.id,
    'admin',
    'general'
  );

  if (!logChannelId) return null;

  const channel =
    guild.channels.cache.get(logChannelId) ||
    (await guild.channels.fetch(logChannelId).catch(() => null));

  if (!channel || !channel.isTextBased()) return null;

  return channel;
}

async function logAdminAction({
  guild,
  action,
  executor = null,
  target = null,
  reason = 'No reason provided',
  details = [],
  color = '#5865F2',
  title = null,
}) {
  if (!guild?.id) return false;

  try {
    if (!guildManager.isLogEventEnabled(guild.id, 'adminActions')) {
      return false;
    }

    const channel = await resolveLogChannel(guild);
    if (!channel) return false;

    const fields = [];

    if (executor) {
      fields.push({
        name: 'Executor',
        value: formatUser(executor),
        inline: false,
      });
    }

    if (target) {
      fields.push({
        name: 'Target',
        value: formatUser(target),
        inline: false,
      });
    }

    if (reason) {
      fields.push({
        name: 'Reason',
        value: String(reason).slice(0, 1024),
        inline: false,
      });
    }

    fields.push(...normalizeDetails(details));

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(title || `⚙️ ${formatAdminAction(action) || 'Admin Action'}`)
      .setTimestamp();

    if (fields.length) {
      embed.addFields(fields);
    }

    if (executor && typeof executor.displayAvatarURL === 'function') {
      embed.setThumbnail(executor.displayAvatarURL({ dynamic: true }));
    }

    await channel.send({ embeds: [embed] });
    return true;
  } catch (error) {
    console.error(`Failed to log admin action in guild ${guild?.id || 'unknown'}:`, error);
    return false;
  }
}

module.exports = logAdminAction;
