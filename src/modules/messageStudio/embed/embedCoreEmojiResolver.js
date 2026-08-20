'use strict';

const emojis = require('../../utilityStudio/emojis/emojis');

function guildIdFromInteraction(interaction) {
  return String(interaction?.guildId || interaction?.guild?.id || '').trim();
}

function installCoreEmojiResolver(renderer) {
  if (!renderer || typeof renderer.buildEmbedPayload !== 'function') {
    throw new Error('Embed renderer does not expose buildEmbedPayload.');
  }
  if (renderer.__goliathCoreEmojiResolverInstalled) return renderer;

  const originalBuildEmbedPayload = renderer.buildEmbedPayload.bind(renderer);

  renderer.buildEmbedPayload = async function buildEmbedPayloadWithCoreEmojis(options = {}) {
    const interaction = options?.interaction || null;
    const client = interaction?.client || null;
    const guildId = guildIdFromInteraction(interaction);

    if (!client || !guildId || !Array.isArray(options?.embeds) || !options.embeds.length) {
      return originalBuildEmbedPayload(options);
    }

    const resolvedEmbeds = await emojis.resolveEmbeds(client, guildId, options.embeds);
    return originalBuildEmbedPayload({ ...options, embeds: resolvedEmbeds });
  };

  Object.defineProperty(renderer, '__goliathCoreEmojiResolverInstalled', {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return renderer;
}

module.exports = {
  installCoreEmojiResolver,
};
