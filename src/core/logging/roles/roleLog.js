const { EmbedBuilder } = require('discord.js');
const guildManager = require('../../guild/guildManager');

function getLogChannel(guild) {
  const id = guildManager.getLogChannelId(guild.id, 'moderation') 
    || guildManager.getLogChannelId(guild.id, 'general');

  if (!id) return null;

  return guild.channels.cache.get(id) || null;
}

/* ---------------- CREATE ---------------- */

async function handleRoleCreate(role) {
  try {
    const guild = role.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'roleCreate')) return;

    const channel = getLogChannel(guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor('#57F287')
      .setTitle('🎭 Role Created')
      .addFields(
        { name: 'Role', value: `${role}`, inline: true },
        { name: 'Role ID', value: `\`${role.id}\``, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[roleLog] create error:', err);
  }
}

/* ---------------- DELETE ---------------- */

async function handleRoleDelete(role) {
  try {
    const guild = role.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'roleDelete')) return;

    const channel = getLogChannel(guild);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor('#ED4245')
      .setTitle('🗑️ Role Deleted')
      .addFields(
        { name: 'Role Name', value: role.name, inline: true },
        { name: 'Role ID', value: `\`${role.id}\``, inline: true }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[roleLog] delete error:', err);
  }
}

/* ---------------- UPDATE ---------------- */

async function handleRoleUpdate(oldRole, newRole) {
  try {
    const guild = newRole.guild;

    if (!guildManager.isLogEventEnabled(guild.id, 'roleUpdate')) return;

    const channel = getLogChannel(guild);
    if (!channel) return;

    if (oldRole.name === newRole.name && oldRole.color === newRole.color) return;

    const embed = new EmbedBuilder()
      .setColor('#5865F2')
      .setTitle('✏️ Role Updated')
      .addFields(
        { name: 'Role', value: `${newRole}`, inline: true },
        {
          name: 'Changes',
          value: [
            oldRole.name !== newRole.name
              ? `Name: \`${oldRole.name}\` → \`${newRole.name}\``
              : null,
            oldRole.color !== newRole.color
              ? `Color changed`
              : null,
          ]
            .filter(Boolean)
            .join('\n') || 'Minor update',
        }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[roleLog] update error:', err);
  }
}

module.exports = {
  handleRoleCreate,
  handleRoleDelete,
  handleRoleUpdate,
};
