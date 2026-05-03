const { buildPreviewEmbed, TEMPLATES } = require('../functions/embed/embedPanel');
const guildManager = require('../guild/guildManager');

async function sendMemberEmbed(member, type) {
  try {
    const guild = member.guild;

    const preset =
      typeof guildManager.getEmbedDefaultPreset === 'function'
        ? guildManager.getEmbedDefaultPreset(guild.id, type)
        : null;

    const messageData = preset || TEMPLATES[type];

    if (!messageData) return;

    const channelId =
      messageData.channelId ||
      guildManager.getGuildSection(guild.id, type, {})?.channelId ||
      null;

    if (!channelId) return;

    const channel =
      guild.channels.cache.get(channelId) ||
      (await guild.channels.fetch(channelId).catch(() => null));

    if (!channel?.isTextBased()) return;

    const fakeInteraction = {
      guild,
      guildId: guild.id,
      user: member.user,
      member,
    };

    await channel.send({
      content: messageData.allowUserPing ? `<@${member.user.id}>` : '',
      embeds: [buildPreviewEmbed(messageData, fakeInteraction)],
      allowedMentions: messageData.allowUserPing
        ? { users: [member.user.id], roles: [], repliedUser: false }
        : { parse: [], repliedUser: false },
    });
  } catch (error) {
    console.error(`[memberJoinLeave] Failed to send ${type} message:`, error);
  }
}

module.exports = [
  {
    name: 'guildMemberAdd',

    async execute(member) {
      await sendMemberEmbed(member, 'welcome');
    },
  },

  {
    name: 'guildMemberRemove',

    async execute(member) {
      await sendMemberEmbed(member, 'leave');
    },
  },
];