const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const stickyStore = require('./stickyStore');

function canManageSticky(member) {
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
    member?.permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function canBotManageChannel(channel, guildMember) {
  const permissions = channel.permissionsFor(guildMember);

  return Boolean(
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
    permissions?.has(PermissionFlagsBits.SendMessages) &&
    permissions?.has(PermissionFlagsBits.ManageMessages)
  );
}

function normaliseStickyInput(input = {}) {
  return {
    type: input.type === 'embed' ? 'embed' : 'text',
    content: String(input.content || '').trim(),
    embed: input.embed || null,
    repostEvery: Math.max(1, Number(input.repostEvery || 10)),
    cooldownSeconds: Math.max(10, Number(input.cooldownSeconds || 60)),
    updatedBy: input.updatedBy || null,
  };
}

function buildStickyPayload(sticky) {
  if (sticky.type === 'embed') {
    const embedData = sticky.embed || {};
    const embed = new EmbedBuilder()
      .setColor(embedData.color || '#2b7cff')
      .setTitle(embedData.title || 'Sticky Message')
      .setDescription(embedData.description || sticky.content || 'No sticky content set.');

    if (embedData.footer) {
      embed.setFooter({ text: String(embedData.footer).slice(0, 2048) });
    }

    return {
      content: sticky.content && embedData.description ? sticky.content : '',
      embeds: [embed],
    };
  }

  return {
    content: sticky.content || 'No sticky content set.',
    embeds: [],
  };
}

async function deleteOldSticky(channel, sticky) {
  if (!sticky?.lastMessageId) return;

  try {
    const message = await channel.messages.fetch(sticky.lastMessageId);
    if (message?.deletable) await message.delete();
  } catch (error) {
    // Missing/deleted sticky messages are safe to ignore.
  }
}

function isCoolingDown(sticky) {
  if (!sticky.lastPostedAt) return false;

  const lastPosted = new Date(sticky.lastPostedAt).getTime();
  const cooldownMs = Number(sticky.cooldownSeconds || 60) * 1000;

  return Date.now() - lastPosted < cooldownMs;
}

async function repostSticky(channel, sticky, client) {
  if (!channel?.guild || !sticky?.enabled) return null;

  const botMember = channel.guild.members.me;
  if (!canBotManageChannel(channel, botMember)) return null;

  await deleteOldSticky(channel, sticky);

  const sent = await channel.send(buildStickyPayload(sticky));

  stickyStore.updateChannelSticky(
    channel.guild.id,
    channel.id,
    {
      lastMessageId: sent.id,
      lastPostedAt: new Date().toISOString(),
      messageCount: 0,
    },
    client
  );

  return sent;
}

async function handleStickyMessage(message, client) {
  if (!message?.guild || !message?.channel || message.author?.bot) return;

  const data = stickyStore.loadStickyData(message.guild.id, client);
  if (!data.enabled) return;

  const sticky = data.channels[message.channel.id];
  if (!sticky?.enabled) return;
  if (message.id === sticky.lastMessageId) return;

  sticky.messageCount = Number(sticky.messageCount || 0) + 1;

  stickyStore.updateChannelSticky(
    message.guild.id,
    message.channel.id,
    { messageCount: sticky.messageCount },
    client
  );

  if (sticky.messageCount < Number(sticky.repostEvery || 10)) return;
  if (isCoolingDown(sticky)) return;

  await repostSticky(message.channel, sticky, client);
}

async function createSticky(channel, input, client) {
  const sticky = stickyStore.setChannelSticky(
    channel.guild.id,
    channel.id,
    normaliseStickyInput(input),
    client
  );

  return repostSticky(channel, sticky, client);
}

async function pauseSticky(channel, client) {
  return stickyStore.updateChannelSticky(
    channel.guild.id,
    channel.id,
    { enabled: false },
    client
  );
}

async function resumeSticky(channel, client) {
  const sticky = stickyStore.updateChannelSticky(
    channel.guild.id,
    channel.id,
    { enabled: true },
    client
  );

  if (!sticky) return null;
  await repostSticky(channel, sticky, client);
  return sticky;
}

async function removeSticky(channel, client) {
  const sticky = stickyStore.deleteChannelSticky(channel.guild.id, channel.id, client);

  if (sticky?.lastMessageId) {
    await deleteOldSticky(channel, sticky);
  }

  return sticky;
}

module.exports = {
  canManageSticky,
  handleStickyMessage,
  createSticky,
  repostSticky,
  pauseSticky,
  resumeSticky,
  removeSticky,
};
