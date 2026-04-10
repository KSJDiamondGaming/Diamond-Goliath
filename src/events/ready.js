const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,

  async execute(client) {
    console.log(`Logged in as ${client.user.tag}`);

    client.user.setPresence({
      activities: [
        {
          name: 'your server',
          type: ActivityType.Watching,
        },
      ],
      status: 'online',
    });
  },
};