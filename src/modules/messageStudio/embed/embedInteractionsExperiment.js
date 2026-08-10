'use strict';

const { PermissionFlagsBits } = require('discord.js');
const original = require('./embedInteractionsLegacy');
const panel = require('./embedPreviewCompat');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const {
  saveEmbedDeployment,
  getDeploymentKeyFromState,
} = require('./embedDeployments');
const { buildComponentsV2Payload } = require('./embedComponentsV2Experiment');

const {
  trim,
  embedOperationError,
  getSession,
  allowedMentions,
  presetData,
  setDefault,
  clearUnsaved,
  buildPreviewEmbeds,
  buttonRows,
} = panel;

function isTextBasedChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isTextBased === 'function') return channel.isTextBased();
  if (typeof channel.isTextBased === 'boolean') return channel.isTextBased;
  return Boolean(channel.send && channel.messages);
}

async function buildV2(state, interaction, ephemeral = false) {
  return buildComponentsV2Payload({
    embeds: buildPreviewEmbeds(state, interaction),
    actionRows: buttonRows(state),
    allowUserPing: Boolean(state.allowUserPing),
    userId: interaction.user?.id || null,
    ephemeral,
  });
}

async function handleInteraction(i) {
  const customId = String(i.customId || '');
  if (customId !== 'embed:test-send' && customId !== 'embed:use') {
    return original.handleInteraction(i);
  }

  const s = getSession(i);

  if (customId === 'embed:test-send') {
    try {
      const payload = await buildV2(s, i, true);
      payload.allowedMentions = allowedMentions(s, i);
      await i.reply(payload);
    } catch (error) {
      console.error('[EmbedV2] test payload failed:', error);
      await i.reply({ content: `❌ Components V2 test failed: ${error?.message || error}`, flags: 64 });
    }
    return true;
  }

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
    { scope: 'embed.deploy.v2-experiment' },
  );
  if (!access.ok) {
    await i.reply({ content: trim(access.message, 1800), flags: 64 });
    return true;
  }

  let payload;
  try {
    payload = await buildV2(s, i, false);
    payload.allowedMentions = allowedMentions(s, i);
  } catch (error) {
    console.error('[EmbedV2] deploy payload failed:', error);
    await i.reply({ content: `❌ Components V2 embed could not be built: ${error?.message || error}`, flags: 64 });
    return true;
  }

  let sent;
  try {
    sent = await channel.send(payload);
  } catch (error) {
    console.error('[EmbedV2] send failed:', error);
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
    renderer: 'components-v2-experiment',
  });
  const ok = setDefault(i.guild.id, s.template, presetName);
  clearUnsaved(i, { ...s, selectedPreset: presetName });

  await i.reply({
    content: ok
      ? `✅ Components V2 embed posted to <#${s.channelId}> and saved as active`
      : '⚠️ Components V2 embed posted, but default assignment failed.',
    flags: 64,
  });
  return true;
}

module.exports = {
  handleInteraction,
};
