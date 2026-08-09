'use strict';

// Correctly claim Social Studio account edit modal submissions. The rendered
// custom ID is social:account:update:<accountId>, so the account ID is segment 4.

const creatorCompat = require('../../modules/socialStudio/socialAlerts/socialStudioCreatorActionCompat');
const store = require('../../modules/socialStudio/socialAlerts/socialStudioStore');
const socialPanel = require('../../modules/socialStudio/socialAlerts/socialStudioPanel');
const { normalizeAccountInput } = require('../../modules/socialStudio/socialAlerts/accountNormalizer');

const PREFIX = 'social:account:update:';
const LABEL = { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok', kick: 'Kick', facebook: 'Facebook', instagram: 'Instagram', x: 'X' };

async function handle(interaction) {
  const id = String(interaction?.customId || '');
  if (!id.startsWith(PREFIX) || !interaction.guildId || !interaction.isModalSubmit?.()) return false;

  if (!socialPanel.canManageSocialStudio(interaction)) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.reply({ content: 'You do not have permission to manage Social Studio.', flags: 64 });
    }
    return true;
  }

  const accountId = id.slice(PREFIX.length);
  const account = store.getAccount(interaction.guildId, accountId);
  if (!account) throw new Error('The selected Social Studio account no longer exists.');

  const rawValue = String(interaction.fields.getTextInputValue('accountValue') || '').trim();
  if (!rawValue) throw new Error('Enter a username, channel ID or profile URL.');
  const normalized = normalizeAccountInput(account.platform, rawValue);

  const updated = store.updateAccount(interaction.guildId, accountId, (current) => ({
    ...current,
    username: normalized.username,
    normalizedUsername: normalized.normalizedUsername,
    externalId: normalized.externalId || current.externalId || null,
    inputType: normalized.inputType,
    canonicalIdentity: normalized.canonicalIdentity,
    profileUrl: normalized.profileUrl,
    sourceInput: normalized.sourceInput,
  }), { actorId: interaction.user?.id || null, guild: interaction.guild });

  const message = `✅ Updated ${LABEL[updated.platform] || updated.platform || 'social'} account.`;
  if (!interaction.deferred && !interaction.replied) await interaction.reply({ content: message, flags: 64 });
  else await interaction.followUp({ content: message, flags: 64 }).catch(() => null);
  return true;
}

if (!creatorCompat.__accountManagementUpdateFixPatched) {
  const originalHandle = typeof creatorCompat.handle === 'function' ? creatorCompat.handle.bind(creatorCompat) : async () => false;
  creatorCompat.handle = async function handleWithAccountUpdateFix(interaction) {
    if (await handle(interaction)) return true;
    return originalHandle(interaction);
  };
  creatorCompat.__accountManagementUpdateFixPatched = true;
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    // Loading this file installs the edit-modal fix wrapper.
  },
};
