module.exports = {
  apps: [
    {
      name: 'goliath-dev',
      script: 'server.js',
      env: {
        BOT_MODE: 'dev',
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
    },

    {
      name: 'goliath-beta',
      script: 'server.js',
      env: {
        BOT_MODE: 'beta',
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '500M',
    },

    {
      name: 'goliath-production',
      script: 'server.js',
      env: {
        BOT_MODE: 'production',
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
};