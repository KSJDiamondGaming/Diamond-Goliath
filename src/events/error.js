module.exports = {
  name: 'error',

  execute(error) {
    console.error('[DISCORD CLIENT ERROR]', error);

    if (error?.stack) {
      console.error(error.stack);
    }
  },
};