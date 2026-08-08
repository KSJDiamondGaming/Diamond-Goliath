'use strict';

/**
 * Canonical Embed interactions layer.
 * Owns Discord component and modal routing for Embed Studio.
 */

const { PermissionFlagsBits } = require('discord.js');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const {
  saveEmbedDeployment,
  getEmbedDeployment,
  getDeploymentKeyFromState,
} = require('./embedDeployments');
const panel = require('./embedPanel');
const {
  clone,
  trim,
  discordErrorDetail,
  embedOperationError,
  safeUrl,
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
  presetData,
  applyTemplate,
  applyPreset,
  setDefault,
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
  MAX_BUTTONS,
} = panel;

function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  if (typeof channel.isTextBased === 'boolean') return channel.isTextBased;
  return Boolean(channel.send && channel.messages);
}

async function replyOrUpdate(i, payload) {
  const safePayload = { ...payload, flags: 64 };

  if (i.isModalSubmit()) {
    if (typeof i.update === 'function') {
      return i.update(payload);
    }

    if (i.deferred || i.replied) {
      return i.editReply(safePayload);
    }

    return i.reply(safePayload);
  }

  return i.update(payload);
}

async function handleInteraction(i) {
  if (!i.customId?.startsWith('embed:')) return false;
  const who = memberName(i);
  const s = getSession(i);

  if (i.isStringSelectMenu()) {
    if (i.customId === 'embed:template') {
      applyTemplate(i, i.values[0]);
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:color') {
      if (i.values[0] === CUSTOM_HEX_VALUE) {
        await i.showModal(colorModal(s));
        return true;
      }
      markUnsaved(i, saveSelected(s, { color: i.values[0] }));
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:panel-select') {
      saveSession(i, {
        ...s,
        selectedPanelIndex: Number(i.values[0]),
        selectedFieldIndex: null,
      });
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:field-layout') {
      markUnsaved(i, { ...s, fieldLayout: i.values[0] });
      await replyOrUpdate(i, buildFieldsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:field-select') {
      saveSession(i, { ...s, selectedFieldIndex: Number(i.values[0]) });
      await replyOrUpdate(i, buildFieldsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:button-select') {
      saveSession(i, { ...s, selectedButtonIndex: Number(i.values[0]) });
      await replyOrUpdate(i, buildButtonsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:preset-select') {
      const preset = guildManager.getEmbedPreset(i.guild.id, i.values[0]);
      if (!preset) {
        await i.reply({ content: 'Preset not found.', flags: 64 });
        return true;
      }
      applyPreset(i, i.values[0], preset);
      await replyOrUpdate(i, buildEditorPanel(i, who));
      return true;
    }
  }

  if (i.isChannelSelectMenu() && i.customId === 'embed:channel') {
    markUnsaved(i, { ...s, channelId: i.values[0] });
    await replyOrUpdate(i, buildEditorPanel(i, who));
    return true;
  }

  if (i.isButton()) {
    if (i.customId === 'embed:back' || i.customId === 'embed:editor') {
      await i.update(buildEditorPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:builder') {
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:helpers') {
      await i.update(buildHelpersPanel(who));
      return true;
    }
    if (i.customId === 'embed:presets') {
      await i.update(buildPresetsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:panels') {
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:fields') {
      await i.update(buildFieldsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:buttons') {
      await i.update(buildButtonsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:edit-content') {
      await i.showModal(contentModal(s));
      return true;
    }
    if (i.customId === 'embed:edit-media') {
      await i.showModal(mediaModal(s));
      return true;
    }
    if (i.customId === 'embed:toggle-ping') {
      markUnsaved(i, { ...s, allowUserPing: !s.allowUserPing });
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:toggle-timestamp') {
      markUnsaved(i, { ...s, showTimestamp: !s.showTimestamp });
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:reset') {
      resetSession(i);
      await i.update(buildBuilderPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:panel-add') {
      if (s.panels.length >= MAX_PANELS) {
        await i.reply({ content: 'Maximum panel limit reached.', flags: 64 });
        return true;
      }
      const panels = [
        ...s.panels,
        basePanel({
          title: `Panel ${s.panels.length + 1}`,
          description: 'Add content here.',
          color: s.color,
        }),
      ];
      markUnsaved(i, {
        ...s,
        panels,
        selectedPanelIndex: panels.length - 1,
        selectedFieldIndex: null,
      });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:panel-duplicate') {
      if (s.panels.length >= MAX_PANELS) {
        await i.reply({ content: 'Maximum panel limit reached.', flags: 64 });
        return true;
      }
      const panels = [...s.panels];
      panels.splice(s.selectedPanelIndex + 1, 0, clone(s.panels[s.selectedPanelIndex]));
      markUnsaved(i, {
        ...s,
        panels,
        selectedPanelIndex: s.selectedPanelIndex + 1,
        selectedFieldIndex: null,
      });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:panel-remove') {
      if (s.panels.length <= 1) {
        await i.reply({ content: 'You need at least one panel.', flags: 64 });
        return true;
      }
      const panels = [...s.panels];
      panels.splice(s.selectedPanelIndex, 1);
      markUnsaved(i, {
        ...s,
        panels,
        selectedPanelIndex: Math.max(0, s.selectedPanelIndex - 1),
        selectedFieldIndex: null,
      });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:panel-up' || i.customId === 'embed:panel-down') {
      const d = i.customId.endsWith('up') ? -1 : 1;
      const target = s.selectedPanelIndex + d;
      if (target < 0 || target >= s.panels.length) return true;
      const panels = [...s.panels];
      [panels[s.selectedPanelIndex], panels[target]] = [panels[target], panels[s.selectedPanelIndex]];
      markUnsaved(i, { ...s, panels, selectedPanelIndex: target });
      await i.update(buildPanelsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:field-add') {
      await i.showModal(fieldModal(s));
      return true;
    }
    if (i.customId === 'embed:field-edit') {
      if (!Number.isInteger(s.selectedFieldIndex)) {
        await i.reply({ content: 'Select a field first.', flags: 64 });
        return true;
      }
      await i.showModal(fieldModal(s, s.selectedFieldIndex));
      return true;
    }
    if (i.customId === 'embed:field-remove-selected') {
      const fields = [...(s.fields || [])];
      if (Number.isInteger(s.selectedFieldIndex)) fields.splice(s.selectedFieldIndex, 1);
      markUnsaved(i, saveSelected({ ...s, selectedFieldIndex: null }, { fields }));
      await i.update(buildFieldsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:button-add') {
      await i.showModal(buttonModal(s));
      return true;
    }
    if (i.customId === 'embed:button-edit') {
      if (!Number.isInteger(s.selectedButtonIndex)) {
        await i.reply({ content: 'Select a button first.', flags: 64 });
        return true;
      }
      await i.showModal(buttonModal(s, s.selectedButtonIndex));
      return true;
    }
    if (i.customId === 'embed:button-remove-selected') {
      const buttons = [...(s.buttons || [])];
      if (Number.isInteger(s.selectedButtonIndex)) buttons.splice(s.selectedButtonIndex, 1);
      markUnsaved(i, { ...s, buttons, selectedButtonIndex: null });
      await i.update(buildButtonsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:button-move-up' || i.customId === 'embed:button-move-down') {
      const d = i.customId.endsWith('up') ? -1 : 1;
      const target = s.selectedButtonIndex + d;
      if (!Number.isInteger(s.selectedButtonIndex) || target < 0 || target >= (s.buttons || []).length) return true;
      const buttons = [...s.buttons];
      [buttons[s.selectedButtonIndex], buttons[target]] = [buttons[target], buttons[s.selectedButtonIndex]];
      markUnsaved(i, { ...s, buttons, selectedButtonIndex: target });
      await i.update(buildButtonsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:preset-save') {
      await i.showModal(presetModal(s));
      return true;
    }
    if (i.customId === 'embed:preset-delete') {
      const name = s.selectedPreset;
      if (!name) {
        await i.reply({ content: 'Select a preset first.', flags: 64 });
        return true;
      }
      const presets = typeof guildManager.getEmbedPresets === 'function'
        ? guildManager.getEmbedPresets(i.guild.id) || {}
        : {};
      delete presets[name];
      if (typeof guildManager.replaceGuildSection === 'function') {
        guildManager.replaceGuildSection(i.guild.id, 'embedPresets', presets);
      }
      clearUnsaved(i, { ...s, selectedPreset: null });
      await i.update(buildPresetsPanel(i, who));
      return true;
    }
    if (i.customId === 'embed:test-send') {
      await i.reply({
        content: '🧪 Test Preview',
        embeds: buildPreviewEmbeds(s, i),
        components: buttonRows(s),
        allowedMentions: allowedMentions(s, i),
        flags: 64,
      });
      return true;
    }
    if (i.customId === 'embed:update-existing') {
      const deployment = getEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s));
      if (!deployment) {
        await i.reply({ content: '⚠️ No deployed embed found. Use the embed first.', flags: 64 });
        return true;
      }

      const channel = i.guild.channels.cache.get(deployment.channelId)
        || (await i.guild.channels.fetch(deployment.channelId).catch(() => null));
      if (!isTextBasedChannel(channel)) {
        await i.reply({
          content: '⚠️ The original embed channel no longer exists or is not text-based.',
          flags: 64,
        });
        return true;
      }

      const access = await validateChannelAccess(
        i.guild,
        channel.id,
        [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ],
        { scope: 'embed.update' },
      );
      if (!access.ok) {
        await i.reply({ content: trim(access.message, 1800), flags: 64 });
        return true;
      }

      let payload;
      try {
        payload = {
          content: s.allowUserPing ? `<@${i.user.id}>` : '',
          embeds: buildPreviewEmbeds(s, i),
          components: buttonRows(s),
          allowedMentions: allowedMentions(s, i),
        };
      } catch (error) {
        console.error('Embed update payload build failed:', error);
        await i.reply({
          content: `❌ The embed could not be built: ${discordErrorDetail(error)}`,
          flags: 64,
        });
        return true;
      }

      try {
        const message = await channel.messages.fetch(deployment.messageId);
        await message.edit(payload);
        await i.reply({ content: '✅ Existing embed updated.', flags: 64 });
      } catch (error) {
        console.error('Failed to update existing embed:', error);
        await i.reply({ content: embedOperationError(error, channel.id, 'update'), flags: 64 });
      }
      return true;
    }
    if (i.customId === 'embed:use') {
      const channel = i.guild.channels.cache.get(s.channelId)
        || (await i.guild.channels.fetch(s.channelId).catch(() => null));
      if (!isTextBasedChannel(channel)) {
        await i.reply({ content: 'Invalid channel.', flags: 64 });
        return true;
      }

      const access = await validateChannelAccess(
        i.guild,
        channel.id,
        [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.EmbedLinks,
        ],
        { scope: 'embed.deploy' },
      );
      if (!access.ok) {
        await i.reply({ content: trim(access.message, 1800), flags: 64 });
        return true;
      }

      let payload;
      try {
        payload = {
          content: s.allowUserPing ? `<@${i.user.id}>` : '',
          embeds: buildPreviewEmbeds(s, i),
          components: buttonRows(s),
          allowedMentions: allowedMentions(s, i),
        };
      } catch (error) {
        console.error('Embed payload build failed:', error);
        await i.reply({
          content: `❌ The embed could not be built: ${discordErrorDetail(error)}`,
          flags: 64,
        });
        return true;
      }

      let sent;
      try {
        sent = await channel.send(payload);
      } catch (error) {
        console.error('Embed send failed:', error);
        await i.reply({ content: embedOperationError(error, channel.id, 'send'), flags: 64 });
        return true;
      }

      const presetName = `auto-${s.template || 'custom'}`;
      guildManager.saveEmbedPreset(i.guild.id, presetName, presetData(s), i.guild);
      saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState({ ...s, selectedPreset: presetName }), {
        channelId: channel.id,
        messageId: sent.id,
        template: s.template,
        preset: presetName,
        createdBy: i.user.id,
        lastUpdatedBy: i.user.id,
      });
      const ok = setDefault(i.guild.id, s.template, presetName);
      clearUnsaved(i, { ...s, selectedPreset: presetName });
      await i.reply({
        content: ok
          ? `✅ Embed posted to <#${s.channelId}> and saved as active`
          : '⚠️ Preset saved, but default assignment failed.',
        flags: 64,
      });
      return true;
    }
  }

  if (i.isModalSubmit()) {
    if (i.customId === 'embed:preset-save-modal') {
      const name = i.fields.getTextInputValue('name').trim();
      if (!name) {
        await i.reply({ content: 'Name required.', flags: 64 });
        return true;
      }
      guildManager.saveEmbedPreset(i.guild.id, name, presetData(s), i.guild);
      clearUnsaved(i, { ...s, selectedPreset: name });
      await i.reply({ ...buildPresetsPanel(i, who), flags: 64 });
      return true;
    }
    if (i.customId === 'embed:save-color') {
      const hex = i.fields.getTextInputValue('hex');
      if (!validHex(hex)) {
        await i.reply({ content: 'Invalid HEX.', flags: 64 });
        return true;
      }
      markUnsaved(i, saveSelected(s, { color: normHex(hex) }));
      await i.reply({ ...buildEditorPanel(i, who), flags: 64 });
      return true;
    }
    if (i.customId.startsWith('embed:save-content:')) {
      markUnsaved(i, saveSelected(s, {
        title: i.fields.getTextInputValue('title'),
        description: i.fields.getTextInputValue('description'),
        authorName: i.fields.getTextInputValue('authorName'),
        footer: i.fields.getTextInputValue('footer'),
      }));
      await i.reply({ ...buildBuilderPanel(i, who), flags: 64 });
      return true;
    }
    if (i.customId.startsWith('embed:save-media:')) {
      markUnsaved(i, saveSelected(s, {
        authorIcon: i.fields.getTextInputValue('authorIcon'),
        thumbnail: i.fields.getTextInputValue('thumbnail'),
        image: i.fields.getTextInputValue('image'),
        authorUrl: i.fields.getTextInputValue('authorUrl'),
        footerIcon: i.fields.getTextInputValue('footerIcon'),
      }));
      await i.reply({ ...buildBuilderPanel(i, who), flags: 64 });
      return true;
    }
    if (i.customId === 'embed:field-save-new' || i.customId.startsWith('embed:field-save:')) {
      const n = i.customId.startsWith('embed:field-save:') ? Number(i.customId.split(':')[2]) : null;
      const fields = [...(s.fields || [])];
      const f = {
        name: i.fields.getTextInputValue('name'),
        value: i.fields.getTextInputValue('value'),
        inline: /^y(es)?|true|1$/i.test(i.fields.getTextInputValue('layout') || ''),
      };
      if (Number.isInteger(n)) fields[n] = f;
      else fields.push(f);
      markUnsaved(i, {
        ...saveSelected(s, { fields }),
        selectedFieldIndex: Number.isInteger(n) ? n : fields.length - 1,
      });
      await i.reply({ ...buildFieldsPanel(i, who), flags: 64 });
      return true;
    }
    if (i.customId === 'embed:button-save-new' || i.customId.startsWith('embed:button-save:')) {
      const n = i.customId.startsWith('embed:button-save:') ? Number(i.customId.split(':')[2]) : null;
      const style = i.fields.getTextInputValue('style') || 'Link';
      const url = i.fields.getTextInputValue('url');
      if (String(style).toLowerCase() === 'link' && !safeUrl(url)) {
        await i.reply({ content: '⚠️ Link buttons require a valid URL.', flags: 64 });
        return true;
      }
      const buttons = [...(s.buttons || [])];
      const b = {
        label: i.fields.getTextInputValue('label'),
        emoji: i.fields.getTextInputValue('emoji'),
        style,
        action: 'link',
        url,
      };
      if (Number.isInteger(n)) buttons[n] = b;
      else buttons.push(b);
      markUnsaved(i, {
        ...s,
        buttons,
        selectedButtonIndex: Number.isInteger(n) ? n : buttons.length - 1,
      });
      await i.reply({ ...buildButtonsPanel(i, who), flags: 64 });
      return true;
    }
  }

  return false;
}

module.exports = { handleInteraction };
