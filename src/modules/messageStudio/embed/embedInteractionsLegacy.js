'use strict';

/**
 * Transitional fallback for legacy Embed Studio component IDs that are still
 * emitted by the canonical panel surface. Modern media, buttons, readiness,
 * test-send and deployment flows live in embedInteractions.js.
 */

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const { getEmbedDeployment, getDeploymentKeyFromState } = require('./embedDeployments');
const panel = require('./embedPanel');
const { prepareEmbedMedia } = require('./embedRenderer');

const {
  clone,
  trim,
  discordErrorDetail,
  embedOperationError,
  validHex,
  normHex,
  memberName,
  basePanel,
  saveSelected,
  getSession,
  saveSession,
  markUnsaved,
  clearUnsaved,
  resetSession,
  allowedMentions,
  applyTemplate,
  applyPreset,
  buildPreviewEmbeds,
  buttonRows,
  buildEditorPanel,
  buildBuilderPanel,
  buildPanelsPanel,
  buildFieldsPanel,
  buildButtonsPanel,
  buildPresetsPanel,
  buildHelpersPanel,
  contentModal,
  mediaModal,
  fieldModal,
  buttonModal,
  colorModal,
  presetModal,
  CUSTOM_HEX_VALUE,
  MAX_PANELS,
} = panel;

function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  if (typeof channel.isTextBased === 'boolean') return channel.isTextBased;
  return Boolean(channel.send && channel.messages);
}

async function replyOrUpdate(i, payload) {
  const safePayload = { ...payload, flags: 64 };
  if (i.isModalSubmit?.()) {
    if (typeof i.update === 'function') return i.update(payload);
    if (i.deferred || i.replied) return i.editReply(safePayload);
    return i.reply(safePayload);
  }
  return i.update(payload);
}

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  if (customId !== 'admin:embed' && !customId.startsWith('embed:')) return false;

  const who = memberName(i);
  const state = getSession(i);

  if (customId === 'admin:embed') {
    await i.update(buildEditorPanel(i, who));
    return true;
  }

  if (i.isStringSelectMenu?.()) {
    if (customId === 'embed:template') {
      applyTemplate(i, i.values[0]);
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
    if (customId === 'embed:color') {
      const value = i.values[0];
      if (value === CUSTOM_HEX_VALUE) {
        await i.showModal(colorModal(state));
        return true;
      }
      markUnsaved(i, saveSelected(state, { color: value }));
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
    if (customId === 'embed:panel-select') {
      const current = getSession(i);
      saveSession(i, { ...current, selectedPanelIndex: Number(i.values[0]), selectedFieldIndex: null });
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
    if (customId === 'embed:field-layout') {
      markUnsaved(i, { ...state, fieldLayout: i.values[0] });
      await replyOrUpdate(i, buildFieldsPanel(i, who));
      return true;
    }
    if (customId === 'embed:field-select') {
      saveSession(i, { ...state, selectedFieldIndex: Number(i.values[0]) });
      await replyOrUpdate(i, buildFieldsPanel(i, who));
      return true;
    }
    if (customId === 'embed:button-select') {
      saveSession(i, { ...state, selectedButtonIndex: Number(i.values[0]) });
      await replyOrUpdate(i, buildButtonsPanel(i, who));
      return true;
    }
    if (customId === 'embed:preset-select') {
      const name = i.values[0];
      const presets = typeof guildManager.getEmbedPresets === 'function' ? guildManager.getEmbedPresets(i.guild.id) || {} : {};
      const preset = presets[name];
      if (!preset) {
        await i.reply({ content: 'Preset not found.', flags: 64 });
        return true;
      }
      applyPreset(i, name, preset);
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
  }

  if (i.isChannelSelectMenu?.() && customId === 'embed:channel') {
    markUnsaved(i, { ...state, channelId: i.values[0] });
    await replyOrUpdate(i, buildEditorPanel(i, who));
    return true;
  }

  if (i.isButton?.()) {
    if (customId === 'embed:editor' || customId === 'embed:back') {
      await i.update(buildEditorPanel(i, who));
      return true;
    }
    if (customId === 'embed:builder') {
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (customId === 'embed:presets') {
      await i.update(buildPresetsPanel(i, who));
      return true;
    }
    if (customId === 'embed:panels') {
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (customId === 'embed:fields') {
      await i.update(buildFieldsPanel(i, who));
      return true;
    }
    if (customId === 'embed:buttons') {
      await i.update(buildButtonsPanel(i, who));
      return true;
    }
    if (customId === 'embed:helpers') {
      await i.update(buildHelpersPanel(who));
      return true;
    }
    if (customId === 'embed:edit-content') {
      await i.showModal(contentModal(state));
      return true;
    }
    if (customId === 'embed:edit-media') {
      await i.showModal(mediaModal(state));
      return true;
    }
    if (customId === 'embed:toggle-ping') {
      markUnsaved(i, { ...state, allowUserPing: !state.allowUserPing });
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (customId === 'embed:toggle-timestamp') {
      markUnsaved(i, { ...state, showTimestamp: !state.showTimestamp });
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (customId === 'embed:reset') {
      resetSession(i);
      await i.update(buildEditorPanel(i, who));
      return true;
    }

    if (customId === 'embed:panel-add') {
      if (state.panels.length >= MAX_PANELS) {
        await i.reply({ content: 'Maximum panel limit reached.', flags: 64 });
        return true;
      }
      const panels = [...state.panels, basePanel({ title: `Panel ${state.panels.length + 1}`, description: 'Add content here.', color: state.color })];
      markUnsaved(i, { ...state, panels, selectedPanelIndex: panels.length - 1, selectedFieldIndex: null });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (customId === 'embed:panel-duplicate') {
      if (state.panels.length >= MAX_PANELS) {
        await i.reply({ content: 'Maximum panel limit reached.', flags: 64 });
        return true;
      }
      const panels = [...state.panels];
      panels.splice(state.selectedPanelIndex + 1, 0, clone(state.panels[state.selectedPanelIndex]));
      markUnsaved(i, { ...state, panels, selectedPanelIndex: state.selectedPanelIndex + 1, selectedFieldIndex: null });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (customId === 'embed:panel-remove') {
      if (state.panels.length <= 1) {
        await i.reply({ content: 'You need at least one panel.', flags: 64 });
        return true;
      }
      const panels = [...state.panels];
      panels.splice(state.selectedPanelIndex, 1);
      markUnsaved(i, { ...state, panels, selectedPanelIndex: Math.max(0, state.selectedPanelIndex - 1), selectedFieldIndex: null });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (customId === 'embed:panel-up' || customId === 'embed:panel-down') {
      const delta = customId.endsWith('up') ? -1 : 1;
      const target = state.selectedPanelIndex + delta;
      if (target < 0 || target >= state.panels.length) return true;
      const panels = [...state.panels];
      [panels[state.selectedPanelIndex], panels[target]] = [panels[target], panels[state.selectedPanelIndex]];
      markUnsaved(i, { ...state, panels, selectedPanelIndex: target });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }

    if (customId === 'embed:field-add') {
      await i.showModal(fieldModal(state));
      return true;
    }
    if (customId === 'embed:field-edit') {
      if (!Number.isInteger(state.selectedFieldIndex)) {
        await i.reply({ content: 'Select a field first.', flags: 64 });
        return true;
      }
      await i.showModal(fieldModal(state, state.selectedFieldIndex));
      return true;
    }
    if (customId === 'embed:field-remove-selected') {
      const fields = [...(state.fields || [])];
      if (Number.isInteger(state.selectedFieldIndex)) fields.splice(state.selectedFieldIndex, 1);
      markUnsaved(i, saveSelected({ ...state, selectedFieldIndex: null }, { fields }));
      await i.update(buildFieldsPanel(i, who));
      return true;
    }

    if (customId === 'embed:button-add') {
      await i.showModal(buttonModal(state));
      return true;
    }
    if (customId === 'embed:button-edit') {
      if (!Number.isInteger(state.selectedButtonIndex)) {
        await i.reply({ content: 'Select a button first.', flags: 64 });
        return true;
      }
      await i.showModal(buttonModal(state, state.selectedButtonIndex));
      return true;
    }
    if (customId === 'embed:button-remove-selected') {
      const buttons = [...(state.buttons || [])];
      if (Number.isInteger(state.selectedButtonIndex)) buttons.splice(state.selectedButtonIndex, 1);
      markUnsaved(i, { ...state, buttons, selectedButtonIndex: null });
      await i.update(buildButtonsPanel(i, who));
      return true;
    }
    if (customId === 'embed:button-move-up' || customId === 'embed:button-move-down') {
      const delta = customId.endsWith('up') ? -1 : 1;
      const target = state.selectedButtonIndex + delta;
      if (!Number.isInteger(state.selectedButtonIndex) || target < 0 || target >= (state.buttons || []).length) return true;
      const buttons = [...state.buttons];
      [buttons[state.selectedButtonIndex], buttons[target]] = [buttons[target], buttons[state.selectedButtonIndex]];
      markUnsaved(i, { ...state, buttons, selectedButtonIndex: target });
      await i.update(buildButtonsPanel(i, who));
      return true;
    }

    if (customId === 'embed:preset-save') {
      await i.showModal(presetModal(state));
      return true;
    }
    if (customId === 'embed:preset-delete') {
      const name = state.selectedPreset;
      if (!name) {
        await i.reply({ content: 'Select a preset first.', flags: 64 });
        return true;
      }
      const presets = typeof guildManager.getEmbedPresets === 'function' ? guildManager.getEmbedPresets(i.guild.id) || {} : {};
      delete presets[name];
      if (typeof guildManager.replaceGuildSection === 'function') guildManager.replaceGuildSection(i.guild.id, 'embedPresets', presets);
      clearUnsaved(i, { ...state, selectedPreset: null });
      await i.update(buildPresetsPanel(i, who));
      return true;
    }

    // Only legacy deployment fallback remains here: canonical interactions own the
    // Components V2 update path, while this keeps older deployed messages editable.
    if (customId === 'embed:update-existing') {
      const deployment = getEmbedDeployment(i.guild.id, getDeploymentKeyFromState(state));
      if (!deployment) {
        await i.reply({ content: '⚠️ No deployed embed found. Use the embed first.', flags: 64 });
        return true;
      }
      const channel = i.guild.channels.cache.get(deployment.channelId) || await i.guild.channels.fetch(deployment.channelId).catch(() => null);
      if (!isTextBasedChannel(channel)) {
        await i.reply({ content: '⚠️ The original embed channel no longer exists or is not text-based.', flags: 64 });
        return true;
      }
      const access = await validateChannelAccess(i.guild, channel.id, [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.EmbedLinks,
      ], { scope: 'embed.update' });
      if (!access.ok) {
        await i.reply({ content: trim(access.message, 1800), flags: 64 });
        return true;
      }
      try {
        const rendered = await prepareEmbedMedia(buildPreviewEmbeds(state, i));
        const message = await channel.messages.fetch(deployment.messageId);
        await message.edit({
          content: state.allowUserPing ? `<@${i.user.id}>` : '',
          embeds: rendered.embeds,
          files: rendered.files,
          components: buttonRows(state),
          allowedMentions: allowedMentions(state, i),
        });
        await i.reply({ content: '✅ Existing embed updated.', flags: 64 });
      } catch (error) {
        console.error('Failed to update legacy embed:', error);
        const detail = error?.code ? embedOperationError(error, channel.id, 'update') : `❌ The embed could not be built: ${discordErrorDetail(error)}`;
        await i.reply({ content: detail, flags: 64 });
      }
      return true;
    }
  }

  if (i.isModalSubmit?.()) {
    if (customId === 'embed:preset-save-modal') {
      const name = i.fields.getTextInputValue('name').trim();
      if (!name) {
        await i.reply({ content: 'Name required.', flags: 64 });
        return true;
      }
      guildManager.saveEmbedPreset(i.guild.id, name, panel.presetData(state), i.guild);
      clearUnsaved(i, { ...state, selectedPreset: name });
      await i.reply({ ...buildPresetsPanel(i, who), flags: 64 });
      return true;
    }
    if (customId === 'embed:save-color') {
      const hex = i.fields.getTextInputValue('hex');
      if (!validHex(hex)) {
        await i.reply({ content: 'Invalid HEX.', flags: 64 });
        return true;
      }
      markUnsaved(i, saveSelected(state, { color: normHex(hex) }));
      await i.reply({ ...buildEditorPanel(i, who), flags: 64 });
      return true;
    }
    if (customId.startsWith('embed:save-content:')) {
      markUnsaved(i, saveSelected(state, {
        title: i.fields.getTextInputValue('title'),
        description: i.fields.getTextInputValue('description'),
        authorName: i.fields.getTextInputValue('authorName'),
        footer: i.fields.getTextInputValue('footer'),
      }));
      await i.reply({ ...buildBuilderPanel(i, who), flags: 64 });
      return true;
    }
    if (customId.startsWith('embed:save-media:')) {
      markUnsaved(i, saveSelected(state, {
        authorIcon: i.fields.getTextInputValue('authorIcon'),
        thumbnail: i.fields.getTextInputValue('thumbnail'),
        image: i.fields.getTextInputValue('image'),
        authorUrl: i.fields.getTextInputValue('authorUrl'),
        footerIcon: i.fields.getTextInputValue('footerIcon'),
      }));
      await i.reply({ ...buildBuilderPanel(i, who), flags: 64 });
      return true;
    }
    if (customId === 'embed:field-save-new' || customId.startsWith('embed:field-save:')) {
      const fields = [...(state.fields || [])];
      const field = {
        name: i.fields.getTextInputValue('name'),
        value: i.fields.getTextInputValue('value'),
        inline: /^y(es)?$/i.test(i.fields.getTextInputValue('layout')),
      };
      if (customId === 'embed:field-save-new') fields.push(field);
      else fields[Number(customId.split(':').pop())] = field;
      markUnsaved(i, saveSelected(state, { fields }));
      await i.reply({ ...buildFieldsPanel(i, who), flags: 64 });
      return true;
    }
    if (customId === 'embed:button-save-new' || customId.startsWith('embed:button-save:')) {
      const buttons = [...(state.buttons || [])];
      const entry = {
        label: i.fields.getTextInputValue('label'),
        emoji: i.fields.getTextInputValue('emoji'),
        style: i.fields.getTextInputValue('style'),
        url: i.fields.getTextInputValue('url'),
      };
      if (customId === 'embed:button-save-new') buttons.push(entry);
      else buttons[Number(customId.split(':').pop())] = entry;
      markUnsaved(i, { ...state, buttons });
      await i.reply({ ...buildButtonsPanel(i, who), flags: 64 });
      return true;
    }
  }

  return false;
}

module.exports = { handleInteraction };
