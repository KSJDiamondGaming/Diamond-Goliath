'use strict';

const {
  ChannelType,
  Client,
  EmbedBuilder,
  GuildChannelManager,
  PermissionFlagsBits,
  PermissionOverwriteManager,
  PermissionsBitField,
  Role,
} = require('discord.js');
const core = require('./core');
const selective = require('./selective');

const BOOTSTRAP_KEY = Symbol.for('goliath.duplicator.bridge-bootstrap');
const OVERWRITE_PATCH_KEY = Symbol.for('goliath.duplicator.permission-overwrite-per-target');
const CHANNEL_CREATE_PATCH_KEY = Symbol.for('goliath.duplicator.channel-create-compat');
const ROLE_ORDER_PATCH_KEY = Symbol.for('goliath.duplicator.role-order');
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
  for (const bit of [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]) {
    if (me.permissions?.has(bit)) allow |= bit;
  }
  return allow ? { id: botId, type: 1, allow, deny: 0n } : null;
}

function overwriteOptions(item) {
  const options = {};
  let allowNames = [];
  let denyNames = [];
  try { allowNames = new PermissionsBitField(BigInt(item.allow || 0)).toArray(); } catch {}
  try { denyNames = new PermissionsBitField(BigInt(item.deny || 0)).toArray(); } catch {}
  for (const name of allowNames) options[name] = true;
  for (const name of denyNames) options[name] = false;
  return options;
}

// Snapshot correction for local-source copies. Remote snapshots retain their ordinary
// source roles unless Discord marks them managed; this avoids guessing about custom roles.
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

// Structure creation stays permission-neutral. Exact permission reconstruction happens
// only after roles/categories/channels exist and source IDs can be mapped safely.
if (GuildChannelManager?.prototype?.create && !GuildChannelManager.prototype[CHANNEL_CREATE_PATCH_KEY]) {
  const originalCreate = GuildChannelManager.prototype.create;
  Object.defineProperty(GuildChannelManager.prototype, CHANNEL_CREATE_PATCH_KEY, { value: true });
  GuildChannelManager.prototype.create = async function goliathDuplicatorChannelCreate(options = {}) {
    if (!duplicatorReason(options.reason)) return originalCreate.call(this, options);

    const guild = this.guild;
    const payload = { ...options };
    const hasCommunity = new Set(guild?.features || []).has('COMMUNITY');

    if (!hasCommunity) {
      if (payload.type === ChannelType.GuildStageVoice) payload.type = ChannelType.GuildVoice;
      else if ([ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(payload.type)) payload.type = ChannelType.GuildText;
    }

    if (payload.type === ChannelType.GuildStageVoice) delete payload.userLimit;
    delete payload.permissionOverwrites;

    try {
      return await originalCreate.call(this, payload);
    } catch (error) {
      if (![50024, 50035].includes(Number(error?.code))) throw error;

      let fallbackType = payload.type;
      if (fallbackType === ChannelType.GuildStageVoice) fallbackType = ChannelType.GuildVoice;
      else if ([ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildMedia].includes(fallbackType)) fallbackType = ChannelType.GuildText;

      const minimal = { name: payload.name, type: fallbackType, reason: payload.reason };
      if (payload.parent) minimal.parent = payload.parent;
      if (fallbackType === ChannelType.GuildVoice) {
        if (payload.bitrate) minimal.bitrate = payload.bitrate;
        if (payload.rtcRegion) minimal.rtcRegion = payload.rtcRegion;
      }
      return originalCreate.call(this, minimal);
    }
  };
}

// Preserve copied roles as a contiguous source-ordered block below Goliath's highest
// manageable role instead of reusing meaningless absolute positions from another guild.
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

// Rebuild source overwrites without replacing a child channel's inherited category
// permissions with the temporary bot member. Apply mapped role/member targets explicitly,
// @everyone last, remove extras only after successful upserts, and always clean temporary
// bot access even when a single target fails.
if (PermissionOverwriteManager?.prototype?.set && !PermissionOverwriteManager.prototype[OVERWRITE_PATCH_KEY]) {
  const originalSet = PermissionOverwriteManager.prototype.set;
  Object.defineProperty(PermissionOverwriteManager.prototype, OVERWRITE_PATCH_KEY, { value: true });
  PermissionOverwriteManager.prototype.set = async function goliathDuplicatorPermissionSet(overwrites, reason) {
    const reasonText = String(reason || '');
    const channel = this.channel;
    const isDuplicatorTransfer = reasonText.startsWith('Goliath duplicator: least-privilege channel/category permissions') || reasonText.startsWith('Goliath duplicator: exact channel/category permissions');
    if (!isDuplicatorTransfer || !channel?.guild) return originalSet.call(this, overwrites, reason);

    const expected = Array.isArray(overwrites) ? [...overwrites] : [...(overwrites || [])];
    const guild = channel.guild;
    const botOverwrite = temporaryBotOverwrite(guild);
    const botId = guild.client.user?.id;
    const sourceHadBotMemberOverwrite = Boolean(
      botId && expected.some((item) => String(item.id) === String(botId) && Number(item.type) === 1),
    );
    const expectedIds = new Set(expected.map((item) => String(item.id)));
    const failures = [];

    const upsertExplicit = async (item, targetReason) => {
      const options = overwriteOptions(item);
      if (typeof this.upsert === 'function') {
        return this.upsert(item.id, options, { type: Number(item.type), reason: targetReason });
      }
      return this.edit(item.id, options, targetReason);
    };

    try {
      // Never bulk-replace the channel with only the Goliath member. That was the reason
      // child channels ended up showing @everyone + .Goliath.#xxxx and no mapped roles.
      if (botOverwrite && !sourceHadBotMemberOverwrite) {
        await upsertExplicit(botOverwrite, 'Goliath duplicator: temporary transfer access');
      }

      // Role overwrites first, member overwrites next, @everyone last. This minimizes the
      // chance that a restrictive @everyone rule removes useful access before mapped roles
      // have been written.
      const ordered = [...expected].sort((a, b) => {
        const aEveryone = String(a.id) === String(guild.id);
        const bEveryone = String(b.id) === String(guild.id);
        if (aEveryone !== bEveryone) return aEveryone ? 1 : -1;
        return Number(a.type) - Number(b.type);
      });

      for (const item of ordered) {
        try {
          await upsertExplicit(item, `Goliath duplicator: mapped overwrite ${item.id}`);
        } catch (error) {
          failures.push({
            id: String(item.id),
            code: Number(error?.code) || null,
            message: error?.message || String(error),
          });
        }
      }

      // Refresh before pruning inherited/extraneous targets. Source channel overwrites are
      // authoritative: inherited entries that do not exist on an intentionally unsynced
      // source channel must be removed from the destination.
      const refreshed = await guild.channels.fetch(channel.id).catch(() => null);
      const cache = refreshed?.permissionOverwrites?.cache || channel.permissionOverwrites?.cache;
      if (cache) {
        for (const overwrite of cache.values()) {
          const id = String(overwrite.id);
          if (expectedIds.has(id)) continue;
          if (botId && id === String(botId) && !sourceHadBotMemberOverwrite) continue;
          try {
            await channel.permissionOverwrites.delete(id, 'Goliath duplicator: remove non-source overwrite');
          } catch (error) {
            failures.push({
              id,
              code: Number(error?.code) || null,
              message: `Cleanup failed: ${error?.message || String(error)}`,
            });
          }
        }
      }

      if (failures.length) {
        const details = failures
          .slice(0, 8)
          .map((item) => `${item.id}${item.code ? ` [${item.code}]` : ''}: ${item.message}`)
          .join('; ');
        const error = new Error(`Permission targets failed on ${channel.name}: ${details}`);
        error.code = failures.find((item) => item.code)?.code || 'DUPLICATOR_PERMISSION_TARGETS';
        throw error;
      }

      return channel.permissionOverwrites;
    } finally {
      // A temporary Goliath *member* overwrite must never be the final copied permission.
      // Always remove it for channels, including failure paths. Categories keep it briefly
      // so restrictive parents cannot block their child channel pass, then it is removed.
      if (botId && botOverwrite && !sourceHadBotMemberOverwrite) {
        if (channel.type === ChannelType.GuildCategory) {
          setTimeout(() => {
            channel.permissionOverwrites.delete(botId, 'Goliath duplicator: remove temporary category access').catch((error) => {
              console.warn(`[Duplicator] Temporary category access cleanup failed for ${channel.name}: ${error.message}`);
            });
          }, 8000).unref?.();
        } else {
          await channel.permissionOverwrites.delete(botId, 'Goliath duplicator: remove temporary transfer access').catch((error) => {
            console.warn(`[Duplicator] Temporary access cleanup failed for ${channel.name}: ${error.message}`);
          });
        }
      }
    }
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
            '**Stages:** Roles → Role Order → Categories → Channels → Exact Per-Target Category/Channel Permissions → Verification → Transfer Manifest',
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
