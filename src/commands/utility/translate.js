'use strict';

const { SlashCommandBuilder } = require('discord.js');

const translationStore = require('../../modules/translation/translationStore');
const translationManager = require('../../modules/translation/translationManager');

async function reply(interaction, payload) {
  const data = { ...payload, flags: 64 };
  if (interaction.deferred || interaction.replied) return interaction.editReply(data);
  return interaction.reply(data);
}

module.exports = {
  category: 'Utility',

  help: {
    name: 'translate',
    description: '🌐 Translate text using the configured translation provider.',
    usage: '/translate text:<message> target:<language>',
  },

  data: new SlashCommandBuilder()
    .setName('translate')
    .setDescription('🌐 Translate text')
    .setDMPermission(false)
    .addStringOption((option) =>
      option
        .setName('text')
        .setDescription('Text to translate')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('target')
        .setDescription('Target language code, example: en, es, de, fr')
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('source')
        .setDescription('Source language code, or auto')
        .setRequired(false)
    ),

  async execute(interaction) {
    const guildId = interaction.guildId;
    const config = translationStore.getTranslationSection(guildId);

    if (config.enabled !== true) {
      await reply(interaction, {
        content: '⚠️ Translation is not enabled in this server yet. Ask an admin to run `/translation enable`.',
      });
      return;
    }

    const text = interaction.options.getString('text', true);
    const targetLanguage = translationManager.normalizeLanguage(
      interaction.options.getString('target') || config.settings?.defaultTargetLanguage || 'en'
    );
    const sourceLanguage = translationManager.normalizeLanguage(
      interaction.options.getString('source') || config.settings?.defaultSourceLanguage || 'auto'
    );

    const result = await translationManager.translateText({
      guildId,
      text,
      targetLanguage,
      sourceLanguage,
      mode: 'manual',
    });

    if (!result.ok) {
      await reply(interaction, {
        embeds: [translationManager.buildProviderNotConnectedEmbed({
          text,
          targetLanguage,
          sourceLanguage,
        })],
      });
      return;
    }

    await reply(interaction, {
      content: [
        `🌐 **${translationManager.languageLabel(result.sourceLanguage)} → ${translationManager.languageLabel(result.targetLanguage)}**`,
        '',
        result.translatedText,
      ].join('\n'),
    });
  },
};
