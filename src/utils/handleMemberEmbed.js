const fs = require('fs');
const path = require('path');
const buildEmbed = require('./buildEmbed');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, 'utf8');
  return raw ? JSON.parse(raw) : {};
}

module.exports = async function handleMemberEmbed(member, type) {
  try {
    const basePath = path.join(__dirname, '..', 'data');

    const channels = readJson(path.join(basePath, `${type}Channels.json`));
    const messages = readJson(path.join(basePath, `${type}Messages.json`));
    const titles = readJson(path.join(basePath, `${type}Titles.json`));

    const channelId = channels[member.guild.id];
    if (!channelId) return;

    const channel = member.guild.channels.cache.get(channelId);
    if (!channel) return;

    const defaults = {
      welcome: {
        title: '👋 Welcome!',
        message: 'Welcome {user} to **{server}**! You are member **#{membercount}**.',
      },
      leave: {
        title: '👋 Goodbye!',
        message: '{username} has left **{server}**. We now have **{membercount}** members.',
      },
    };

    const title = titles[member.guild.id] || defaults[type].title;
    const message = messages[member.guild.id] || defaults[type].message;

    const embed = buildEmbed(member.guild.id, {
      title,
      description: message,
      thumbnail: member.user.displayAvatarURL({ forceStatic: false }),
      placeholders: {
        user: type === 'welcome' ? `${member}` : member.user.tag,
        username: member.user.username,
        server: member.guild.name,
        membercount: member.guild.memberCount,
      },
      fields: [
        {
          name: 'Member Count',
          value: '{membercount}',
          inline: true,
        },
      ],
    });

    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error(`${type} embed error:`, error);
  }
};