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
selective.configure(core);

const BOOTSTRAP_KEY = Symbol.for('goliath.duplicator.bridge-bootstrap');
const OVERWRITE_PATCH_KEY = Symbol.for('goliath.duplicator.permission-overwrite-merge');
const CHANNEL_CREATE_PATCH_KEY = Symbol.for('goliath.duplicator.channel-create-compat');
const ROLE_ORDER_PATCH_KEY = Symbol.for('goliath.duplicator.role-order');
const roleOrderState = new WeakMap();

if (!Client.prototype[BOOTSTRAP_KEY]) {
  const originalLogin = Client.prototype.login;
  Object.defineProperty(Client.prototype, BOOTSTRAP_KEY, { value: true });
  Client.prototype.login = function goliathDuplicatorLogin(...args) {
    core.initializeBridge(this);
    return originalLogin.apply(this, args);
  };
}

function duplicatorReason(value) {
  return String(value || '').startsWith('Goliath duplicator:');
}

// Some Discord channel types are only legal when the destination has Community enabled.
// Selective copy must preserve the useful equivalent rather than failing the entire
// structure stage. Stage -> Voice, Announcement/Forum/Media -> Text when Community is off.
if (GuildChannelManager?.prototype?.create && !GuildChannelManager.prototype[CHANNEL_CREATE_PATCH_KEY]) {
  const originalCreate = GuildChannelManager.prototype.create;
  Object.defineProperty(GuildChannelManager.prototype, CHANNEL_CREATE_PATCH_KEY, { value: true });
  GuildChannelManager.prototype.create = async function goliathDuplicatorChannelCreate(options = {}) {
    if (!duplicatorReason(options.reason)) return originalCreate.call(this, options);

    const guild = this.guild;
    const hasCommunity = new Set(guild?.features || []).has('COMMUNITY');
    const payload = { ...options };

    if (!hasCommunity) {
      if (payload.type === ChannelType.GuildStageVoice) payload.type = ChannelType.GuildVoice;
      else if ([ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(payload.type)) payload.type = ChannelType.GuildText;
    }

    // Stage channels do not accept the same creation payload as normal voice channels.
    if (payload.type === ChannelType.GuildStageVoice) delete payload.userLimit;

    try {
      return await originalCreate.call(this, payload);
    } catch (error) {
      if (Number(error?.code) !== 50024) throw error;

      // Retry the same logical channel with a minimal, type-safe payload. This catches
      // destination feature/type mismatches without duplicating an already-created object.
      const minimal = {
        name: payload.name,
        type: payload.type,
        reason: payload.reason,
      };
      if (payload.parent) minimal.parent = payload.parent;
      if (payload.type === ChannelType.GuildVoice) {
        if (payload.bitrate) minimal.bitrate = payload.bitrate;
        if (payload.rtcRegion) minimal.rtcRegion = payload.rtcRegion;
      }
      return originalCreate.call(this, minimal);
    }
  };
}

// Core records each copied role's source position and then calls Role#setPosition.
// Absolute source positions do not make sense in a destination containing other roles.
// Preserve the copied roles' RELATIVE source order and keep the copied block directly
// below Goliath's highest role, without moving pre-existing destination roles.
if (Role?.prototype?.setPosition && !Role.prototype[ROLE_ORDER_PATCH_KEY]) {
  const originalSetPosition = Role.prototype.setPosition;
  Object.defineProperty(Role.prototype, ROLE_ORDER_PATCH_KEY, { value: true });
  Role.prototype.setPosition = async function goliathDuplicatorRoleOrder(position, reason) {
    if (String(reason || '') !== 'Goliath duplicator: role order') {
      return originalSetPosition.call(this, position, reason);
    }

    const guild = this.guild;
    let state = roleOrderState.get(guild);
    if (!state) {
      state = new Map();
      roleOrderState.set(guild, state);
    }
    state.set(this.id, { role: this, sourcePosition: Number(position || 0) });

    const ordered = [...state.values()].sort((a, b) => a.sourcePosition - b.sourcePosition);
    const botHighest = Number(guild.members.me?.roles?.highest?.position || 1);
    const top = Math.max(1, botHighest - 1);
    const start = Math.max(1, top - ordered.length + 1);

    for (let index = 0; index < ordered.length; index += 1) {
      const entry = ordered[index];
      const target = Math.min(top, start + index);
      await originalSetPosition.call(entry.role, target, 'Goliath duplicator: relative role order');
    }
    return this;
  };
}

function manageableParentOverwrite(channel, overwrite) {
  if (!channel?.guild) return true;
  if (String(overwrite.id) === String(channel.guild.id)) return true;
  if (Number(overwrite.type) !== 0) return true;
  const role = channel.guild.roles.cache.get(String(overwrite.id));
  if (!role) return false;
  const botHighest = Number(channel.guild.members.me?.roles?.highest?.position || 0);
  return role.position < botHighest;
}

// Keep effective category inheritance while preserving explicit channel overwrites.
// During writes, temporarily give the destination bot member enough channel-level access
// to finish the transfer. This prevents a category overwrite from locking Goliath out
// before its children and their explicit overwrites have been applied/verified.
if (PermissionOverwriteManager?.prototype?.set && !PermissionOverwriteManager.prototype[OVERWRITE_PATCH_KEY]) {
  const originalSet = PermissionOverwriteManager.prototype.set;
  Object.defineProperty(PermissionOverwriteManager.prototype, OVERWRITE_PATCH_KEY, { value: true });
  PermissionOverwriteManager.prototype.set = async function goliathDuplicatorPermissionSet(overwrites, reason) {
    const reasonText = String(reason || '');
    const channel = this.channel;
    const isDuplicatorTransfer = reasonText.startsWith('Goliath duplicator: least-privilege channel/category permissions');

    if (!isDuplicatorTransfer || !channel?.guild) {
      return originalSet.call(this, overwrites, reason);
    }

    const explicit = Array.isArray(overwrites) ? overwrites : [...(overwrites || [])];
    const explicitIds = new Set(explicit.map((item) => String(item.id)));
    const merged = new Map();
    const parent = channel.parent;

    // Only materialise inherited category entries that Goliath can actually manage.
    // Explicit child entries always win over inherited ones.
    if (parent?.permissionOverwrites?.cache) {
      for (const overwrite of parent.permissionOverwrites.cache.values()) {
        if (!manageableParentOverwrite(channel, overwrite)) continue;
        merged.set(String(overwrite.id), {
          id: overwrite.id,
          type: overwrite.type,
          allow: overwrite.allow.bitfield,
          deny: overwrite.deny.bitfield,
        });
      }
    }
    for (const overwrite of explicit) merged.set(String(overwrite.id), overwrite);

    const botId = channel.guild.client.user?.id;
    const hadExplicitBotMember = botId ? explicitIds.has(String(botId)) : false;
    if (botId && !hadExplicitBotMember) {
      let temporaryAllow = 0n;
      const me = channel.guild.members.me;
      for (const bit of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ManageRoles]) {
        if (me?.permissions?.has(bit)) temporaryAllow |= bit;
      }
      if (temporaryAllow) {
        merged.set(String(botId), { id: botId, type: 1, allow: temporaryAllow, deny: 0n });
      }
    }

    const payload = [...merged.values()];
    const result = await originalSet.call(this, payload, reason);

    // Remove only the temporary member overwrite after core has had time to refetch and
    // verify the expected source overwrites. The delete request is authorised while the
    // temporary allow is still active, so the final Discord state does not keep a bypass.
    if (botId && !hadExplicitBotMember && merged.has(String(botId))) {
      setTimeout(() => {
        channel.permissionOverwrites.delete(botId, 'Goliath duplicator: remove temporary transfer access').catch((error) => {
          console.warn(`[Duplicator] Temporary access cleanup failed for ${channel.name}: ${error.message}`);
        });
      }, 5000).unref?.();
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
            '**Stages:** Roles → Role Order → Categories → Channels → Explicit Channel Permissions → Verification → Transfer Manifest',
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
