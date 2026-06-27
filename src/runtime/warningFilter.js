const originalEmitWarning = process.emitWarning.bind(process);

process.emitWarning = (warning, ...args) => {
  const message = String(typeof warning === 'string' ? warning : warning?.message || '');
  const warningName = typeof args[0] === 'string' ? args[0] : args[0]?.type || warning?.name;
  const isKnownDiscordReadyWarning = warningName === 'DeprecationWarning' && message.includes('ready event has been renamed to clientReady');

  if (isKnownDiscordReadyWarning) {
    return;
  }

  originalEmitWarning(warning, ...args);
};
