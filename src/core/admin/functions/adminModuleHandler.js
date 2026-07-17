'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputStyle,
} = require('discord.js');

const {
  buildAutoRolesPayload,
  buildGiveawaysPayload,
  buildStickyPayload,
  buildSuggestionsPayload,
  buildVerificationPayload,
} = require('./adminRegisteredModulePayloads');
const { buildInviteStudioPayload, handleInviteStudioInteraction } = require('../../../modules/invites/invitesAdminPanel');
const {
  cleanDiscordId,
  getChannel,
  getModalValue,
  modalInput,
  numberOr,
  showModalSafe,
  updateOrReply,
} = require('./handlers/adminHandlerUtils');
const { handleStarboardConfigureButton, handleStarboardConfigModal } = require('./handlers/starboardHandler');
const { handleTempVoiceCreateButton, handleTempVoiceCreateModal } = require('./handlers/tempVoiceHandler');
const { handleStickyAction, handleStickySetupModal } = require('./handlers/stickyHandler');
const { resolveAdminModuleKey } = require('../../modules/admin/moduleInteractionRouter');

const MODULE_PAYLOAD_BUILDERS = {
  autoRoles: (interaction) => buildAutoRolesPayload(interaction),
  verification: (interaction) => buildVerificationPayload(interaction),
  giveaways: (interaction) => buildGiveawaysPayload(interaction),
  sticky: (interaction, client) => buildStickyPayload(interaction, client),
  suggestions: (interaction, client) => buildSuggestionsPayload(interaction, client, interaction.customId === 'suggestions:pending' ? { status: 'pending' } : {}),
  invites: (interaction) => buildInviteStudioPayload(interaction),
};

const MODULE_IDS = new Set([
  'admin:modules', 'admin:embed', 'admin:autoRoles', 'admin:verification', 'admin:giveaways',
  'admin:starboard', 'admin:tempvoice', 'admin:sticky', 'admin:suggestions', 'admin:tickets',
  'admin:invites', 'admin:back',
  'autoRoles:refresh', 'autoRoles:configure', 'autoRoles:create', 'autoRoles:toggle',
  'verification:refresh', 'verification:configure', 'verification:deploy', 'verification:toggle',
  'giveaway:create', 'giveaway:refresh', 'giveaway:createModal',
  'starboard:configure', 'starboard:refresh', 'starboard:configureModal',
  'tempvoice:create', 'tempvoice:refresh', 'tempvoice:createModal',
  'suggestions:refresh', 'suggestions:pending', 'suggestions:back',
]);

function isAdminModuleInteraction(interaction) {
  const customId = interaction?.customId || '';
  return MODULE_IDS.has(customId) || customId.startsWith('sticky:') || customId.startsWith('invites:');
}

const moduleButton = (customId, label, style = ButtonStyle.Primary) => new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
const moduleRow = (...buttons) => new ActionRowBuilder().addComponents(...buttons);

function buildModulesPayload() {
  const embed = new EmbedBuilder()
    .setColor('#5865F2')
    .setTitle('🧩 Modules')
    .setDescription('Manage optional server modules from here. All Invite Studio controls live inside this panel.')
    .addFields(
      { name: '🎨 Embed Studio', value: 'Create and send custom embeds', inline: true },
      { name: '🎭 Auto Roles', value: 'Auto roles when members join', inline: true },
      { name: '✅ Verification', value: 'Member verification and onboarding protection', inline: true },
      { name: '📨 Invite Studio', value: 'Create invite links, attach roles and track joins', inline: true },
      { name: '📌 Sticky Notes', value: 'Persistent channel notes', inline: true },
      { name: '💡 Suggestions', value: 'Suggestion system', inline: true },
      { name: '🎟️ Tickets', value: 'Support ticket system', inline: true },
      { name: '🎉 Giveaways', value: 'Create and manage giveaways', inline: true },
      { name: '⭐ Starboard', value: 'Highlight starred messages', inline: true },
      { name: '🎤 Temp Voice', value: 'Join-to-create voice rooms', inline: true },
    )
    .setFooter({ text: 'Navigation: Admin Hub › Modules' })
    .setTimestamp();

  return {
    embeds: [embed],
    components: [
      moduleRow(moduleButton('admin:embed', '🎨 Embed'), moduleButton('admin:autoRoles', '🎭 Auto Roles'), moduleButton('admin:verification', '✅ Verification')),
      moduleRow(moduleButton('admin:invites', '📨 Invite Studio'), moduleButton('admin:sticky', '📌 Sticky'), moduleButton('admin:suggestions', '💡 Suggestions')),
      moduleRow(moduleButton('admin:tickets', '🎟️ Tickets'), moduleButton('admin:giveaways', '🎉 Giveaways'), moduleButton('admin:starboard', '⭐ Starboard')),
      moduleRow(moduleButton('admin:tempvoice', '🎤 Temp Voice'), moduleButton('admin:back', '⬅️ Back', ButtonStyle.Secondary)),
    ],
  };
}

function buildTicketsPlaceholderPayload() {
  return {
    embeds: [new EmbedBuilder().setColor('#5865F2').setTitle('🎟️ Tickets').setDescription('Ticket backend is ready. Dashboard/admin panel controls are coming next.').setFooter({ text: 'Goliath Tickets' }).setTimestamp()],
    components: [moduleRow(moduleButton('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary))],
  };
}

function buildRegisteredModulePayload(interaction, client) {
  const moduleKey = resolveAdminModuleKey(interaction.customId);
  const builder = moduleKey ? MODULE_PAYLOAD_BUILDERS[moduleKey] : null;
  return builder ? builder(interaction, client) : null;
}

function buildGiveawayCreateModal(channelId) {
  return new ModalBuilder().setCustomId('giveaway:createModal').setTitle('Create Giveaway').addComponents(
    modalInput('prize', 'Prize', TextInputStyle.Short, { placeholder: 'Community prize, role reward, event reward...', maxLength: 100 }),
    modalInput('duration', 'Duration', TextInputStyle.Short, { placeholder: '10m, 2h, 1d', value: '1h', maxLength: 20 }),
    modalInput('winnerCount', 'Winners', TextInputStyle.Short, { placeholder: '1', value: '1', maxLength: 3 }),
    modalInput('channelId', 'Channel ID / mention', TextInputStyle.Short, { placeholder: 'Leave as current channel or paste channel ID', value: channelId || '', required: false, maxLength: 40 }),
    modalInput('description', 'Description', TextInputStyle.Paragraph, { placeholder: 'React to enter.', required: false, maxLength: 800 }),
  );
}

async function handleGiveawayCreateModal(interaction) {
  const giveawayManager = require('../../modules/giveaways/giveawayManager');
  const channelId = cleanDiscordId(getModalValue(interaction, 'channelId')) || interaction.channelId;
  const channel = await getChannel(interaction, channelId);
  if (!channel?.send) {
    await updateOrReply(interaction, { content: 'Could not find a text channel for the giveaway.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const giveaway = await giveawayManager.createGiveaway(channel, {
    prize: getModalValue(interaction, 'prize', 'Giveaway Prize'),
    duration: getModalValue(interaction, 'duration', '1h'),
    winnerCount: numberOr(getModalValue(interaction, 'winnerCount'), 1, 1, 25),
    description: getModalValue(interaction, 'description', 'React to enter.'),
    hostId: interaction.user.id,
  });
  await updateOrReply(interaction, { content: giveaway ? `Giveaway created in <#${channel.id}>.` : 'Giveaway could not be created.', flags: MessageFlags.Ephemeral });
  return true;
}

async function handleAdminModuleInteraction(interaction, client) {
  if (!interaction?.guildId || !isAdminModuleInteraction(interaction)) return false;

  if (String(interaction.customId || '').startsWith('invites:')) return handleInviteStudioInteraction(interaction);

  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'giveaway:createModal') return handleGiveawayCreateModal(interaction);
    if (interaction.customId === 'starboard:configureModal') return handleStarboardConfigModal(interaction);
    if (interaction.customId === 'tempvoice:createModal') return handleTempVoiceCreateModal(interaction);
    if (interaction.customId?.startsWith('sticky:setupModal:')) return handleStickySetupModal(interaction, client);
  }

  if (interaction.customId === 'admin:modules' || interaction.customId === 'admin:back' || interaction.customId === 'suggestions:back') {
    await updateOrReply(interaction, buildModulesPayload());
    return true;
  }

  const registeredPayload = buildRegisteredModulePayload(interaction, client);
  if (registeredPayload) {
    await updateOrReply(interaction, registeredPayload);
    return true;
  }

  if (interaction.customId === 'admin:tickets') { await updateOrReply(interaction, buildTicketsPlaceholderPayload()); return true; }
  if (interaction.customId === 'giveaway:create') return showModalSafe(interaction, buildGiveawayCreateModal(interaction.channelId));
  if (interaction.customId === 'starboard:configure') return handleStarboardConfigureButton(interaction);
  if (interaction.customId === 'tempvoice:create') return handleTempVoiceCreateButton(interaction);
  if (interaction.customId?.startsWith('sticky:')) return handleStickyAction(interaction, client);
  return false;
}

module.exports = { isAdminModuleInteraction, handleAdminModuleInteraction };
