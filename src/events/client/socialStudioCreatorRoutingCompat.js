'use strict';

// Install Social Studio automatic-post routing ahead of the main interaction
// handler without adding another competing interactionCreate listener.

const crypto = require('crypto');
const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');
const creatorRoutingCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorRoutingCompat');
const creatorRoutingLegacyFix = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorRoutingLegacyFix');
const userChannelRouting = require('../../modules/socialStudio/socialAlerts/socialStudioUserChannelRouting');
const store = require('../../modules/socialStudio/socialAlerts/socialStudioStore');
const socialPanel = require('../../modules/socialStudio/socialAlerts/socialStudioPanel');

creatorRoutingCompat.installStoreCompatibility();
userChannelRouting.installStoreCompatibility();

function makeCreatorId(config) {
  let creatorId;
  do {
    creatorId = `creator_${crypto.randomBytes(8).toString('hex')}`;
  } while (config.creators?.[creatorId]);
  return creatorId;
}

function clean(value, max) {
  return String(value || '').trim().slice(0, max);
}

async function handleCreatorCreate(interaction) {
  if (String(interaction?.customId || '') !== 'social:creator:create') return false;
  if (!interaction.guildId || !interaction.isModalSubmit?.()) return false;

  if (!socialPanel.canManageSocialStudio(interaction)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'You do not have permission to manage Social Studio.', flags: 64 });
    }
    return true;
  }

  const displayName = clean(interaction.fields.getTextInputValue('displayName'), 120);
  if (!displayName) throw new Error('Creator display name is required.');

  const config = store.getConfig(interaction.guildId);
  config.creators = config.creators && typeof config.creators === 'object' ? { ...config.creators } : {};

  const creatorId = makeCreatorId(config);
  const timestamp = new Date().toISOString();
  config.creators[creatorId] = {
    creatorId,
    displayName,
    group: clean(interaction.fields.getTextInputValue('group'), 120),
    tags: clean(interaction.fields.getTextInputValue('tags'), 300)
      .split(',')
      .map((value) => value.trim().slice(0, 60))
      .filter(Boolean),
    notes: clean(interaction.fields.getTextInputValue('notes'), 1000),
    adminNotes: clean(interaction.fields.getTextInputValue('adminNotes'), 1000),
    enabled: true,
    status: 'active',
    accountIds: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  store.saveConfig(interaction.guildId, config, {
    actorId: interaction.user?.id || null,
    guild: interaction.guild,
  });

  const payload = socialPanel.buildSectionPanel(interaction, 'creators');
  if (interaction.isFromMessage?.()) {
    await interaction.update(payload);
    await interaction.followUp({ content: `✅ Created creator profile **${displayName}**.`, flags: 64 }).catch(() => null);
  } else if (!interaction.deferred && !interaction.replied) {
    await interaction.reply({ content: `✅ Created creator profile **${displayName}**.`, flags: 64 });
  } else {
    await interaction.followUp({ content: `✅ Created creator profile **${displayName}**.`, flags: 64 }).catch(() => null);
  }

  return true;
}

if (!creatorCompat.__creatorRoutingCompatPatched) {
  const originalHandle = typeof creatorCompat.handle === 'function'
    ? creatorCompat.handle.bind(creatorCompat)
    : async () => false;

  creatorCompat.handle = async function handleWithCreatorRouting(interaction) {
    if (await handleCreatorCreate(interaction)) return true;

    // The user/content/channel router owns the new usable multi-user flow and
    // must run before the older creator-wide compatibility screens.
    if (await userChannelRouting.handle(interaction)) return true;
    if (await creatorRoutingLegacyFix.handle(interaction)) return true;
    if (await creatorRoutingCompat.handle(interaction)) return true;
    return originalHandle(interaction);
  };

  creatorCompat.__creatorRoutingCompatPatched = true;
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    // Loading this file installs the compatibility wrappers above.
  },
};
