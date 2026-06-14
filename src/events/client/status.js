const { ActivityType } = require('discord.js');

const STATUS_INTERVAL_MS = 180_000;

function getMode(client) {
  return (client.botMode || process.env.BOT_MODE || 'DEV').toUpperCase();
}

function getTotalMembers(client) {
  return client.guilds.cache.reduce(
    (total, guild) => total + (guild.memberCount || 0),
    0
  );
}

function buildActivities(client) {
  const mode = getMode(client);
  const guildCount = client.guilds.cache.size;
  const memberCount = getTotalMembers(client).toLocaleString();

  if (mode === 'DEV') {
    return [
      { name: '🔵 DEV | Building Goliath', type: ActivityType.Watching },
      { name: '🧪 Testing New Modules', type: ActivityType.Playing },
      { name: '🛠️ KSJ Development Server', type: ActivityType.Watching },
      { name: '⚙️ Dashboard Changes', type: ActivityType.Watching },
      { name: '🎟️ Ticket System Tests', type: ActivityType.Playing },
      { name: '📋 Forms Engine Tests', type: ActivityType.Watching },
      { name: '🌐 Translation Experiments', type: ActivityType.Competing },
      { name: '🔒 Security Center Checks', type: ActivityType.Watching },
    ];
  }

  if (mode === 'BETA') {
    return [
      { name: '🟡 BETA | Staging Goliath', type: ActivityType.Watching },
      { name: '🚧 Testing Upcoming Features', type: ActivityType.Playing },
      { name: '🔍 Watching Beta Feedback', type: ActivityType.Watching },
      { name: '⚡ Stability Testing', type: ActivityType.Competing },
      { name: '🎟️ Validating Ticket Tools', type: ActivityType.Watching },
      { name: '📋 Reviewing Forms Flow', type: ActivityType.Watching },
      { name: '🌐 Testing Translation Hub', type: ActivityType.Competing },
      { name: '🛡️ Security Systems Online', type: ActivityType.Watching },
    ];
  }

  return [
    { name: '🟢 Goliath | Protecting Servers', type: ActivityType.Watching },
    { name: `🛡️ Protecting ${guildCount} Servers`, type: ActivityType.Watching },
    { name: `👥 Watching ${memberCount} Members`, type: ActivityType.Watching },
    { name: '🎟️ Managing Tickets', type: ActivityType.Playing },
    { name: '📋 Processing Forms', type: ActivityType.Watching },
    { name: '🔒 Monitoring Threats', type: ActivityType.Watching },
    { name: '🌐 Supporting Communities', type: ActivityType.Competing },
    { name: '⚡ Powered by KSJ Digital', type: ActivityType.Watching },
    { name: '/help', type: ActivityType.Listening },
  ];
}

function startStatusRotation(client) {
  if (!client?.user) return;

  if (client.statusRotationInterval) {
    clearInterval(client.statusRotationInterval);
    client.statusRotationInterval = null;
  }

  let index = 0;

  const rotate = async () => {
    try {
      const activities = buildActivities(client);
      const activity = activities[index % activities.length];

      await client.user.setPresence({
        status: 'online',
        activities: [activity],
      });

      index += 1;
    } catch (error) {
      console.error('[status] Failed to update bot presence:', error);
    }
  };

  rotate();

  client.statusRotationInterval = setInterval(rotate, STATUS_INTERVAL_MS);
}

module.exports = {
  startStatusRotation,
};