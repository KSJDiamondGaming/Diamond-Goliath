'use strict';

let installed = false;
const pendingSaves = new Map();

function interactionKey(interaction) {
  return `${interaction?.guildId || interaction?.guild?.id || 'global'}:${interaction?.user?.id || 'system'}`;
}

function cleanName(value) {
  return String(value || '').trim().slice(0, 50);
}

function install() {
  if (installed) return true;

  let discord;
  let panel;
  let stateApi;
  let interactions;
  let guildManager;
  try {
    discord = require('discord.js');
    panel = require('./embedPanel');
    stateApi = require('./embedState');
    interactions = require('./embedInteractions');
    guildManager = require('../../../core/guild/guildManager');
  } catch (error) {
    console.warn('[Embed Presets] Enhanced preset manager could not load:', error?.message || error);
    return false;
  }

  if (!panel?.buildPresetsPanel || !interactions?.handleInteraction) return false;

  const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    StringSelectMenuBuilder,
    TextInputBuilder,
    TextInputStyle,
  } = discord;

  const originalBuildPresetsPanel = panel.buildPresetsPanel.bind(panel);
  panel.buildPresetsPanel = function enhancedPresetsPanel(interaction) {
    const guildId = interaction?.guildId || interaction?.guild?.id || null;
    const presets = guildId && typeof guildManager.getEmbedPresets === 'function'
      ? guildManager.getEmbedPresets(guildId) || {}
      : {};
    const current = stateApi.getSession(interaction);
    const defaults = guildId && typeof guildManager.getEmbedDefaults === 'function'
      ? guildManager.getEmbedDefaults(guildId) || {}
      : {};
    const defaultName = defaults[current?.template || 'custom'] || null;
    const entries = Object.entries(presets).slice(0, 25);

    const base = originalBuildPresetsPanel(interaction, presets, defaultName);
    const rows = [];

    if (entries.length) {
      rows.push(new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('embed:preset-select')
          .setPlaceholder('💾 Select preset')
          .setMinValues(1)
          .setMaxValues(1)
          .addOptions(entries.map(([key, preset]) => {
            const displayName = cleanName(preset?.name || key) || key;
            return {
              label: displayName.slice(0, 100),
              value: key.slice(0, 100),
              description: defaultName === key ? 'Default preset' : 'Saved preset',
              default: current?.selectedPreset === key,
            };
          })),
      ));
    }

    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:preset-load').setLabel('📂 Load').setStyle(ButtonStyle.Primary).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:preset-save').setLabel('💾 Save Current').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('embed:preset-new').setLabel('➕ New').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('embed:preset-rename').setLabel('✏️ Rename').setStyle(ButtonStyle.Secondary).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:preset-duplicate').setLabel('📄 Duplicate').setStyle(ButtonStyle.Secondary).setDisabled(!current?.selectedPreset),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('embed:preset-delete').setLabel('🗑️ Delete').setStyle(ButtonStyle.Danger).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:preset-default').setLabel('⭐ Set Default').setStyle(ButtonStyle.Secondary).setDisabled(!current?.selectedPreset),
      new ButtonBuilder().setCustomId('embed:back').setLabel('⬅️ Back').setStyle(ButtonStyle.Secondary),
    ));

    return { ...base, components: rows.slice(0, 5) };
  };

  function nameModal(customId, title, label, value = '') {
    return new ModalBuilder()
      .setCustomId(customId)
      .setTitle(title)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('name')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(50)
          .setValue(cleanName(value)),
      ));
  }

  const previousHandleInteraction = interactions.handleInteraction.bind(interactions);
  interactions.handleInteraction = async function enhancedPresetInteraction(interaction) {
    const customId = String(interaction?.customId || '');
    const guildId = interaction?.guildId || interaction?.guild?.id || null;
    const current = stateApi.getSession(interaction);

    if (interaction?.isStringSelectMenu?.() && customId === 'embed:preset-select') {
      const presetName = String(interaction.values?.[0] || '');
      const presets = guildManager.getEmbedPresets?.(guildId) || {};
      if (!presets[presetName]) {
        await interaction.reply({ content: 'Preset not found.', flags: 64 });
        return true;
      }
      stateApi.saveSession(interaction, { ...current, selectedPreset: presetName });
      await interaction.update(panel.buildPresetsPanel(interaction));
      return true;
    }

    if (interaction?.isButton?.() && customId === 'embed:preset-load') {
      const presetName = current?.selectedPreset || null;
      const preset = presetName ? guildManager.getEmbedPreset?.(guildId, presetName) : null;
      if (!preset) {
        await interaction.reply({ content: 'Select a valid preset first.', flags: 64 });
        return true;
      }
      stateApi.applyPreset(interaction, presetName, preset);
      stateApi.clearUnsaved(interaction, stateApi.getSession(interaction));
      await interaction.update(panel.buildEditorPanel(interaction, stateApi.memberName(interaction)));
      return true;
    }

    if (interaction?.isButton?.() && customId === 'embed:preset-new') {
      stateApi.resetSession(interaction);
      await interaction.update(panel.buildEditorPanel(interaction, stateApi.memberName(interaction)));
      return true;
    }

    if (interaction?.isButton?.() && customId === 'embed:preset-rename') {
      if (!current?.selectedPreset) {
        await interaction.reply({ content: 'Select a preset first.', flags: 64 });
        return true;
      }
      await interaction.showModal(nameModal('embed:preset-rename-modal', 'Rename Embed Preset', 'New preset name', current.selectedPreset));
      return true;
    }

    if (interaction?.isButton?.() && customId === 'embed:preset-duplicate') {
      if (!current?.selectedPreset) {
        await interaction.reply({ content: 'Select a preset first.', flags: 64 });
        return true;
      }
      await interaction.showModal(nameModal('embed:preset-duplicate-modal', 'Duplicate Embed Preset', 'Copy name', `${current.selectedPreset} Copy`));
      return true;
    }

    if (interaction?.isModalSubmit?.() && customId === 'embed:preset-rename-modal') {
      const oldName = current?.selectedPreset || null;
      const newName = cleanName(interaction.fields.getTextInputValue('name'));
      const presets = guildManager.getEmbedPresets?.(guildId) || {};
      if (!oldName || !presets[oldName]) {
        await interaction.reply({ content: 'The selected preset no longer exists.', flags: 64 });
        return true;
      }
      if (!newName) {
        await interaction.reply({ content: 'A preset name is required.', flags: 64 });
        return true;
      }
      if (newName !== oldName && presets[newName]) {
        await interaction.reply({ content: `A preset named **${newName}** already exists.`, flags: 64 });
        return true;
      }
      if (newName !== oldName) {
        guildManager.saveEmbedPreset(guildId, newName, { ...presets[oldName], name: newName }, interaction.guild);
        guildManager.deleteEmbedPreset?.(guildId, oldName, interaction.guild);
        const defaults = guildManager.getEmbedDefaults?.(guildId) || {};
        for (const [templateKey, defaultPreset] of Object.entries(defaults)) {
          if (defaultPreset === oldName) guildManager.setEmbedDefault?.(guildId, templateKey, newName, interaction.guild);
        }
      }
      stateApi.saveSession(interaction, { ...current, selectedPreset: newName });
      await interaction.reply({ content: `✅ Renamed preset to **${newName}**.`, ...panel.buildPresetsPanel(interaction), flags: 64 });
      return true;
    }

    if (interaction?.isModalSubmit?.() && customId === 'embed:preset-duplicate-modal') {
      const sourceName = current?.selectedPreset || null;
      const newName = cleanName(interaction.fields.getTextInputValue('name'));
      const presets = guildManager.getEmbedPresets?.(guildId) || {};
      if (!sourceName || !presets[sourceName]) {
        await interaction.reply({ content: 'The selected preset no longer exists.', flags: 64 });
        return true;
      }
      if (!newName) {
        await interaction.reply({ content: 'A preset name is required.', flags: 64 });
        return true;
      }
      if (presets[newName]) {
        await interaction.reply({ content: `A preset named **${newName}** already exists.`, flags: 64 });
        return true;
      }
      guildManager.saveEmbedPreset(guildId, newName, { ...presets[sourceName], name: newName }, interaction.guild);
      stateApi.saveSession(interaction, { ...current, selectedPreset: newName });
      await interaction.reply({ content: `✅ Duplicated as **${newName}**.`, ...panel.buildPresetsPanel(interaction), flags: 64 });
      return true;
    }

    if (interaction?.isModalSubmit?.() && customId === 'embed:preset-save-modal') {
      const name = cleanName(interaction.fields.getTextInputValue('name'));
      const presets = guildManager.getEmbedPresets?.(guildId) || {};
      if (name && presets[name]) {
        pendingSaves.set(interactionKey(interaction), { name, data: stateApi.presetData(current) });
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('embed:preset-overwrite-confirm').setLabel('✅ Overwrite').setStyle(ButtonStyle.Danger),
          new ButtonBuilder().setCustomId('embed:preset-overwrite-cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        await interaction.reply({ content: `⚠️ **${name}** already exists. Overwrite it?`, components: [row], flags: 64 });
        return true;
      }
    }

    if (interaction?.isButton?.() && customId === 'embed:preset-overwrite-confirm') {
      const pending = pendingSaves.get(interactionKey(interaction));
      if (!pending) {
        await interaction.update({ content: 'This overwrite request has expired.', components: [] });
        return true;
      }
      guildManager.saveEmbedPreset(guildId, pending.name, pending.data, interaction.guild);
      pendingSaves.delete(interactionKey(interaction));
      stateApi.clearUnsaved(interaction, { ...current, selectedPreset: pending.name });
      await interaction.update({ content: `✅ Overwrote **${pending.name}**.`, ...panel.buildPresetsPanel(interaction) });
      return true;
    }

    if (interaction?.isButton?.() && customId === 'embed:preset-overwrite-cancel') {
      pendingSaves.delete(interactionKey(interaction));
      await interaction.update({ content: 'Overwrite cancelled.', components: [] });
      return true;
    }

    return previousHandleInteraction(interaction);
  };
  interactions.__enhancedNamedPresetManager = true;
  installed = true;
  console.log('[Embed Presets] Enhanced named preset manager installed.');
  return true;
}

module.exports = { install };
