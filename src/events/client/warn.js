module.exports = {
  name: 'warn',

  execute(info) {
    if (!info) {
      console.warn('[DISCORD WARNING] Unknown warning received.');
      return;
    }

    console.warn('[DISCORD WARNING]', info);
  },
};
