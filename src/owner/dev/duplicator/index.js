'use strict';

const {
  Client,
  EmbedBuilder,
  PermissionOverwriteManager,
} = require('discord.js');
const core = require('./core');
const selective = require('./selective');
selective.configure(core);

const BOOTSTRAP_KEY = Symbol.for('goliath.duplicator.bridge-bootstrap');
const OVERWRITE_PATCH_KEY = Symbol.for('goliath.duplicator.permission-overwrite-merge');

if (!Client.prototype[BOOTSTRAP_KEY]) {
  const originalLogin = Client.prototype.login;
  Object.defineProperty(Client.prototype, BOOTSTRAP_KEY, { value: true });
  Client.prototype.login = function goliathDuplicatorLogin(...args) {
    core.initializeBridge(this);
    return originalLogin.apply(this, args);
  };
}

// Discord channel permission overwrites inherit from their parent category when an
// overwrite is omitted. During a selective transfer we create the category first,
// then the child channel. The core subsequently replaces the child's overwrite set.
// If the source child relied on category inheritance, replacing that set with only
// the child's explicit entries drops the category roles from the channel. Merge the
// destination parent overwrites into the child set, with explicit child entries
// winning, so the transferred channel keeps the same effective role permissions.
if (PermissionOverwriteManager?.prototype?.set && !PermissionOverwriteManager.prototype[OVERWRITE_PATCH_KEY]) {
  const originalSet = PermissionOverwriteManager.prototype.set;
  Object.defineProperty(PermissionOverwriteManager.prototype, OVERWRITE_PATCH_KEY, { value: true });
  PermissionOverwriteManager.prototype.set = async function goliathDuplicatorPermissionSet(overwrites, reason) {
    const reasonText = String(reason || '');
    const channel = this.channel;
    const isDuplicatorTransfer = reasonText.startsWith('Goliath duplicator: least-privilege channel/category permissions');
    const parent = channel?.parent;

    if (!isDuplicatorTransfer || !parent?.permissionOverwrites?.cache) {
      return originalSet.call(this, overwrites, reason);
    }

    const merged = new Map();
    for (const overwrite of parent.permissionOverwrites.cache.values()) {
      merged.set(String(overwrite.id), {
        id: overwrite.id,
        type: overwrite.type,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      });
    }
    for (const overwrite of overwrites || []) {
      merged.set(String(overwrite.id), overwrite);
    }

    return originalSet.call(this, [...merged.values()], reason);
  };
}

function installRunningState(interaction) {
  if (!interaction?.customId?.startsWith('dupselect:') || !interaction.customId.endsWith(':copy-now')) return;
  if (typeof interaction.deferUpdate !== 'function' || typeof interaction.update !== 'function') return;

  const originalDeferUpdate = interaction.deferUpdate.bind(interaction);
  interaction.deferUpdate = async function goliathDuplicatorRunningUpdate() {
    try {
      return await interaction.update({
        embeds: [new EmbedBuilder()
          .setColor(0x5865f2)
          .setTitle('🔄 Selective Copy Running')
          .setDescription([
            'Goliath is applying this transfer now.',
            '',
            '**Stages:** Roles → Categories → Channels → Permissions → Verification → Transfer Manifest',
            '',
            'The confirmation controls have been removed so this transfer cannot be started twice. The result will replace this message when the copy finishes.',
          ].join('\n'))
          .setTimestamp()],
        components: [],
      });
    } catch {
      return originalDeferUpdate();
    }
  };
}

async function run(interaction) {
  const action = interaction?.options?.getString?.('action', true);
  if (action === 'copy') return selective.startCopy(interaction);
  return core.run(interaction);
}

async function handleInteraction(interaction) {
  installRunningState(interaction);
  if (await selective.handleInteraction(interaction)) return true;
  return core.handleInteraction(interaction);
}

module.exports = { ...core, run, handleInteraction, selective };
