'use strict';

const giveawaysManager = require('./giveawaysManager');

function isGiveawayInteraction(interaction) {
  return String(interaction?.customId || '').startsWith('giveaways:');
}

async function safeReply(interaction, content) {
  const payload = { content, flags: 64 };
  if (interaction.deferred || interaction.replied) return interaction.followUp(payload).catch(() => null);
  return interaction.reply(payload).catch(() => null);
}

async function handleGiveawayInteraction(interaction) {
  if (!interaction?.guildId || !isGiveawayInteraction(interaction)) return false;

  try {
    const [, action, giveawayId] = String(interaction.customId || '').split(':');

    if (interaction.isButton?.() && action === 'enter') {
      await interaction.deferUpdate().catch(() => null);
      await giveawaysManager.enterGiveaway(interaction, giveawayId);
      await safeReply(interaction, '✅ You entered the giveaway.');
      return true;
    }

    if (interaction.isButton?.() && action === 'end') {
      await interaction.deferUpdate().catch(() => null);
      await giveawaysManager.endGiveaway(interaction, giveawayId, interaction.user.id);
      await safeReply(interaction, '✅ Giveaway ended.');
      return true;
    }

    return false;
  } catch (error) {
    await safeReply(interaction, `❌ Giveaway action failed: ${error.message}`);
    return true;
  }
}

module.exports = {
  isGiveawayInteraction,
  handleGiveawayInteraction,
};
