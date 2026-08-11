'use strict';

const { MessageFlags, PermissionFlagsBits } = require('discord.js');
const original = require('./embedInteractionsLegacy');
const panel = require('./embedPreviewCompat');
const guildManager = require('../../../core/guild/guildManager');
const { validateChannelAccess } = require('../../../core/security/goliathPermissionGuard');
const {
  saveEmbedDeployment,
  getEmbedDeployment,
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
  const s = getSession(i);

  if (customId === 'embed:update-existing') {
    const deployment = getEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s));
    if (!deployment) {
      return original.handleInteraction(i);
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

    let message;
    try {
      message = await channel.messages.fetch(deployment.messageId);
    } catch {
      return original.handleInteraction(i);
    }

    const isV2Message = Boolean(
      deployment?.renderer === 'components-v2-experiment'
      || message.flags?.has?.(MessageFlags.IsComponentsV2)
      || ((Number(message.flags?.bitfield ?? message.flags ?? 0) & Number(MessageFlags.IsComponentsV2)) !== 0),
    );

    if (!isV2Message) {
      return original.handleInteraction(i);
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
      { scope: 'embed.update.v2' },
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
      console.error('[EmbedV2] update payload failed:', error);
      await i.reply({
        content: `❌ The embed could not be built: ${error?.message || error}`,
        flags: 64,
      });
      return true;
    }

    try {
      await message.edit(payload);
      saveEmbedDeployment(i.guild.id, getDeploymentKeyFromState(s), {
        ...deployment,
        lastUpdatedBy: i.user.id,
        renderer: 'components-v2-experiment',
      });
      await i.reply({ content: '✅ Existing embed updated.', flags: 64 });
    } catch (error) {
      console.error('[EmbedV2] failed to update existing embed:', error);
      await i.reply({ content: embedOperationError(error, channel.id, 'update'), flags: 64 });
    }
    return true;
  }

  if (customId !== 'embed:test-send' && customId !== 'embed:use') {
    return original.handleInteraction(i);
  }

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
      ? `✅ Embed posted to <#${s.channelId}> and saved as active`
      : '⚠️ Preset saved, but default assignment failed.',
    flags: 64,
  });
  return true;
}

module.exports = {
  handleInteraction,
};
