'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { Events } = require('discord.js');

const emojiApi = require('../../modules/utilityStudio/emojis/emojisApi');
const emojis = require('../../modules/utilityStudio/emojis/emojis');
const emojiProcessor = require('../../core/mediaTools/emojiMaker/emojiProcessor');

const TARGET_ALIAS = 'discord';
const ACCIDENTAL_ALIAS = 'activision';
const REQUEST_OPTIONS = {
  headers: { 'User-Agent': 'KSJHub-Goliath/1.0' },
  timeout: 15000,
};

function digest(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function downloadEmoji(emoji) {
  const url = emoji?.imageURL?.({ extension: 'png', size: 128 }) || emoji?.url;
  if (!url) return null;
  const response = await fetch(url, REQUEST_OPTIONS);
  if (!response.ok) throw new Error(`emoji download failed (${response.status})`);
  return response.buffer();
}

async function repairIfMisassigned(client) {
  const manager = client?.application?.emojis;
  if (!manager) return { repaired: false, reason: 'manager-unavailable' };

  await emojis.recoverCoreArtifacts(client);
  const bank = await manager.fetch();
  const byName = new Map(
    [...bank.values()]
      .filter((emoji) => emoji?.name)
      .map((emoji) => [String(emoji.name).toLowerCase(), emoji]),
  );

  const target = byName.get(`${emojis.CORE_EMOJI_PREFIX}${TARGET_ALIAS}`);
  const accidental = byName.get(`${emojis.CORE_EMOJI_PREFIX}${ACCIDENTAL_ALIAS}`);
  if (!target || !accidental) return { repaired: false, reason: 'required-core-emoji-missing' };

  const [targetBuffer, accidentalBuffer] = await Promise.all([
    downloadEmoji(target),
    downloadEmoji(accidental),
  ]);
  if (!targetBuffer || !accidentalBuffer) return { repaired: false, reason: 'image-unavailable' };

  if (digest(targetBuffer) !== digest(accidentalBuffer)) {
    return { repaired: false, reason: 'discord-artwork-not-duplicated' };
  }

  const sourcePath = path.join(
    process.cwd(),
    'src',
    'modules',
    'utilityStudio',
    'emojis',
    'assets',
    `${TARGET_ALIAS}.png`,
  );
  if (!fs.existsSync(sourcePath)) throw new Error(`Canonical Core asset is missing: ${sourcePath}`);

  const source = await fs.promises.readFile(sourcePath);
  const prepared = await emojiProcessor.prepareEmojiBuffer(source, {
    size: 512,
    padding: 32,
    maxBytes: emojiApi.MAX_BYTES,
  });

  const result = await emojis.replaceCoreEmoji(client, TARGET_ALIAS, prepared.buffer);
  return { repaired: true, result };
}

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    try {
      const outcome = await repairIfMisassigned(client);
      if (outcome.repaired) {
        console.log('[Emoji Core] Repaired :discord: from canonical repo asset after detecting duplicated Activision artwork.');
      }
    } catch (error) {
      console.error('[Emoji Core] Automatic Discord artwork repair failed:', error?.message || error);
    }
  },
};
