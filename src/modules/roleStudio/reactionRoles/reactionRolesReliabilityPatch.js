'use strict';

const { PermissionsBitField } = require('discord.js');
const reactionRoles = require('./reactionRoles');

const installed = Symbol.for('goliath.roleStudio.reliabilityPatch');

const PERMISSION_DETAILS = Object.freeze({
  ViewChannel: {
    label: 'View Channel',
    reason: 'Goliath must be able to see the selected channel and its messages.',
  },
  SendMessages: {
    label: 'Send Messages',
    reason: 'Goliath must be able to post the new reaction-role panel.',
  },
  EmbedLinks: {
    label: 'Embed Links',
    reason: 'Goliath must be able to display the selected Embed Studio template.',
  },
  ReadMessageHistory: {
    label: 'Read Message History',
    reason: 'Goliath must be able to retrieve and verify the panel message before adding reactions.',
  },
  AddReactions: {
    label: 'Add Reactions',
    reason: 'Goliath must be able to place the configured emojis on the panel message.',
  },
  UseExternalEmojis: {
    label: 'Use External Emojis',
    reason: 'One or more configured emojis come from another server.',
  },
  ManageRoles: {
    label: 'Manage Roles',
    reason: 'Goliath must be able to add and remove the selected roles from members.',
  },
});

function emojiDescriptor(value) {
  const raw = String(value || '').trim();
  const custom = raw.match(/^<a?:([A-Za-z0-9_]+):(\d{15,25})>$/);
  if (custom) return { raw, id: custom[2], name: custom[1], reactValue: custom[2] };
  if (/^\d{15,25}$/.test(raw)) return { raw, id: raw, name: null, reactValue: raw };
  return { raw, id: null, name: raw, reactValue: raw };
}

function findReaction(message, emoji) {
  return message.reactions.cache.find((reaction) => (
    emoji.id ? reaction.emoji.id === emoji.id : reaction.emoji.id == null && reaction.emoji.name === emoji.name
  )) || null;
}

function channelLabel(channel) {
  return channel?.id ? `<#${channel.id}>` : 'the selected channel';
}

function permissionIssue(permission, location) {
  const detail = PERMISSION_DETAILS[permission] || { label: permission, reason: 'This access is required to complete deployment.' };
  return {
    code: `missing_${permission.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`).replace(/^_/, '')}`,
    title: `${detail.label} is missing`,
    reason: detail.reason,
    location,
  };
}

function roleHierarchyIssues(guild, mappings = []) {
  const me = guild.members.me;
  if (!me) return [{
    code: 'bot_member_unavailable',
    title: 'Goliath could not verify its server role',
    reason: 'Discord did not provide Goliath’s member record, so role hierarchy could not be checked safely.',
    location: 'Server roles',
  }];

  const issues = [];
  if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    issues.push(permissionIssue('ManageRoles', 'Server role permissions'));
    return issues;
  }

  for (const mapping of mappings.filter((item) => item?.enabled !== false)) {
    const role = guild.roles.cache.get(String(mapping.roleId));
    if (!role) {
      issues.push({
        code: 'role_not_found',
        title: `Role ${mapping.roleId} no longer exists`,
        reason: 'A configured role was deleted or is no longer available in this server.',
        location: 'Role mapping',
      });
      continue;
    }
    if (role.managed) {
      issues.push({
        code: 'managed_role',
        title: `@${role.name} is controlled by another integration`,
        reason: 'Discord does not allow Goliath to assign integration-managed roles.',
        location: 'Server roles',
      });
      continue;
    }
    if (role.position >= me.roles.highest.position) {
      issues.push({
        code: 'role_hierarchy',
        title: `Goliath cannot manage @${role.name}`,
        reason: `Discord only allows Goliath to manage roles below its highest role, @${me.roles.highest.name}.`,
        location: 'Server role hierarchy',
        fix: `Move @${me.roles.highest.name} above @${role.name} in Server Settings → Roles.`,
      });
    }
  }
  return issues;
}

function externalEmojiRequired(guild, mappings = []) {
  return mappings.some((mapping) => {
    const emoji = emojiDescriptor(mapping?.emoji);
    return Boolean(emoji.id && !guild.emojis.cache.has(emoji.id));
  });
}

async function resolveChannel(guild, channelId) {
  return guild.channels.cache.get(String(channelId))
    || await guild.channels.fetch(String(channelId)).catch(() => null);
}

async function inspectDeployment({ guild, channelId, mappings = [], createMessage = false }) {
  const channel = await resolveChannel(guild, channelId);
  const issues = [];

  if (!channel) {
    issues.push({
      code: 'channel_inaccessible',
      title: 'The selected channel is inaccessible',
      reason: 'The channel may have been deleted, or its permission overrides prevent Goliath from viewing it.',
      location: `Channel ID ${channelId}`,
    });
    return { channel: null, issues: [...issues, ...roleHierarchyIssues(guild, mappings)] };
  }

  const me = guild.members.me;
  const effective = me && typeof channel.permissionsFor === 'function' ? channel.permissionsFor(me) : null;
  const required = ['ViewChannel', 'ReadMessageHistory', 'AddReactions'];
  if (createMessage) required.push('SendMessages', 'EmbedLinks');
  if (externalEmojiRequired(guild, mappings)) required.push('UseExternalEmojis');

  if (!effective) {
    issues.push({
      code: 'channel_permissions_unavailable',
      title: 'Goliath could not verify channel permissions',
      reason: 'Discord did not return effective permission information for the selected channel.',
      location: channelLabel(channel),
    });
  } else {
    for (const permission of required) {
      const flag = PermissionsBitField.Flags[permission];
      if (flag && !effective.has(flag)) issues.push(permissionIssue(permission, channelLabel(channel)));
    }
  }

  issues.push(...roleHierarchyIssues(guild, mappings));
  return { channel, issues };
}

function detailedAccessError({ guild, channel, issues, originalError = null, operation = 'deploy this reaction panel' }) {
  const unique = Array.from(new Map(issues.map((issue) => [`${issue.code}:${issue.title}`, issue])).values());
  const lines = [
    '❌ **Reaction Panel Could Not Be Created**',
    '',
    `Goliath does not currently have enough access to ${operation}${channel ? ` in ${channelLabel(channel)}` : ''}.`,
    '',
    `### Issue${unique.length === 1 ? '' : 's'} detected`,
  ];

  unique.forEach((issue, index) => {
    lines.push('', `**${index + 1}. ❌ ${issue.title}**`, `📍 **Where:** ${issue.location}`, `ℹ️ **Why:** ${issue.reason}`);
    if (issue.fix) lines.push(`🛠️ **Fix:** ${issue.fix}`);
  });

  lines.push(
    '',
    '### How to fix channel access',
    '1. Open the selected channel and choose **Edit Channel**.',
    '2. Open **Permissions** and select the **Goliath** role.',
    '3. Allow every permission listed above.',
    '4. Check the parent category if the channel inherits its permissions.',
    '5. For role hierarchy issues, open **Server Settings → Roles** and move Goliath above every role it must assign.',
    '6. Return to the builder and retry deployment.',
    '',
    '🛡️ **No panel was created and no configuration was changed. Your setup draft has been preserved.**',
  );

  const error = new Error(lines.join('\n').slice(0, 3900));
  error.name = 'ReactionRoleAccessError';
  error.code = 'REACTION_ROLE_ACCESS';
  error.userFacing = true;
  error.issues = unique;
  error.cause = originalError || undefined;
  error.guildId = guild?.id || null;
  return error;
}

function looksLikeAccessError(error) {
  const code = String(error?.code || error?.rawError?.code || '');
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return ['50001', '50013', 'MissingAccess', 'MissingPermissions'].includes(code)
    || name === 'DiscordAPIError'
    || message.includes('missing access')
    || message.includes('missing permissions')
    || message.includes('above goliath')
    || message.includes('manage roles');
}

async function preflightOrThrow(context) {
  const report = await inspectDeployment(context);
  if (report.issues.length) {
    throw detailedAccessError({
      guild: context.guild,
      channel: report.channel,
      issues: report.issues,
      operation: context.createMessage ? 'create this reaction panel' : 'attach reactions to this message',
    });
  }
  return report.channel;
}

async function diagnoseAndThrow(error, context) {
  if (error?.userFacing || error?.code === 'REACTION_ROLE_ACCESS') throw error;
  if (!looksLikeAccessError(error)) throw error;

  const report = await inspectDeployment(context);
  const issues = report.issues.length ? report.issues : [{
    code: 'discord_missing_access',
    title: 'Discord denied access to the selected channel or message',
    reason: 'A channel, category, role, or integration override is blocking an action required by the panel.',
    location: report.channel ? channelLabel(report.channel) : `Channel ID ${context.channelId}`,
  }];

  throw detailedAccessError({
    guild: context.guild,
    channel: report.channel,
    issues,
    originalError: error,
    operation: context.createMessage ? 'create this reaction panel' : 'attach reactions to this message',
  });
}

async function fetchMessage(guild, channelId, messageId) {
  const channel = await resolveChannel(guild, channelId);
  if (!channel?.messages?.fetch) {
    throw detailedAccessError({
      guild,
      channel,
      issues: [{
        code: 'message_channel_inaccessible',
        title: 'Goliath cannot access the selected message channel',
        reason: 'View Channel and Read Message History are required to retrieve the panel message.',
        location: channel ? channelLabel(channel) : `Channel ID ${channelId}`,
      }],
      operation: 'access this reaction panel',
    });
  }
  const message = await channel.messages.fetch({ message: messageId, force: true }).catch(async () => (
    channel.messages.fetch(messageId).catch(() => null)
  ));
  if (!message) throw new Error('The selected message is no longer accessible. It may have been deleted, or Goliath may be unable to read it.');
  return message;
}

async function botOwnsReaction(reaction, botId) {
  if (!reaction) return false;
  if (reaction.me === true) return true;
  const users = await reaction.users.fetch({ limit: 100 }).catch(() => null);
  return Boolean(users?.has(botId));
}

async function ensureAllPanelReactions(guild, panel) {
  if (!panel || panel.enabled === false) return panel;
  const activeMappings = (panel.mappings || []).filter((mapping) => mapping.enabled !== false);
  if (!activeMappings.length) return panel;

  await preflightOrThrow({ guild, channelId: panel.channelId, mappings: activeMappings, createMessage: false });

  const botId = guild.members.me?.id || guild.client.user?.id;
  if (!botId) throw new Error('Goliath could not resolve its own member identity.');

  let message = await fetchMessage(guild, panel.channelId, panel.messageId);
  const failures = [];

  for (const mapping of activeMappings) {
    const emoji = emojiDescriptor(mapping.emoji);
    if (!emoji.raw) {
      failures.push('An empty emoji mapping was found.');
      continue;
    }

    let reaction = findReaction(message, emoji);
    if (!await botOwnsReaction(reaction, botId)) {
      let added = false;
      let lastError = null;
      for (let attempt = 1; attempt <= 3 && !added; attempt += 1) {
        try {
          await message.react(emoji.reactValue);
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
          message = await fetchMessage(guild, panel.channelId, panel.messageId);
          reaction = findReaction(message, emoji);
          added = await botOwnsReaction(reaction, botId);
        } catch (error) {
          lastError = error;
        }
      }
      if (!added) {
        await diagnoseAndThrow(lastError || new Error('Goliath could not confirm its reaction.'), {
          guild,
          channelId: panel.channelId,
          mappings: activeMappings,
          createMessage: false,
        });
      }
    }
  }

  if (failures.length) throw new Error(`Not every reaction could be applied. ${failures.join(' | ')}`);

  return reactionRoles.savePanel(guild.id, {
    ...panel,
    status: 'healthy',
    lastHealthAt: new Date().toISOString(),
    lastError: null,
  }, guild);
}

async function clearAllPanelReactions(guild, panel) {
  const botId = guild.members.me?.id || guild.client.user?.id;
  if (!botId) throw new Error('Goliath could not resolve its own member identity.');

  const activeMappings = (panel.mappings || []).filter((mapping) => mapping.enabled !== false);
  let message = await fetchMessage(guild, panel.channelId, panel.messageId);
  const failures = [];

  for (const mapping of activeMappings) {
    const emoji = emojiDescriptor(mapping.emoji);
    let cleared = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 3 && !cleared; attempt += 1) {
      try {
        const reaction = findReaction(message, emoji);
        if (!reaction || !await botOwnsReaction(reaction, botId)) {
          cleared = true;
          break;
        }

        await reaction.users.remove(botId);
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        message = await fetchMessage(guild, panel.channelId, panel.messageId);
        const refreshed = findReaction(message, emoji);
        cleared = !await botOwnsReaction(refreshed, botId);
      } catch (error) {
        lastError = error;
      }
    }

    if (!cleared) failures.push(`${mapping.emoji}: ${lastError?.message || 'Goliath could not confirm removal.'}`);
  }

  if (failures.length) throw new Error(`Not every configured reaction could be cleared. ${failures.join(' | ')}`);
  return true;
}

function deploymentContext(name, args) {
  if (name === 'createFromTemplate' || name === 'attachExistingMessage') {
    const options = args[0] || {};
    return {
      guild: options.guild,
      channelId: options.channelId,
      mappings: options.mappings || [],
      createMessage: name === 'createFromTemplate',
    };
  }

  const guild = args[0];
  const panelId = args[1];
  const panel = guild?.id && panelId ? reactionRoles.getPanel(guild.id, panelId) : null;
  return {
    guild,
    channelId: panel?.channelId,
    mappings: panel?.mappings || [],
    createMessage: false,
  };
}

function wrap(name) {
  const original = reactionRoles[name];
  if (typeof original !== 'function') return;
  reactionRoles[name] = async (...args) => {
    const context = deploymentContext(name, args);
    if (context.guild && context.channelId) await preflightOrThrow(context);

    let result;
    try {
      result = await original(...args);
    } catch (error) {
      if (context.guild && context.channelId) await diagnoseAndThrow(error, context);
      throw error;
    }

    const guild = args[0]?.guild || args[0];
    const panel = result?.panelId ? result : result?.panel;
    if (guild?.id && panel?.panelId) return ensureAllPanelReactions(guild, panel);
    return result;
  };
}

function wrapDetachPanel() {
  const original = reactionRoles.detachPanel;
  if (typeof original !== 'function') return;

  reactionRoles.detachPanel = async (guild, panelId, options = {}) => {
    if (!options.clearReactions) return original(guild, panelId, options);

    const panel = reactionRoles.getPanel(guild.id, panelId);
    if (!panel) throw new Error('Reaction-role panel not found.');

    await clearAllPanelReactions(guild, panel);
    const result = await original(guild, panelId, { ...options, clearReactions: false });
    return { ...result, reactionsCleared: true };
  };
}

if (!reactionRoles[installed]) {
  Object.defineProperty(reactionRoles, installed, { value: true });
  wrap('attachExistingMessage');
  wrap('createFromTemplate');
  wrap('updatePanelMappings');
  wrap('setPanelEnabled');
  wrap('repairPanel');
  wrapDetachPanel();
}

module.exports = {
  ensureAllPanelReactions,
  clearAllPanelReactions,
  inspectDeployment,
  detailedAccessError,
};