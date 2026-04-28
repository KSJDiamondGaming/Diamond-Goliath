module.exports = [
  {
    name: 'error',

    execute(error) {
      console.error('[DISCORD CLIENT ERROR]', error);

      if (error?.stack) {
        console.error(error.stack);
      }
    },
  },

  {
    name: 'warn',

    execute(info) {
      if (!info) {
        console.warn('[DISCORD WARNING] Unknown warning received.');
        return;
      }

      console.warn('[DISCORD WARNING]', info);
    },
  },
];