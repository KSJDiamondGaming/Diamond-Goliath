'use strict';

const formsManager = require('./formsManager');

function isFormsInteraction(interaction) {
  return String(interaction?.customId || '').startsWith('forms:');
}

async function safeReply(interaction, content) {
  const payload = { content, flags: 64 };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function handleFormsInteraction(interaction) {
  if (!interaction?.guildId || !isFormsInteraction(interaction)) return false;

  try {
    const parts = String(interaction.customId || '').split(':');

    if (interaction.isButton?.() && parts[1] === 'open') {
      const formId = parts[2];
      const formsStore = require('./formsStore');
      const form = formsStore.getForm(interaction.guildId, formId);
      if (!form) throw new Error('Form not found.');
      await interaction.showModal(formsManager.buildModal(form));
      return true;
    }

    if (interaction.isModalSubmit?.() && parts[1] === 'modal') {
      await formsManager.handleSubmitModal(interaction, parts[2]);
      await safeReply(interaction, '✅ Form submitted.');
      return true;
    }

    if (interaction.isButton?.() && parts[1] === 'review') {
      await interaction.deferUpdate().catch(() => null);
      await formsManager.reviewSubmission(interaction, parts[2], parts[3]);
      await safeReply(interaction, `✅ Submission ${parts[3] === 'approve' ? 'approved' : 'denied'}.`);
      return true;
    }

    return false;
  } catch (error) {
    await safeReply(interaction, `❌ Form action failed: ${error.message}`);
    return true;
  }
}

module.exports = {
  isFormsInteraction,
  handleFormsInteraction,
};
