const { ActivityType } = require('discord.js');

const STATUS_INTERVAL_MS = 60_000;

function getStatuses(client) {
  const mode = client.botMode || process.env.BOT_MODE?.toUpperCase() || 'DEV';

  if (mode === 'DEV') {
    return {
      presence: 'online',
      activities: [
        { name: '🛠️ KSJ Development', type: ActivityType.Watching },
        { name: '🤖 Goliath DEV', type: ActivityType.Playing },
        { name: '⚠️ Experimental Features', type: ActivityType.Watching },
        { name: '🔧 Testing New Modules', type: ActivityType.Competing },
      ],
    };
  }

  if (mode === 'BETA') {
    return {
      presence: 'online',
      activities: [
        { name: '🧪 Beta Testing Environment', type: ActivityType.Watching },
        { name: '🚧 Upcoming Features', type: ActivityType.Playing },
        { name: '🔍 Beta Feedback', type: ActivityType.Watching },
        { name: '⚡ Stability Testing', type: ActivityType.Competing },
      ],
    };
  }

  return {
    presence: 'online',
    activities: [
      {
        name: `🛡️ Protecting ${client.guilds.cache.size} Servers`,
        type: ActivityType.Watching,
      },
      { name: '🎟️ Managing Tickets', type: ActivityType.Playing },
      { name: '📋 Processing Forms', type: ActivityType.Watching },
      { name: '🔒 Monitoring Security', type: ActivityType.Watching },
      { name: '🌐 Translating Communities', type: ActivityType.Competing },
      { name: '⚡ Powered by KSJ Digital', type: ActivityType.Watching },
      { name: '/help', type: ActivityType.Listening },
    ],
  };
}

function startStatusRotation(client) {
  if (!client?.user) return;

  if (client.statusRotationInterval) {
    clearInterval(client.statusRotationInterval);
  }

  let index = 0;

  const rotate = () => {
    const config = getStatuses(client);
    const activity = config.activities[index % config.activities.length];

    client.user.setPresence({
      status: config.presence,
      activities: [activity],
    });

    index += 1;
  };

  rotate();

  client.statusRotationInterval = setInterval(
    rotate,
    STATUS_INTERVAL_MS
  );
}

module.exports = {
  startStatusRotation,
};