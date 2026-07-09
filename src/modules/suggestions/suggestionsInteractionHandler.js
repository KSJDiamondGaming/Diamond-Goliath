'use strict';

const suggestionsManager = require('./suggestionsManager');

function isSuggestionsInteraction(interaction) {
  return String(interaction?.customId || '').startsWith('suggestions:');
}

async function safeReply(interaction, content) {
  const payload = { content, flags: 64 };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function handleSuggestionsInteraction(interaction) {
  if (!interaction?.guildId || !isSuggestionsInteraction(interaction)) return false;

  try {
    const parts = String(interaction.customId || '').split(':');

    if (interaction.isButton?.() && interaction.customId === 'suggestions:submit') {
      await interaction.showModal(suggestionsManager.buildSubmitModal());
      return true;
    }

    if (interaction.isModalSubmit?.() && interaction.customId === 'suggestions:modal:submit') {
      await suggestionsManager.submitSuggestion(interaction);
      await safeReply(interaction, '✅ Suggestion submitted.');
      return true;
    }

    if (interaction.isButton?.() && parts[1] === 'vote') {
      await interaction.deferUpdate().catch(() => null);
      await suggestionsManager.vote(interaction, parts[2], parts[3]);
      return true;
    }

    if (interaction.isButton?.() && parts[1] === 'review') {
      await interaction.deferUpdate().catch(() => null);
      await suggestionsManager.review(interaction, parts[2], parts[3]);
      await safeReply(interaction, `✅ Suggestion ${parts[3] === 'approve' ? 'approved' : 'denied'}.`);
      return true;
    }

    return false;
  } catch (error) {
    await safeReply(interaction, `❌ Suggestion action failed: ${error.message}`);
    return true;
  }
}

module.exports = {
  isSuggestionsInteraction,
  handleSuggestionsInteraction,
};
