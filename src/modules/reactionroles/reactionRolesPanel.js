'use strict';

// Compatibility router used by the central interaction handler.
// The root hub must remain available even when an individual child module has
// a load error, so all Role Studio implementations are loaded lazily.
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} = require('discord.js');

// interactionCreate.js loads this compatibility router before the generic
// Admin module handler. Install the canonical module registry and shared
// navigation wrappers at startup from this guaranteed load point.
try {
  require('../../core/admin/functions/adminModuleRuntimePatch').install();
} catch (error) {
  console.error('[AdminModules] Runtime patch failed to install:', error?.stack || error?.message || error);
}

function displayName(interaction) {
  return interaction.member?.displayName
    || interaction.user?.displayName
    || interaction.user?.username
    || 'Unknown User';
}

function row(...components) {
  return new ActionRowBuilder().addComponents(...components.filter(Boolean));
}

function button(customId, label, style = ButtonStyle.Primary) {
  return new ButtonBuilder().setCustomId(customId).setLabel(label).setStyle(style);
}

function buildFallbackHub(memberDisplayName = 'Unknown User', loadError = null) {
  const description = [
    'Manage every automated role system in one place.',
    '',
    'Choose a role system below.',
  ];

  if (loadError) {
    description.push('', '⚠️ Live role statistics are temporarily unavailable, but each role system can still be opened independently.');
  }

  return {
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🎭 Role Studio')
      .setDescription(description.join('\n'))
      .setFooter({ text: `Requested by ${memberDisplayName}` })
      .setTimestamp()],
    components: [
      row(
        button('admin:autoRoles', '👥 Auto Roles'),
        button('admin:reactionRoles:open', '😊 Reaction Roles'),
      ),
      row(
        button('admin:timedRoles', '⏳ Timed Roles'),
        button('admin:reactionRoles:temporary', '⚡ Temporary Roles'),
      ),
      row(
        button('admin:reactionRoles:analytics', '📊 Role Analytics', ButtonStyle.Secondary),
        button('admin:reactionRoles:health', '🩺 Role Health', ButtonStyle.Secondary),
      ),
      row(
        button('admin:modules', '⬅️ Back to Modules', ButtonStyle.Secondary),
        button('admin:home', '🏠 Admin Home', ButtonStyle.Secondary),
      ),
    ],
  };
}

function applySharedShell(interaction, payload) {
  try {
    const runtimePatch = require('../../core/admin/functions/adminModuleRuntimePatch');
    return runtimePatch.standardizeModuleChrome(payload, interaction, 'reactionRoles');
  } catch (error) {
    console.error('[RoleStudio] Shared module shell failed:', error?.stack || error?.message || error);
    return payload;
  }
}

async function updateInteraction(interaction, payload) {
  const standardizedPayload = applySharedShell(interaction, payload);

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(standardizedPayload);
    return true;
  }

  await interaction.update(standardizedPayload);
  return true;
}

function loadRoleStudioPanel() {
  try {
    return require('../roleStudio/roleStudioPanel');
  } catch (error) {
    console.error('[RoleStudio] Hub panel failed to load:', error?.stack || error?.message || error);
    return null;
  }
}

function loadReactionRolesPanel() {
  try {
    return require('../roleStudio/reactionRoles/reactionRolesPanel');
  } catch (error) {
    console.error('[RoleStudio] Reaction Roles panel failed to load:', error?.stack || error?.message || error);
    throw new Error(`Reaction Roles is unavailable: ${String(error?.message || error).slice(0, 250)}`);
  }
}

function loadTemporaryRolesPanel() {
  try {
    return require('../roleStudio/temporaryRoles/temporaryRolesPanel');
  } catch (error) {
    console.error('[RoleStudio] Temporary Roles panel failed to load:', error?.stack || error?.message || error);
    throw new Error(`Temporary Roles is unavailable: ${String(error?.message || error).slice(0, 250)}`);
  }
}

async function handleReactionRolesAdminInteraction(interaction) {
  const customId = String(interaction.customId || '');

  if (customId === 'admin:reactionRoles') {
    const roleStudioPanel = loadRoleStudioPanel();
    let payload;

    if (typeof roleStudioPanel?.buildRoleStudioPanel === 'function') {
      try {
        payload = await roleStudioPanel.buildRoleStudioPanel(
          interaction.guild,
          displayName(interaction)
        );
      } catch (error) {
        console.error('[RoleStudio] Hub build failed:', error?.stack || error?.message || error);
        payload = buildFallbackHub(displayName(interaction), error);
      }
    } else {
      payload = buildFallbackHub(displayName(interaction), new Error('Hub panel unavailable'));
    }

    return updateInteraction(interaction, payload);
  }

  if (customId === 'admin:reactionRoles:analytics') {
    const roleStudioPanel = loadRoleStudioPanel();
    if (typeof roleStudioPanel?.buildRoleAnalyticsPanel !== 'function') {
      throw new Error('Role Studio analytics is unavailable.');
    }
    const payload = await roleStudioPanel.buildRoleAnalyticsPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (customId === 'admin:reactionRoles:health') {
    const roleStudioPanel = loadRoleStudioPanel();
    if (typeof roleStudioPanel?.buildRoleHealthPanel !== 'function') {
      throw new Error('Role Studio health is unavailable.');
    }
    const payload = await roleStudioPanel.buildRoleHealthPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (customId.startsWith('admin:reactionRoles:temporary')) {
    const temporaryRolesPanel = loadTemporaryRolesPanel();
    return temporaryRolesPanel.handleTemporaryRolesInteraction(interaction);
  }

  const reactionRolesPanel = loadReactionRolesPanel();

  if (customId === 'admin:reactionRoles:open') {
    if (typeof reactionRolesPanel.buildReactionRolesAdminPanel !== 'function') {
      throw new Error('Reaction Roles panel builder is unavailable.');
    }

    const payload = await reactionRolesPanel.buildReactionRolesAdminPanel(
      interaction.guild,
      displayName(interaction)
    );
    return updateInteraction(interaction, payload);
  }

  if (typeof reactionRolesPanel.handleReactionRolesAdminInteraction !== 'function') {
    return false;
  }

  return reactionRolesPanel.handleReactionRolesAdminInteraction(interaction);
}

module.exports = {
  buildFallbackHub,
  handleReactionRolesAdminInteraction,
};
