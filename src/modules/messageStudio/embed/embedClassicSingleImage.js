'use strict';

const { MessageFlags } = require('discord.js');

function hasAdvancedMedia(mediaState) {
  const panels = Array.isArray(mediaState?.panels) ? mediaState.panels : [];
  return panels.some((media) => {
    const gallery = Array.isArray(media?.gallery) ? media.gallery : [];
    const first = gallery[0] || {};
    const files = Array.isArray(media?.files) ? media.files : [];
    return gallery.length > 1
      || first.type === 'video'
      || first.spoiler === true
      || Boolean(first.alt)
      || Boolean(media?.thumbnail?.alt)
      || files.length > 0;
  });
}

function hasApplicationEmojiShortcode(embeds = []) {
  return embeds.some((embed) => {
    const data = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    if (!data || typeof data !== 'object') return false;
    const values = [
      data.title,
      data.description,
      data.author?.name,
      data.footer?.text,
      ...(Array.isArray(data.fields) ? data.fields.flatMap((field) => [field?.name, field?.value]) : []),
    ];
    return values.some((value) => /(^|[^<]):[a-zA-Z0-9_]{2,32}:/.test(String(value || '')));
  });
}

function syncSimpleMediaIntoEmbeds(embeds = [], mediaState = null) {
  const panels = Array.isArray(mediaState?.panels) ? mediaState.panels : [];
  for (let index = 0; index < embeds.length; index += 1) {
    const embed = embeds[index];
    if (!embed || typeof embed.setImage !== 'function') continue;
    const media = panels[index] || null;
    const image = Array.isArray(media?.gallery) ? String(media.gallery[0]?.source || '').trim() : '';
    const thumbnail = String(media?.thumbnail?.source || '').trim();
    if (image) embed.setImage(image);
    if (thumbnail && typeof embed.setThumbnail === 'function') embed.setThumbnail(thumbnail);
  }
  return embeds;
}

function installClassicSingleImagePayload(renderer) {
  if (!renderer || renderer.__classicSingleImagePayloadInstalled) return renderer;
  if (typeof renderer.buildEmbedPayload !== 'function') return renderer;

  const originalBuildEmbedPayload = renderer.buildEmbedPayload.bind(renderer);

  renderer.buildEmbedPayload = async function classicSingleImagePayload(options = {}) {
    const embeds = Array.isArray(options.embeds) ? options.embeds : [];
    const mediaState = options.media || options.mediaV2 || null;

    // A normal single image belongs in Discord's classic embed image slot.
    // Discord centers that image naturally across the embed width. Components
    // V2 remains reserved for genuine galleries and advanced media features.
    if (!hasAdvancedMedia(mediaState) && !hasApplicationEmojiShortcode(embeds)) {
      syncSimpleMediaIntoEmbeds(embeds, mediaState);
      const payload = {
        embeds,
        components: Array.isArray(options.actionRows) ? options.actionRows : [],
      };
      if (options.allowUserPing && options.userId) payload.content = `<@${options.userId}>`;
      if (options.ephemeral) payload.flags = MessageFlags.Ephemeral;
      return payload;
    }

    return originalBuildEmbedPayload(options);
  };

  renderer.__classicSingleImagePayloadInstalled = true;
  console.log('[Embed Renderer] Classic centered single-image path installed.');
  return renderer;
}

module.exports = { installClassicSingleImagePayload };
