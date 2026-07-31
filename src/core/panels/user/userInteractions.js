const {
  buildCategoryPanel,
  buildMainPanel,
  buildModulePanel,
} = require('./userPanel');

function getMemberDisplayName(interaction) {
  return interaction.member?.displayName ||
    interaction.user?.displayName ||
    interaction.user?.username ||
    'Unknown User';
}

async function updatePanel(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return true;
  }

  await interaction.update(payload);
  return true;
}

async function handleUserPanelInteraction(interaction) {
  const customId = String(interaction?.customId || '');
  if (!customId.startsWith('user:')) return false;
  if (!interaction.guild) {
    await interaction.reply({ content: 'This panel can only be used inside a server.', flags: 64 });
    return true;
  }

  const memberDisplayName = getMemberDisplayName(interaction);

  if (customId === 'user:home') {
    return updatePanel(interaction, buildMainPanel(memberDisplayName));
  }

  if (interaction.isStringSelectMenu?.() && customId === 'user:search') {
    const [moduleKey] = interaction.values || [];
    return updatePanel(interaction, buildModulePanel(moduleKey, memberDisplayName));
  }

  const categoryMatch = customId.match(/^user:category:([a-zA-Z0-9_-]+)$/);
  if (categoryMatch && interaction.isButton?.()) {
    return updatePanel(interaction, buildCategoryPanel(categoryMatch[1], memberDisplayName));
  }

  const moduleMatch = customId.match(/^user:module:([a-zA-Z0-9_-]+)$/);
  if (moduleMatch && interaction.isButton?.()) {
    return updatePanel(interaction, buildModulePanel(moduleMatch[1], memberDisplayName));
  }

  return false;
}

module.exports = {
  handleUserPanelInteraction,
};
