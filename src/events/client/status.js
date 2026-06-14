const { ActivityType } = require('discord.js');

const STATUS_INTERVAL_MS = 180_000;

const MODE_CONFIG = {
  DEV: {
    presence: 'online',
    badge: 'v',
    label: 'DEV',
    activities: [
      { name: '🔵 DEV | Building Goliath', type: ActivityType.Watching },
      { name: '🧪 Testing New Modules', type: ActivityType.Playing },
      { name: '🛠️ KSJ Development Server', type: ActivityType.Watching },
      { name: '⚙️ Dashboard Changes', type: ActivityType.Watching },
      { name: '🎟️ Ticket System Tests', type: ActivityType.Playing },
      { name: '📋 Forms Engine Tests', type: ActivityType.Watching },
      { name: '🌐 Translation Experiments', type: ActivityType.Competing },
      { name: '🔒 Security Center Checks', type: ActivityType.Watching },
    ],
  },

  BETA: {
    presence: 'online',
    badge: '🟡',
    label: 'BETA',
    activities: [
      { name: '🟡 BETA | Staging Goliath', type: ActivityType.Watching },
      { name: '🚧 Testing Upcoming Features', type: ActivityType.Playing },
      { name: '🔍 Watching Beta Feedback', type: ActivityType.Watching },
      { name: '⚡ Stability Testing', type: ActivityType.Competing },
      { name: '🎟️ Validating Ticket Tools', type: ActivityType.Watching },
      { name: '📋 Reviewing Forms Flow', type: ActivityType.Watching },
      { name: '🌐 Testing Translation Hub', type: ActivityType.Competing },
      { name: '🛡️ Security Systems Online', type: ActivityType.Watching },
    ],
  },

  PRODUCTION: {
    presence: 'online',
    badge: '🔵',
    label: 'Goliath',
    activities: [
      { name: '🟢 Goliath | Protecting Servers', type: ActivityType.Watching },
      { name: '🛡️ Server Security', type: ActivityType.Watching },
      { name: '🎟️ Managing Tickets', type: ActivityType.Playing },
      { name: '📋 Processing Forms', type: ActivityType.Watching },
      { name: '🔒 Monitoring Threats', type: ActivityType.Watching },
      { name: '🌐 Supporting Communities', type: ActivityType.Competing },
      { name: '⚡ Powered by KSJ Digital', type: ActivityType.Watching },
      { name: '/help', type: ActivityType.Listening },
    ],
  },
};

function getMode(client) {
  return (client.botMode || process.env.BOT_MODE || 'DEV').toUpperCase();
}

function getStatuses(client) {
  const mode = getMode(client);
  const config = MODE_CONFIG[mode] || MODE_CONFIG.DEV;

  if (mode === 'PRODUCTION') {
    return {
      ...config,
      activities: [
        ...config.activities,
        {
          name: `🛡️ Protecting ${client.guilds.cache.size} Servers`,
          type: ActivityType.Watching,
        },
      ],
    };
  }

  return config;
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
      status: 'online',
      activities: [activity],
    });

    index += 1;
  };

  rotate();

  client.statusRotationInterval = setInterval(rotate, STATUS_INTERVAL_MS);
}

module.exports = {
  startStatusRotation,
};