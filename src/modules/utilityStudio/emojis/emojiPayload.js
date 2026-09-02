'use strict';

const emojis = require('./emojis');

const SHORTCODE_PATTERN = /^:([A-Za-z0-9_-]{2,32}):$/;
const MENTION_PATTERN = /^<(a?):([A-Za-z0-9_]{2,32}):(\d{15,25})>$/;
const ID_PATTERN = /^\d{15,25}$/;

function toData(value) {
  return typeof value?.toJSON === 'function' ? value.toJSON() : value;
}

function componentReference(value) {
  if (!value) return null;
  if (typeof value === 'string') {
    const raw = value.trim();
    const shortcode = raw.match(SHORTCODE_PATTERN);
    if (shortcode) return shortcode[1];
    if (MENTION_PATTERN.test(raw) || ID_PATTERN.test(raw)) return raw;
    return null;
  }

  if (typeof value !== 'object') return null;
  if (value.id && ID_PATTERN.test(String(value.id))) return String(value.id);
  const name = String(value.name || '').trim();
  const shortcode = name.match(SHORTCODE_PATTERN);
  return shortcode ? shortcode[1] : null;
}

async function resolveComponentEmoji(client, guildId, value, context) {
  const reference = componentReference(value);
  if (!reference) return value;
  const resolved = await emojis.componentEmojiForGuild(client, guildId, reference, context);
  return resolved || undefined;
}

async function resolveComponentNode(client, guildId, input, context) {
  const data = toData(input);
  if (!data || typeof data !== 'object') return data;

  const resolved = { ...data };

  if (Object.prototype.hasOwnProperty.call(data, 'emoji')) {
    const emoji = await resolveComponentEmoji(client, guildId, data.emoji, context);
    if (emoji === undefined) delete resolved.emoji;
    else resolved.emoji = emoji;
  }

  if (Array.isArray(data.options)) {
    resolved.options = [];
    for (const option of data.options) {
      const next = { ...option };
      if (Object.prototype.hasOwnProperty.call(option || {}, 'emoji')) {
        const emoji = await resolveComponentEmoji(client, guildId, option.emoji, context);
        if (emoji === undefined) delete next.emoji;
        else next.emoji = emoji;
      }
      resolved.options.push(next);
    }
  }

  if (Array.isArray(data.components)) {
    resolved.components = [];
    for (const child of data.components) {
      resolved.components.push(await resolveComponentNode(client, guildId, child, context));
    }
  }

  if (data.accessory && typeof data.accessory === 'object') {
    resolved.accessory = await resolveComponentNode(client, guildId, data.accessory, context);
  }

  return resolved;
}

async function resolveComponents(client, guildId, components = [], context = 'component') {
  const output = [];
  for (const component of components || []) {
    output.push(await resolveComponentNode(client, guildId, component, context));
  }
  return output;
}

async function resolveMessagePayload(client, guildId, payload = {}, context = 'message') {
  if (!payload || typeof payload !== 'object') return payload;
  const resolved = { ...payload };

  if (payload.content != null) {
    resolved.content = await emojis.resolveText(client, guildId, payload.content, context);
  }

  if (Array.isArray(payload.embeds)) {
    resolved.embeds = await emojis.resolveEmbeds(client, guildId, payload.embeds, context);
  }

  if (Array.isArray(payload.components)) {
    resolved.components = await resolveComponents(client, guildId, payload.components, context);
  }

  return resolved;
}

module.exports = {
  componentReference,
  resolveComponentEmoji,
  resolveComponentNode,
  resolveComponents,
  resolveMessagePayload,
};
