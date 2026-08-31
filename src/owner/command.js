'use strict';

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
  SlashCommandBuilder,
} = require('discord.js');

const { normalizeBotMode } = require('../config/botModes');
const security = require('../core/security/protection/core');
const devOverride = require('./dev/DevOverrideManager');
const testSecurity = require('./dev/testsecurity');
const auditEvents = require('./auditIntelligence/auditEvents');

const OWNER_PREFIX = 'ownerpanel:';
const wiredClients = new WeakSet();

function mode() {
  return normalizeBotMode(process.env.BOT_MODE);
}

function ownerAllowed(interaction) {
  return Boolean(interaction?.user?.id && security.isBotOwner(interaction.user.id));
}

function ownerDeniedPayload() {
  return {
    content: '❌ This control panel is restricted to the configured Goliath owners.',
    flags: MessageFlags.Ephemeral,
  };
}

function ownerHomePayload(interaction, notice = null) {
  const currentMode = mode();
  const devState = devOverride.readState();
  const billing = devOverride.getPaywallBypassState();
  const isDev = currentMode === 'DEV';
  const ownersLoaded = security.getBotOwnerIds().length;

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle('👑 Goliath Owner Control Panel')
    .setDescription([
      'Private owner-only controls for Goliath development, security testing and the Command Center.',
      '',
      notice ? `**Status:** ${notice}` : null,
    ].filter(Boolean).join('\n'))
    .addFields(
      { name: 'Environment', value: `\`${currentMode}\``, inline: true },
      { name: 'Owner Gate', value: `**${ownersLoaded}** configured owner IDs`, inline: true },
      { name: 'Panel Visibility', value: 'Ephemeral • owner ID checked on every action', inline: true },
      { name: 'DEV Override', value: isDev ? (devState.enabled ? '🟢 Enabled' : '🔴 Disabled') : '⚪ DEV only', inline: true },
      { name: 'DEV Billing Unlock', value: isDev ? (billing.active ? `🟢 ${billing.plan || 'enabled'}` : '🔴 Disabled') : '⚪ DEV only', inline: true },
      { name: 'Security Tests', value: isDev ? '🟢 Available' : '⚪ DEV only', inline: true },
    )
    .setFooter({ text: 'Goliath Owner • OWNER_IDS protected' })
    .setTimestamp();

  const primary = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${OWNER_PREFIX}dev-toggle`)
      .setLabel(devState.enabled ? 'Disable DEV Override' : 'Enable DEV Override')
      .setEmoji('🧪')
      .setStyle(devState.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
      .setDisabled(!isDev),
    new ButtonBuilder()
      .setCustomId(`${OWNER_PREFIX}security`)
      .setLabel('Security Tests')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isDev),
    new ButtonBuilder()
      .setCustomId(`${OWNER_PREFIX}commandcenter`)
      .setLabel('Command Center')
      .setEmoji('📡')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!isDev)
  );

  const navigation = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${OWNER_PREFIX}refresh`)
      .setLabel('Refresh')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [primary, navigation] };
}

async function handleOwnerPanelInteraction(interaction) {
  const id = String(interaction?.customId || '');
  if (!id.startsWith(OWNER_PREFIX) && !id.startsWith('testsecurity:')) return false;

  if (!ownerAllowed(interaction)) {
    if (interaction.deferred || interaction.replied) await interaction.editReply(ownerDeniedPayload()).catch(() => null);
    else await interaction.reply(ownerDeniedPayload()).catch(() => null);
    return true;
  }

  if (id.startsWith('testsecurity:')) {
    await testSecurity.handleButton(interaction);
    return true;
  }

  if (id === `${OWNER_PREFIX}refresh`) {
    await interaction.update(ownerHomePayload(interaction));
    return true;
  }

  if (id === `${OWNER_PREFIX}dev-toggle`) {
    if (!devOverride.isDevMode()) {
      await interaction.update(ownerHomePayload(interaction, 'DEV Override is unavailable outside DEV.'));
      return true;
    }
    const state = devOverride.toggle(interaction.user.id);
    await interaction.update(ownerHomePayload(interaction, state.blocked ? `❌ ${state.reason || 'Toggle blocked.'}` : (state.enabled ? '🟢 DEV Override enabled.' : '🔴 DEV Override disabled.')));
    return true;
  }

  if (id === `${OWNER_PREFIX}security`) {
    if (!devOverride.isDevMode()) {
      await interaction.update(ownerHomePayload(interaction, 'Security test controls are DEV only.'));
      return true;
    }
    await testSecurity.execute(interaction);
    return true;
  }

  if (id === `${OWNER_PREFIX}commandcenter`) {
    if (!devOverride.isDevMode()) {
      await interaction.update(ownerHomePayload(interaction, 'Command Center controls are owned by the DEV control plane.'));
      return true;
    }
    await auditEvents.execute(interaction);
    return true;
  }

  return false;
}

function wireClient(client) {
  if (!client || wiredClients.has(client)) return false;
  wiredClients.add(client);
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      await handleOwnerPanelInteraction(interaction);
    } catch (error) {
      console.error('[OwnerPanel] Interaction failed:', error?.stack || error?.message || error);
      if (!interaction?.replied && !interaction?.deferred) {
        await interaction?.reply?.({ content: '❌ Owner control action failed.', flags: MessageFlags.Ephemeral }).catch(() => null);
      }
    }
  });
  return true;
}

module.exports = {
  category: 'Owner',
  access: { ownerOnly: true },
  data: new SlashCommandBuilder()
    .setName('owner')
    .setDescription('Open the private Goliath owner control panel.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(0n),

  wireClient,
  handleOwnerPanelInteraction,

  async execute(interaction, client) {
    wireClient(client || interaction.client);

    if (!interaction.guild) {
      return interaction.reply({ content: '❌ /owner can only be used inside a server.', flags: MessageFlags.Ephemeral });
    }

    if (!ownerAllowed(interaction)) {
      return interaction.reply(ownerDeniedPayload());
    }

    return interaction.reply({ ...ownerHomePayload(interaction), flags: MessageFlags.Ephemeral });
  },
};
