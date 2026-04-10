module.exports = {
  name: 'warn',

  execute(info) {
    console.warn('[DISCORD WARNING]', info);
  },
};