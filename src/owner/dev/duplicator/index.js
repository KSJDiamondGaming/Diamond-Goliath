'use strict';

const {
  ChannelType,
  Client,
  EmbedBuilder,
  GuildChannelManager,
  PermissionFlagsBits,
  PermissionOverwriteManager,
  Role,
} = require('discord.js');
const core = require('./core');
const selective = require('./selective');

const BOOTSTRAP_KEY = Symbol.for('goliath.duplicator.bridge-bootstrap');
const OVERWRITE_PATCH_KEY = Symbol.for('goliath.duplicator.permission-overwrite-exact');
const CHANNEL_CREATE_PATCH_KEY = Symbol.for('goliath.duplicator.channel-create-compat-v2');
const ROLE_ORDER_PATCH_KEY = Symbol.for('goliath.duplicator.role-order-v2');
const SNAPSHOT_PATCH_KEY = Symbol.for('goliath.duplicator.snapshot-bot-role-remap');
const roleOrderState = new WeakMap();

function duplicatorReason(value) {
  return String(value || '').startsWith('Goliath duplicator:');
}

function temporaryBotOverwrite(guild) {
  const botId = guild?.client?.user?.id;
  const me = guild?.members?.me;
  if (!botId || !me) return null;
  let allow = 0n;
  for (const bit of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]) {
    if (me.permissions?.has(bit)) allow |= bit;
  }
  return allow ? { id: botId, type: 1, allow, deny: 0n } : null;
}

// Snapshot correction: a manually-created role named for Goliath can be assigned to the
// source bot even though Discord does not mark it as managed. Treat that specific bot role
// as a remap-only dependency so selective copy does not create a second fake Goliath role.
if (!core[SNAPSHOT_PATCH_KEY]) {
  const originalSnapshot = core.snapshot.bind(core);
  Object.defineProperty(core, SNAPSHOT_PATCH_KEY, { value: true });
  core.snapshot = function goliathDuplicatorSnapshot(guild, selectedOptions) {
    const snap = originalSnapshot(guild, selectedOptions);
    const sourceBot = guild.members.me;
    const botRoleIds = new Set(sourceBot?.roles?.cache?.keys?.() || []);
    const pseudoManaged = [];

    snap.roles = (snap.roles || []).filter((role) => {
      const isBotAssigned = botRoleIds.has(role.id);
      const looksLikeGoliath = /(^|\W)goliath($|\W)/i.test(String(role.name || ''));
      if (!isBotAssigned || !looksLikeGoliath) return true;
      pseudoManaged.push({
        ...role,
        managed: true,
        tags: { botId: guild.client.user?.id || null, integrationId: null, subscriptionListingId: null },
        remapOnly: true,
      });
      return false;
    });

    const managedById = new Map((snap.managedRoles || []).map((role) => [role.id, role]));
    for (const role of pseudoManaged) managedById.set(role.id, role);
    snap.managedRoles = [...managedById.values()];
    if (snap.stats) {
      snap.stats.roles = snap.roles.length;
      snap.stats.managedRoles = snap.managedRoles.length;
    }
    return snap;
  };
}

selective.configure(core);

if (!Client.prototype[BOOTSTRAP_KEY]) {
  const originalLogin = Client.prototype.login;
  Object.defineProperty(Client.prototype, BOOTSTRAP_KEY, { value: true });
  Client.prototype.login = function goliathDuplicatorLogin(...args) {
    core.initializeBridge(this);
    return originalLogin.apply(this, args);
  };
}

// Create every transferred channel/category with a temporary bot-member overwrite. This
// prevents a restricted parent category from locking the bot out of a newly-created child
// before the child's exact source overwrites can be written. Unsupported special channel
// types are retried as the closest normal Discord equivalent instead of failing the copy.
if (GuildChannelManager?.prototype?.create && !GuildChannelManager.prototype[CHANNEL_CREATE_PATCH_KEY]) {
  const originalCreate = GuildChannelManager.prototype.create;
  Object.defineProperty(GuildChannelManager.prototype, CHANNEL_CREATE_PATCH_KEY, { value: true });
  GuildChannelManager.prototype.create = async function goliathDuplicatorChannelCreate(options = {}) {
    if (!duplicatorReason(options.reason)) return originalCreate.call(this, options);

    const guild = this.guild;
    const payload = { ...options };
    const hasCommunity = new Set(guild?.features || []).has('COMMUNITY');
    const botOverwrite = temporaryBotOverwrite(guild);

    if (!hasCommunity) {
      if (payload.type === ChannelType.GuildStageVoice) payload.type = ChannelType.GuildVoice;
      else if ([ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(payload.type)) payload.type = ChannelType.GuildText;
    }

    if (payload.type === ChannelType.GuildStageVoice) delete payload.userLimit;
    if (botOverwrite && !payload.permissionOverwrites) payload.permissionOverwrites = [botOverwrite];

    try {
      return await originalCreate.call(this, payload);
    } catch (error) {
      if (![50024, 50035].includes(Number(error?.code))) throw error;

      let fallbackType = payload.type;
      if (fallbackType === ChannelType.GuildStageVoice) fallbackType = ChannelType.GuildVoice;
      else if ([ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(fallbackType)) fallbackType = ChannelType.GuildText;

      const minimal = { name: payload.name, type: fallbackType, reason: payload.reason };
      if (payload.parent) minimal.parent = payload.parent;
      if (botOverwrite) minimal.permissionOverwrites = [botOverwrite];
      if (fallbackType === ChannelType.GuildVoice) {
        if (payload.bitrate) minimal.bitrate = payload.bitrate;
        if (payload.rtcRegion) minimal.rtcRegion = payload.rtcRegion;
      }
      return originalCreate.call(this, minimal);
    }
  };
}

// Preserve the relative source order of copied roles. Source absolute positions cannot be
// reused in a different destination hierarchy, so copied roles form a contiguous block
// immediately below Goliath's highest role while retaining their source low->high order.
if (Role?.prototype?.setPosition && !Role.prototype[ROLE_ORDER_PATCH_KEY]) {
  const originalSetPosition = Role.prototype.setPosition;
  Object.defineProperty(Role.prototype, ROLE_ORDER_PATCH_KEY, { value: true });
  Role.prototype.setPosition = async function goliathDuplicatorRoleOrder(position, reason) {
    if (String(reason || '') !== 'Goliath duplicator: role order') {
      return originalSetPosition.call(this, position, reason);
    }

    const guild = this.guild;
    const now = Date.now();
    let state = roleOrderState.get(guild);
    if (!state || now - state.lastTouch > 2500) state = { entries: new Map(), lastTouch: now };
    state.lastTouch = now;
    state.entries.set(this.id, { role: this, sourcePosition: Number(position || 0) });
    roleOrderState.set(guild, state);

    const ordered = [...state.entries.values()]
      .filter((entry) => guild.roles.cache.has(entry.role.id))
      .sort((a, b) => a.sourcePosition - b.sourcePosition);
    const botHighest = Number(guild.members.me?.roles?.highest?.position || 1);
    const top = Math.max(1, botHighest - 1);
    const start = Math.max(1, top - ordered.length + 1);

    for (let index = 0; index < ordered.length; index += 1) {
      const target = Math.min(top, start + index);
      await originalSetPosition.call(ordered[index].role, target, 'Goliath duplicator: relative role order');
    }
    return this;
  };
}

// Write EXACT source category/channel overwrites, not a materialised category merge. A
// child that was synced remains synced when its source overwrite set matches the category;
// a child with explicit overrides remains deliberately unsynced. Temporary bot access is
// included only while Discord applies/verifies the transfer and is removed afterwards.
if (PermissionOverwriteManager?.prototype?.set && !PermissionOverwriteManager.prototype[OVERWRITE_PATCH_KEY]) {
  const originalSet = PermissionOverwriteManager.prototype.set;
  Object.defineProperty(PermissionOverwriteManager.prototype, OVERWRITE_PATCH_KEY, { value: true });
  PermissionOverwriteManager.prototype.set = async function goliathDuplicatorPermissionSet(overwrites, reason) {
    const reasonText = String(reason || '');
    const channel = this.channel;
    const isDuplicatorTransfer = reasonText.startsWith('Goliath duplicator: least-privilege channel/category permissions');
    if (!isDuplicatorTransfer || !channel?.guild) return originalSet.call(this, overwrites, reason);

    const explicit = Array.isArray(overwrites) ? [...overwrites] : [...(overwrites || [])];
    const botOverwrite = temporaryBotOverwrite(channel.guild);
    const botId = channel.guild.client.user?.id;
    const sourceHadBotMemberOverwrite = botId && explicit.some((item) => String(item.id) === String(botId) && Number(item.type) === 1);

    const payload = [...explicit];
    if (botOverwrite && !sourceHadBotMemberOverwrite) payload.push(botOverwrite);

    let result;
    try {
      result = await originalSet.call(this, payload, reason);
    } catch (error) {
      // A stale inherited restriction can still cause 50001/50013 on some channel types.
      // Re-assert temporary member access first, then retry the exact source payload.
      if (![50001, 50013].includes(Number(error?.code)) || !botOverwrite) throw error;
      await this.edit(botId, { ViewChannel: true, ManageChannels: true, ManageRoles: true }, { reason: 'Goliath duplicator: temporary transfer access' });
      result = await originalSet.call(this, payload, reason);
    }

    if (botId && botOverwrite && !sourceHadBotMemberOverwrite) {
      setTimeout(() => {
        channel.permissionOverwrites.delete(botId, 'Goliath duplicator: remove temporary transfer access').catch((error) => {
          console.warn(`[Duplicator] Temporary access cleanup failed for ${channel.name}: ${error.message}`);
        });
      }, 2500).unref?.();
    }

    return result;
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
            '**Stages:** Roles → Role Order → Categories → Channels → Exact Category/Channel Permissions → Verification → Transfer Manifest',
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
