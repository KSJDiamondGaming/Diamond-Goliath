'use strict';

const original = require('./embedInteractionsActionsCompat');
const panel = require('./embedReadinessCompat');

const DELIVERY_ACTIONS = new Set(['embed:test-send', 'embed:use', 'embed:update-existing']);

async function showReadiness(interaction) {
  const payload = panel.buildReadinessPanel(interaction);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isRoleSelectMenu?.()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: 64 });
  return true;
}

async function handleInteraction(interaction) {
  const customId = String(interaction.customId || '');
  if ((customId === 'embed:readiness' || customId === 'embed:readiness-refresh') && interaction.isButton?.()) {
    return showReadiness(interaction);
  }

  if (DELIVERY_ACTIONS.has(customId)) {
    const report = panel.getReadinessReport(interaction);
    if (!report.ready) {
      const payload = panel.buildReadinessPanel(interaction);
      const prefix = '❌ This embed is not ready to send. Fix the issues below first.';
      payload.embeds[0].setDescription(`${prefix}\n\n${payload.embeds[0].data.description || ''}`.slice(0, 4096));
      if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
      else await interaction.reply({ ...payload, flags: 64 });
      return true;
    }
  }

  return original.handleInteraction(interaction);
}

module.exports = { handleInteraction };
