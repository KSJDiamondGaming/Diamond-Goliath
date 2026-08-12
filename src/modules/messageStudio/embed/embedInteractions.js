'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const original = require('./embedInteractionsLegacy');
const panel = require('./embedPreviewCompat');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const { saveEmbedDeployment, getEmbedDeployment, getDeploymentKeyFromState } = require('./embedDeployments');
const { buildEmbedPayload } = require('./embedRenderer');
const {
  trim, embedOperationError, getSession, saveSelected, markUnsaved, allowedMentions,
  presetData, setDefault, clearUnsaved, buildPreviewEmbeds, buildBuilderPanel, buttonRows, imageModal,
} = panel;

function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  if (typeof channel.isTextBased === 'boolean') return channel.isTextBased;
  return Boolean(channel.send && channel.messages);
}

async function buildPayload(state, interaction, ephemeral = false) {
  return buildEmbedPayload({ embeds: buildPreviewEmbeds(state, interaction), actionRows: buttonRows(state), allowUserPing: Boolean(state.allowUserPing), userId: interaction.user?.id || null, ephemeral });
}

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  const s = getSession(i);

  if (customId === 'embed:edit-images' && i.isButton?.()) {
    await i.showModal(imageModal(s));
    return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:save-content-clean:')) {
    markUnsaved(i, saveSelected(s, { title: i.fields.getTextInputValue('title'), description: i.fields.getTextInputValue('description') }));
    await i.reply({ ...buildBuilderPanel(i, panel.memberName(i)), flags: 64 });
    return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:save-appearance:')) {
    markUnsaved(i, saveSelected(s, {
      authorName: i.fields.getTextInputValue('authorName'), authorIcon: i.fields.getTextInputValue('authorIcon'), authorUrl: i.fields.getTextInputValue('authorUrl'),
      footer: i.fields.getTextInputValue('footer'), footerIcon: i.fields.getTextInputValue('footerIcon'),
    }));
    await i.reply({ ...buildBuilderPanel(i, panel.memberName(i)), flags: 64 });
    return true;
  }
  if (i.isModalSubmit?.() && customId.startsWith('embed:save-images:')) {
    markUnsaved(i, saveSelected(s, { thumbnail: i.fields.getTextInputValue('thumbnail'), image: i.fields.getTextInputValue('image') }));
    await i.reply({ ...buildBuilderPanel(i, panel.memberName(i)), flags: 64 });
    return true;
  }

  if (customId === 'embed:update-existing') {
    const deployment = getEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s));
    if (!deployment) return original.handleInteraction(i);
    const channel = i.guild.channels.cache.get(deployment.channelId) || (await i.guild.channels.fetch(deployment.channelId).catch(() => null));
    if (!isTextBasedChannel(channel)) {
      await i.reply({ content: '⚠️ The original embed channel no longer exists or is not text-based.', flags: 64 });
      return true;
    }
    const access = await validateChannelAccess(i.guild, channel.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], { scope: 'embed.update' });
    if (!access.ok) {
      await i.reply({ content: trim(access.message, 1800), flags: 64 });
      return true;
    }
    let message;
    try { message = await channel.messages.fetch(deployment.messageId); } catch { return original.handleInteraction(i); }
    if (!message.flags?.has?.(MessageFlags.IsComponentsV2)) return original.handleInteraction(i);
    let payload;
    try {
      payload = await buildPayload(s, i, false);
      payload.allowedMentions = allowedMentions(s, i);
    } catch (error) {
      console.error('[Embed] update payload failed:', error);
      await i.reply({ content: `❌ The embed could not be built: ${error?.message || error}`, flags: 64 });
      return true;
    }
    try {
      await message.edit(payload);
      saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s), { ...deployment, lastUpdatedBy: i.user.id });
      await i.reply({ content: '✅ Existing embed updated.', flags: 64 });
    } catch (error) {
      console.error('[Embed] failed to update existing embed:', error);
      await i.reply({ content: embedOperationError(error, channel.id, 'update'), flags: 64 });
    }
    return true;
  }

  if (customId !== 'embed:test-send' && customId !== 'embed:use') return original.handleInteraction(i);
  if (customId === 'embed:test-send') {
    try {
      const payload = await buildPayload(s, i, true);
      payload.allowedMentions = allowedMentions(s, i);
      await i.reply(payload);
    } catch (error) {
      console.error('[Embed] test payload failed:', error);
      await i.reply({ content: `❌ Embed test failed: ${error?.message || error}`, flags: 64 });
    }
    return true;
  }

  const channel = i.guild.channels.cache.get(s.channelId) || (await i.guild.channels.fetch(s.channelId).catch(() => null));
  if (!isTextBasedChannel(channel)) {
    await i.reply({ content: 'Invalid channel.', flags: 64 });
    return true;
  }
  const access = await validateChannelAccess(i.guild, channel.id, [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks], { scope: 'embed.deploy' });
  if (!access.ok) {
    await i.reply({ content: trim(access.message, 1800), flags: 64 });
    return true;
  }
  let payload;
  try {
    payload = await buildPayload(s, i, false);
    payload.allowedMentions = allowedMentions(s, i);
  } catch (error) {
    console.error('[Embed] deploy payload failed:', error);
    await i.reply({ content: `❌ Embed could not be built: ${error?.message || error}`, flags: 64 });
    return true;
  }
  let sent;
  try { sent = await channel.send(payload); } catch (error) {
    console.error('[Embed] send failed:', error);
    await i.reply({ content: embedOperationError(error, channel.id, 'send'), flags: 64 });
    return true;
  }
  const presetName = `auto-${s.template || 'custom'}`;
  guildManager.saveEmbedPreset(i.guild.id, presetName, presetData(s), i.guild);
  saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState({ ...s, selectedPreset: presetName }), { channelId: channel.id, messageId: sent.id, template: s.template, preset: presetName, createdBy: i.user.id, lastUpdatedBy: i.user.id });
  const ok = setDefault(i.guild.id, s.template, presetName);
  clearUnsaved(i, { ...s, selectedPreset: presetName });
  await i.reply({ content: ok ? `✅ Embed posted to <#${s.channelId}> and saved as active` : '⚠️ Preset saved, but default assignment failed.', flags: 64 });
  return true;
}

module.exports = { handleInteraction };
