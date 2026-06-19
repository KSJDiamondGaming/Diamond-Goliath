'use strict';

// src/functions/admin/adminModuleHandler.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  buildAutoRolesPayload,
  buildGiveawaysPayload,
  buildStarboardPayload,
  buildStickyPayload,
  buildSuggestionsPayload,
  buildTempVoicePayload,
  buildVerificationPayload,
} = require('./adminRegisteredModulePayloads');

const {
  resolveAdminModuleKey,
} = require('../../modules/admin/moduleInteractionRouter');

const MODULE_PAYLOAD_BUILDERS = {
  autoRoles: (interaction) => buildAutoRolesPayload(interaction),
  verification: (interaction) => buildVerificationPayload(interaction),
  giveaways: (interaction) => buildGiveawaysPayload(interaction),
  starboard: (interaction) => buildStarboardPayload(interaction),
  tempVoice: (interaction) => buildTempVoicePayload(interaction),
  sticky: (interaction, client) => buildStickyPayload(interaction, client),
  suggestions: (interaction, client) => buildSuggestionsPayload(interaction, client, interaction.customId === 'suggestions:pending' ? { status: 'pending' } : {}),
};

const MODULE_IDS = new Set([
  'admin:modules',
  'admin:embed',
  'admin:autoRoles',
  'admin:verification',
  'admin:giveaways',
  'admin:starboard',
  'admin:tempvoice',
  'admin:sticky',
  'admin:suggestions',
  'admin:tickets',
  'admin:back',

  'autoRoles:refresh',
  'autoRoles:configure',
  'autoRoles:create',
  'autoRoles:toggle',

  'verification:refresh',
  'verification:configure',
  'verification:deploy',
  'verification:toggle',

  'giveaway:create',
  'giveaway:refresh',
  'giveaway:createModal',

  'starboard:configure',
  'starboard:refresh',
  'starboard:configureModal',

  'tempvoice:create',
  'tempvoice:refresh',
  'tempvoice:createModal',

  'suggestions:refresh',
  'suggestions:pending',
  'suggestions:back',
]);

function isAdminModuleInteraction(interaction) {
  const customId = interaction?.customId || '';
  return MODULE_IDS.has(customId) || customId.startsWith('sticky:');
}

function isExpiredInteraction(error) {
  return error?.code === 10062 || error?.code === 40060;
}

async function updateOrReply(interaction, payload) {
  const finalPayload = {
    ...payload,
    flags: payload.flags || MessageFlags.Ephemeral,
  };

  try {
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(finalPayload);
      return true;
    }

    if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
      await interaction.update(payload);
      return true;
    }

    await interaction.reply(finalPayload);
    return true;
  } catch (error) {
    if (isExpiredInteraction(error)) return false;

    try {
      await interaction.reply(finalPayload);
      return true;
    } catch (replyError) {
      if (isExpiredInteraction(replyError)) return false;
      throw replyError;
    }
  }
}

async function showModalSafe(interaction, modal) {
  try {
    if (interaction.deferred || interaction.replied) return true;
    await interaction.showModal(modal);
    return true;
  } catch (error) {
    if (isExpiredInteraction(error)) {
      console.warn(`⚠️ Modal interaction expired: ${interaction.customId}`);
      return true;
    }

    throw error;
  }
}

function getMemberDisplayName(interaction) {
  return (
    interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User'
  );
}

function cleanDiscordId(value) {
  const id = String(value || '').replace(/[<#>@!&]/g, '').trim();
  return /^\d{15,25}$/.test(id) ? id : null;
}

function numberOr(value, fallback, min = 1, max = 999) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function modalInput(id, label, style, options = {}) {
  return new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(options.required !== false)
      .setPlaceholder(options.placeholder || '')
      .setValue(options.value || '')
      .setMaxLength(options.maxLength || (style === TextInputStyle.Paragraph ? 1000 : 100))
  );
}

function getModalValue(interaction, id, fallback = '') {
  return interaction.fields?.getTextInputValue(id)?.trim() || fallback;
}

function moduleButton(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function moduleRow(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

function buildModulesPayload() {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🧩 Modules')
    .setDescription('Manage optional server modules from here.')
    .addFields(
      { name: '🎨 Embed Studio', value: 'Create and send custom embeds', inline: true },
      { name: '🎭 Auto Roles', value: 'Auto roles when members join', inline: true },
      { name: '✅ Verification', value: 'Member verification and onboarding protection', inline: true },
      { name: '📌 Sticky Notes', value: 'Persistent channel notes', inline: true },
      { name: '💡 Suggestions', value: 'Suggestion system', inline: true },
      { name: '🎟️ Tickets', value: 'Support ticket system', inline: true },
      { name: '🎉 Giveaways', value: 'Create and manage giveaways', inline: true },
      { name: '⭐ Starboard', value: 'Highlight starred messages', inline: true },
      { name: '🎤 Temp Voice', value: 'Join-to-create voice rooms', inline: true }
    )
    .setFooter({ text: 'Navigation: Admin Hub › Modules' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      moduleRow(
        moduleButton('admin:embed', '🎨 Embed'),
        moduleButton('admin:autoRoles', '🎭 Auto Roles'),
        moduleButton('admin:verification', '✅ Verification')
      ),
      moduleRow(
        moduleButton('admin:sticky', '📌 Sticky'),
        moduleButton('admin:suggestions', '💡 Suggestions'),
        moduleButton('admin:tickets', '🎟️ Tickets')
      ),
      moduleRow(
        moduleButton('admin:giveaways', '🎉 Giveaways'),
        moduleButton('admin:starboard', '⭐ Starboard'),
        moduleButton('admin:tempvoice', '🎤 Temp Voice')
      ),
      moduleRow(
        moduleButton('admin:back', '⬅️ Back', ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildTicketsPlaceholderPayload() {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🎟️ Tickets')
    .setDescription('Ticket backend is ready. Dashboard/admin panel controls are coming next.')
    .setFooter({ text: 'Goliath Tickets' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      moduleRow(
        moduleButton('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary)
      ),
    ],
  };
}

function buildRegisteredModulePayload(interaction, client) {
  const moduleKey = resolveAdminModuleKey(interaction.customId);
  if (!moduleKey) return null;

  const builder = MODULE_PAYLOAD_BUILDERS[moduleKey];
  if (!builder) return null;

  return builder(interaction, client);
}

function buildGiveawayCreateModal(channelId) {
  return new ModalBuilder()
    .setCustomId('giveaway:createModal')
    .setTitle('Create Giveaway')
    .addComponents(
      modalInput('prize', 'Prize', TextInputStyle.Short, {
        placeholder: 'Nitro, game key, VIP role...',
        maxLength: 100,
      }),
      modalInput('duration', 'Duration', TextInputStyle.Short, {
        placeholder: '10m, 2h, 1d',
        value: '1h',
        maxLength: 20,
      }),
      modalInput('winnerCount', 'Winners', TextInputStyle.Short, {
        placeholder: '1',
        value: '1',
        maxLength: 3,
      }),
      modalInput('channelId', 'Channel ID / mention', TextInputStyle.Short, {
        placeholder: 'Leave as current channel or paste channel ID',
        value: channelId || '',
        required: false,
        maxLength: 40,
      }),
      modalInput('description', 'Description', TextInputStyle.Paragraph, {
        placeholder: 'React with 🎉 to enter.',
        required: false,
        maxLength: 800,
      })
    );
}

function buildStarboardConfigModal() {
  return new ModalBuilder()
    .setCustomId('starboard:configureModal')
    .setTitle('Configure Starboard')
    .addComponents(
      modalInput('channelId', 'Starboard channel ID / mention', TextInputStyle.Short, {
        placeholder: '#starboard or channel ID',
        maxLength: 40,
      }),
      modalInput('threshold', 'Star threshold', TextInputStyle.Short, {
        placeholder: '3',
        value: '3',
        maxLength: 3,
      }),
      modalInput('emoji', 'Emoji', TextInputStyle.Short, {
        placeholder: '⭐',
        value: '⭐',
        required: false,
        maxLength: 40,
      })
    );
}

function buildTempVoiceCreateModal(channelId) {
  return new ModalBuilder()
    .setCustomId('tempvoice:createModal')
    .setTitle('Configure Temp Voice Hub')
    .addComponents(
      modalInput('joinChannelId', 'Join voice channel ID / mention', TextInputStyle.Short, {
        placeholder: 'Voice channel users join to create rooms',
        value: channelId || '',
        maxLength: 40,
      }),
      modalInput('categoryId', 'Category ID / mention', TextInputStyle.Short, {
        placeholder: 'Optional category for created rooms',
        required: false,
        maxLength: 40,
      }),
      modalInput('nameTemplate', 'Room name template', TextInputStyle.Short, {
        placeholder: "{username}'s Channel",
        value: "{username}'s Channel",
        maxLength: 80,
      }),
      modalInput('userLimit', 'User limit', TextInputStyle.Short, {
        placeholder: '0 = unlimited',
        value: '0',
        maxLength: 3,
      })
    );
}

function buildStickySetupModal(channelId) {
  return new ModalBuilder()
    .setCustomId(`sticky:setupModal:${channelId}`)
    .setTitle('Set Sticky Message')
    .addComponents(
      modalInput('content', 'Sticky message', TextInputStyle.Paragraph, {
        placeholder: 'Write the message Goliath should keep at the bottom.',
        maxLength: 1800,
      }),
      modalInput('repostEvery', 'Repost after how many messages?', TextInputStyle.Short, {
        placeholder: '10',
        value: '10',
        maxLength: 3,
      }),
      modalInput('cooldownSeconds', 'Cooldown seconds', TextInputStyle.Short, {
        placeholder: '60',
        value: '60',
        maxLength: 4,
      })
    );
}

async function getChannel(interaction, channelId) {
  return interaction.guild?.channels?.cache?.get(channelId) ||
    await interaction.guild?.channels?.fetch(channelId).catch(() => null);
}

async function handleGiveawayCreateModal(interaction) {
  const giveawayManager = require('../../modules/giveaways/giveawayManager');
  const channelId = cleanDiscordId(getModalValue(interaction, 'channelId')) || interaction.channelId;
  const channel = await getChannel(interaction, channelId);

  if (!channel?.send) {
    await updateOrReply(interaction, {
      content: '❌ Could not find a text channel for the giveaway.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const giveaway = await giveawayManager.createGiveaway(channel, {
    prize: getModalValue(interaction, 'prize', 'Giveaway Prize'),
    duration: getModalValue(interaction, 'duration', '1h'),
    winnerCount: numberOr(getModalValue(interaction, 'winnerCount'), 1, 1, 25),
    description: getModalValue(interaction, 'description', 'React with 🎉 to enter.'),
    hostId: interaction.user.id,
  });

  await updateOrReply(interaction, {
    content: giveaway ? `✅ Giveaway created in <#${channel.id}>.` : '❌ Giveaway could not be created.',
    flags: MessageFlags.Ephemeral,
  });

  return true;
}

async function handleStarboardConfigModal(interaction) {
  const starboardManager = require('../../modules/starboard/starboardManager');
  const channelId = cleanDiscordId(getModalValue(interaction, 'channelId'));

  if (!channelId) {
    await updateOrReply(interaction, {
      content: '❌ Please provide a valid starboard channel ID or mention.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  starboardManager.configureStarboard(interaction.guildId, {
    enabled: true,
    channelId,
    threshold: numberOr(getModalValue(interaction, 'threshold'), 3, 1, 50),
    emoji: getModalValue(interaction, 'emoji', '⭐'),
  });

  await updateOrReply(interaction, buildStarboardPayload(interaction));
  return true;
}

async function handleTempVoiceCreateModal(interaction) {
  const { ChannelType } = require('discord.js');
  const tempVoiceManager = require('../../modules/tempvoice/tempVoiceManager');
  const joinChannelId = cleanDiscordId(getModalValue(interaction, 'joinChannelId'));

  if (!joinChannelId) {
    await updateOrReply(interaction, {
      content: '❌ Please provide a valid voice channel ID or mention.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const joinChannel = await getChannel(interaction, joinChannelId);

  if (!joinChannel || joinChannel.type !== ChannelType.GuildVoice) {
    await updateOrReply(interaction, {
      content: '❌ Temp Voice needs a real voice channel, not a text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  tempVoiceManager.createHub(interaction.guildId, {
    joinChannelId,
    categoryId: cleanDiscordId(getModalValue(interaction, 'categoryId')),
    nameTemplate: getModalValue(interaction, 'nameTemplate', "{username}'s Channel"),
    userLimit: numberOr(getModalValue(interaction, 'userLimit'), 0, 0, 99),
    createdBy: interaction.user.id,
  });

  await updateOrReply(interaction, buildTempVoicePayload(interaction));
  return true;
}

async function handleStickySetupModal(interaction, client) {
  const stickyManager = require('../../modules/sticky/stickyManager');
  const [, , channelId] = String(interaction.customId || '').split(':');
  const channel = await getChannel(interaction, channelId || interaction.channelId);

  if (!channel?.send) {
    await updateOrReply(interaction, {
      content: '❌ Could not find that text channel.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  await stickyManager.createSticky(channel, {
    type: 'text',
    content: getModalValue(interaction, 'content'),
    repostEvery: numberOr(getModalValue(interaction, 'repostEvery'), 10, 1, 100),
    cooldownSeconds: numberOr(getModalValue(interaction, 'cooldownSeconds'), 60, 10, 3600),
    updatedBy: interaction.user.id,
    actor: getMemberDisplayName(interaction),
  }, client);

  await updateOrReply(interaction, buildStickyPayload(interaction, client));
  return true;
}

async function handleStickyAction(interaction, client) {
  const [, action, channelId] = String(interaction.customId || '').split(':');
  const channel = await getChannel(interaction, channelId || interaction.channelId);

  if (action === 'setup') {
    return showModalSafe(interaction, buildStickySetupModal(channelId || interaction.channelId));
  }

  if (!channel) {
    await updateOrReply(interaction, {
      content: '❌ Could not find that channel.',
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const stickyManager = require('../../modules/sticky/stickyManager');
  const stickyStore = require('../../modules/sticky/stickyGuildStore');
  const actor = getMemberDisplayName(interaction);

  if (action === 'repost') {
    const sticky = stickyStore.getChannelSticky(interaction.guildId, channel.id, client);

    if (!sticky) {
      await updateOrReply(interaction, {
        content: '❌ No sticky message is configured for this channel.',
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    await stickyManager.repostSticky(channel, sticky, client, {
      actor,
      actorId: interaction.user.id,
      actorTag: interaction.user.tag,
      manual: true,
    });
  }

  if (action === 'pause') await stickyManager.pauseSticky(channel, client, actor);
  if (action === 'resume') await stickyManager.resumeSticky(channel, client, actor);
  if (action === 'delete') await stickyManager.removeSticky(channel, client, actor);

  await updateOrReply(interaction, buildStickyPayload(interaction, client));
  return true;
}

async function handleAdminModuleInteraction(interaction, client) {
  if (!interaction?.guildId || !isAdminModuleInteraction(interaction)) return false;

  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'giveaway:createModal') return handleGiveawayCreateModal(interaction);
    if (interaction.customId === 'starboard:configureModal') return handleStarboardConfigModal(interaction);
    if (interaction.customId === 'tempvoice:createModal') return handleTempVoiceCreateModal(interaction);
    if (interaction.customId?.startsWith('sticky:setupModal:')) return handleStickySetupModal(interaction, client);
  }

  if (interaction.customId === 'admin:modules' || interaction.customId === 'admin:back' || interaction.customId === 'suggestions:back') {
    await updateOrReply(interaction, buildModulesPayload(interaction));
    return true;
  }

  const registeredPayload = buildRegisteredModulePayload(interaction, client);
  if (registeredPayload) {
    await updateOrReply(interaction, registeredPayload);
    return true;
  }

  if (interaction.customId === 'admin:tickets') {
    await updateOrReply(interaction, buildTicketsPlaceholderPayload());
    return true;
  }

  if (interaction.customId === 'giveaway:create') {
    return showModalSafe(interaction, buildGiveawayCreateModal(interaction.channelId));
  }

  if (interaction.customId === 'starboard:configure') {
    return showModalSafe(interaction, buildStarboardConfigModal());
  }

  if (interaction.customId === 'tempvoice:create') {
    return showModalSafe(interaction, buildTempVoiceCreateModal(interaction.channelId));
  }

  if (interaction.customId?.startsWith('sticky:')) {
    return handleStickyAction(interaction, client);
  }

  return false;
}

module.exports = {
  isAdminModuleInteraction,
  handleAdminModuleInteraction,
};
