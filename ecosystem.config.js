module.exports = {
  apps: [
    {
      name: 'goliath-dev',
      script: 'server.js',
      env: {
        BOT_MODE: 'dev',
        NODE_ENV: 'development',
        PORT: 3001,
        BOT_API_PORT: 3002,
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
        NODE_ENV: 'production',
        PORT: 3011,
        BOT_API_PORT: 3012,
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
        NODE_ENV: 'production',
        PORT: 3021,
        BOT_API_PORT: 3022,
      },
      watch: false,
      autorestart: true,
      max_memory_restart: '1G',
    },
  ],
};