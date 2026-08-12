'use strict';

const original = require('./embedInteractionsReadinessCompat');
const panel = require('./embedNavigationCompat');

async function handleInteraction(interaction) {
  const customId = String(interaction.customId || '');

  if (interaction.isStringSelectMenu?.() && customId === 'embed:builder-panel-select') {
    const state = panel.getSession(interaction);
    const index = Math.max(0, Math.min(Number(interaction.values?.[0]) || 0, Math.max(0, (state.panels?.length || 1) - 1)));
    panel.saveSession(interaction, { ...state, selectedPanelIndex: index, selectedFieldIndex: null });
    await interaction.update(panel.buildBuilderPanel(interaction, panel.memberName(interaction)));
    return true;
  }

  return original.handleInteraction(interaction);
}

module.exports = { handleInteraction };
