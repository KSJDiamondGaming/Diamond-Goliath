'use strict';

const original = require('./embedInteractionsButtonsCompat');
const { handleButtonAction } = require('./embedButtonsCompat');
const panel = require('./embedNavigationCompat');

const DELIVERY_ACTIONS = new Set(['embed:test-send', 'embed:use', 'embed:update-existing']);

async function showReadiness(interaction) {
  const payload = panel.buildReadinessPanel(interaction);
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else if (interaction.isButton?.() || interaction.isStringSelectMenu?.() || interaction.isRoleSelectMenu?.()) await interaction.update(payload);
  else await interaction.reply({ ...payload, flags: 64 });
  return true;
}

async function updateWith(interaction, payload) {
  if (interaction.deferred || interaction.replied) await interaction.editReply(payload);
  else await interaction.update(payload);
  return true;
}

function selectState(interaction, patch = {}) {
  const state = panel.getSession(interaction);
  return panel.saveSession(interaction, { ...state, ...patch });
}

async function routeReadinessFix(interaction) {
  const report = panel.getReadinessReport(interaction);
  const target = panel.getReadinessFixTarget(report);
  const state = panel.getSession(interaction);

  if (target.type === 'channel') return updateWith(interaction, panel.buildEditorPanel(interaction, panel.memberName?.(interaction)));

  if (target.type === 'button') {
    const buttons = Array.isArray(state.buttons) ? state.buttons : [];
    const selectedButtonIndex = Number.isInteger(target.index) && buttons[target.index] ? target.index : (buttons.length ? 0 : null);
    selectState(interaction, { selectedButtonIndex });
    return updateWith(interaction, panel.buildButtonsManagerPanel(interaction));
  }

  if (target.type === 'field') {
    const panels = Array.isArray(state.panels) ? state.panels : [];
    const panelIndex = Math.max(0, Math.min(Number(target.panelIndex) || 0, Math.max(0, panels.length - 1)));
    const fields = Array.isArray(panels[panelIndex]?.fields) ? panels[panelIndex].fields : [];
    const selectedFieldIndex = Number.isInteger(target.fieldIndex) && fields[target.fieldIndex] ? target.fieldIndex : (fields.length ? 0 : null);
    selectState(interaction, { selectedPanelIndex: panelIndex, selectedFieldIndex });
    return updateWith(interaction, panel.buildFieldsManagerPanel(interaction));
  }

  if (target.type === 'media') {
    const panels = Array.isArray(state.panels) ? state.panels : [];
    const panelIndex = Math.max(0, Math.min(Number(target.panelIndex) || 0, Math.max(0, panels.length - 1)));
    selectState(interaction, { selectedPanelIndex: panelIndex });
    return updateWith(interaction, panel.buildMediaManagerPanel(interaction));
  }

  if (target.type === 'panel') {
    const panels = Array.isArray(state.panels) ? state.panels : [];
    const panelIndex = Math.max(0, Math.min(Number(target.panelIndex) || 0, Math.max(0, panels.length - 1)));
    selectState(interaction, { selectedPanelIndex: panelIndex });
    return updateWith(interaction, panel.buildBuilderPanel(interaction, panel.memberName?.(interaction)));
  }

  if (target.type === 'variables' && typeof panel.buildHelpersPanel === 'function') {
    return updateWith(interaction, panel.buildHelpersPanel(interaction, panel.memberName?.(interaction)));
  }

  return updateWith(interaction, panel.buildBuilderPanel(interaction, panel.memberName?.(interaction)));
}

async function handleInteraction(interaction) {
  const customId = String(interaction.customId || '');

  if (interaction.isStringSelectMenu?.() && customId === 'embed:builder-panel-select') {
    const state = panel.getSession(interaction);
    const index = Math.max(0, Math.min(Number(interaction.values?.[0]) || 0, Math.max(0, (state.panels?.length || 1) - 1)));
    panel.saveSession(interaction, { ...state, selectedPanelIndex: index, selectedFieldIndex: null });
    await interaction.update(panel.buildBuilderPanel(interaction, panel.memberName(interaction)));
    return true;
  }

  if (interaction.isButton?.() && customId === 'embed:actions') {
    await interaction.update(panel.buildActionsPanel(interaction));
    return true;
  }

  if ((customId === 'embed:readiness' || customId === 'embed:readiness-refresh') && interaction.isButton?.()) {
    return showReadiness(interaction);
  }
  if (customId === 'embed:readiness-fix' && interaction.isButton?.()) return routeReadinessFix(interaction);

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

  if (await handleButtonAction(interaction)) return true;
  return original.handleInteraction(interaction);
}

module.exports = { handleInteraction };
