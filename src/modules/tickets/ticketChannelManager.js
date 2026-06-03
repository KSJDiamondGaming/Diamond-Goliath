// src/modules/tickets/ticketChannelManager.js

'use strict';

const {
  ChannelType,
  PermissionFlagsBits,
} = require('discord.js');

const {
  getTicketSettings,
  updateTicket,
} = require('./ticketStore');

const {
  addTimelineEntry,
} = require('./ticketTimeline');

const BOT_CHANNEL_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageMessages,
];

function uniqueIds(ids = []) {
  return [
    ...new Set(
      (Array.isArray(ids) ? ids : [])
        .filter(Boolean)
        .map(String)
    ),
  ];
}

function getBotId(guild) {
  return guild?.members?.me?.id || guild?.client?.user?.id || null;
}

async function ensureBotReady(guild) {
  if (!guild) return null;

  if (!guild.members.me) {
    await guild.members.fetchMe().catch(() => null);
  }

  return getBotId(guild);
}

async function ensureBotChannelPermissions(channel) {
  if (!channel?.guild) return false;

  const botId = await ensureBotReady(channel.guild);
  if (!botId) return false;

  await channel.permissionOverwrites
    .edit(botId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true,
      ManageChannels: true,
      ManageMessages: true,
    })
    .catch((error) => {
      console.error(
        '[Tickets] Failed to repair bot channel permissions:',
        error
      );
      return null;
    });

  return true;
}

async function ensureBotCategoryPermissions(guild, categoryId) {
  if (!guild || !categoryId) return false;

  const category = await guild.channels
    .fetch(categoryId)
    .catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return false;
  }

  return ensureBotChannelPermissions(category);
}

function cleanChannelPart(value, fallback = 'user', maxLength = 10) {
  const cleaned = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, maxLength);

  return cleaned || fallback;
}

function getPriorityIndicator(priority = 'low') {
  const cleanPriority = String(priority || 'low').toLowerCase();

  if (cleanPriority === 'low') return '🟢';
  if (cleanPriority === 'normal') return '🔵';
  if (cleanPriority === 'high') return '🟡';
  if (cleanPriority === 'urgent') return '🔴';

  return '🔵';
}

function getTicketCreatorName(ticket, guild = null) {
  const metadataName =
    ticket?.metadata?.creatorUsername ||
    ticket?.metadata?.creatorTag ||
    ticket?.creatorUsername ||
    ticket?.username ||
    null;

  if (metadataName) return metadataName;

  const creatorId =
    ticket?.creatorId ||
    ticket?.userId ||
    ticket?.createdBy ||
    null;

  if (creatorId && guild?.members?.cache?.has(creatorId)) {
    const member = guild.members.cache.get(creatorId);

    return (
      member?.user?.username ||
      member?.displayName ||
      creatorId
    );
  }

  return creatorId || 'user';
}

function getTicketNumber(ticket) {
  return (
    ticket?.number ||
    ticket?.ticketNumber ||
    String(ticket?.displayId || '').match(/(\d+)$/)?.[1] ||
    0
  );
}

function buildTicketChannelName(ticket, guild = null, panel = null) {
  if (!ticket) return 'ticket-user-0000';

  const type =
    String(ticket.type || 'ticket')
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'ticket';

  const username = cleanChannelPart(
    getTicketCreatorName(ticket, guild),
    'user',
    10
  );

  const number = String(getTicketNumber(ticket)).padStart(4, '0');

  const baseName = `${type}-${username}-${number}`;

  const status = String(ticket.status || 'open').toLowerCase();

  if (status === 'archived') {
    return `📦${baseName}`.slice(0, 90);
  }

  const useIndicator =
    panel?.priorityIndicators !== false &&
    ticket?.metadata?.priorityIndicators !== false;

  const indicator = useIndicator
    ? getPriorityIndicator(ticket.priority)
    : '';

  return `${indicator}${baseName}`.slice(0, 90);
}

function getPanelOrGlobalCategory(settings, panel) {
  return (
    panel?.outputCategoryId ||
    settings.discord?.categoryId ||
    null
  );
}

function getArchiveCategory(settings, panel) {
  return (
    panel?.archiveCategoryId ||
    settings.discord?.archiveCategoryId ||
    null
  );
}

async function resolveAvailableCategory(guild, categoryId) {
  if (!guild || !categoryId) return null;

  const baseCategory = guild.channels.cache.get(categoryId);

  if (!baseCategory || baseCategory.type !== ChannelType.GuildCategory) {
    return null;
  }

  await ensureBotCategoryPermissions(guild, baseCategory.id);

  const MAX_CHANNELS_PER_CATEGORY = 48;

  const getChildCount = (id) =>
    guild.channels.cache.filter((channel) => channel.parentId === id).size;

  if (getChildCount(baseCategory.id) < MAX_CHANNELS_PER_CATEGORY) {
    return baseCategory.id;
  }

  const overflowName = `${baseCategory.name} Overflow`;

  let overflowCategory = guild.channels.cache.find(
    (channel) =>
      channel.type === ChannelType.GuildCategory &&
      channel.name === overflowName
  );

  if (!overflowCategory) {
    overflowCategory = await guild.channels
      .create({
        name: overflowName,
        type: ChannelType.GuildCategory,
        permissionOverwrites:
          baseCategory.permissionOverwrites.cache.map((overwrite) => ({
            id: overwrite.id,
            allow: overwrite.allow.bitfield,
            deny: overwrite.deny.bitfield,
            type: overwrite.type,
          })),
      })
      .catch((error) => {
        console.error('[Tickets] Failed to create overflow category:', error);
        return null;
      });
  }

  if (!overflowCategory) return baseCategory.id;

  await ensureBotCategoryPermissions(guild, overflowCategory.id);

  return overflowCategory.id;
}

function creatorPermissions(userId) {
  if (!userId) return null;

  return {
    id: userId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ],
  };
}

function botPermissions(botId) {
  if (!botId) return null;

  return {
    id: botId,
    allow: BOT_CHANNEL_PERMISSIONS,
  };
}

function staffPermissions(roleId) {
  return {
    id: roleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
    ],
  };
}

function managerPermissions(roleId) {
  return {
    id: roleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.ReadMessageHistory,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.EmbedLinks,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.ManageChannels,
    ],
  };
}

function viewerPermissions(roleId) {
  return {
    id: roleId,
    allow: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.ReadMessageHistory,
    ],
    deny: [
      PermissionFlagsBits.SendMessages,
      PermissionFlagsBits.AttachFiles,
      PermissionFlagsBits.AddReactions,
    ],
  };
}

function getPanelRoleIds(panel = {}) {
  return {
    staffRoleIds: uniqueIds(panel.staffRoleIds),
    managerRoleIds: uniqueIds(panel.managerRoleIds),
    viewerRoleIds: uniqueIds(panel.viewerRoleIds),
  };
}

function getGlobalRoleIds(settings = {}) {
  const permissions = settings.permissions || {};

  return {
    staffRoleIds: uniqueIds(
      permissions.staffRoleIds ||
        permissions.staffRoles ||
        []
    ),

    managerRoleIds: uniqueIds(
      permissions.managerRoleIds ||
        permissions.managerRoles ||
        []
    ),

    viewerRoleIds: uniqueIds(
      permissions.viewerRoleIds ||
        permissions.viewerRoles ||
        []
    ),
  };
}

function mergeRoleIds(globalIds = {}, panelIds = {}) {
  return {
    staffRoleIds: uniqueIds([
      ...(globalIds.staffRoleIds || []),
      ...(panelIds.staffRoleIds || []),
    ]),

    managerRoleIds: uniqueIds([
      ...(globalIds.managerRoleIds || []),
      ...(panelIds.managerRoleIds || []),
    ]),

    viewerRoleIds: uniqueIds([
      ...(globalIds.viewerRoleIds || []),
      ...(panelIds.viewerRoleIds || []),
    ]),
  };
}

function buildTicketPermissionOverwrites({
  guild,
  ticket,
  panel = null,
  settings = {},
} = {}) {
  const overwrites = [];

  if (!guild || !ticket) return overwrites;

  const everyoneId = guild.roles.everyone.id;
  const botId = getBotId(guild);

  overwrites.push({
    id: everyoneId,
    deny: [
      PermissionFlagsBits.ViewChannel,
      PermissionFlagsBits.SendMessages,
    ],
  });

  const botOverwrite = botPermissions(botId);
  if (botOverwrite) overwrites.push(botOverwrite);

  const creatorId =
    ticket.creatorId ||
    ticket.userId ||
    ticket.createdBy ||
    null;

  const creatorOverwrite = creatorPermissions(creatorId);
  if (creatorOverwrite) overwrites.push(creatorOverwrite);

  const roles = mergeRoleIds(
    getGlobalRoleIds(settings),
    getPanelRoleIds(panel)
  );

  for (const roleId of roles.viewerRoleIds) {
    overwrites.push(viewerPermissions(roleId));
  }

  for (const roleId of roles.staffRoleIds) {
    overwrites.push(staffPermissions(roleId));
  }

  for (const roleId of roles.managerRoleIds) {
    overwrites.push(managerPermissions(roleId));
  }

  const allowedUsers = uniqueIds(ticket.allowedUserIds);

  for (const userId of allowedUsers) {
    if (userId === creatorId) continue;

    overwrites.push(creatorPermissions(userId));
  }

  return dedupeOverwrites(overwrites);
}

function dedupeOverwrites(overwrites = []) {
  const map = new Map();

  for (const overwrite of overwrites) {
    if (!overwrite?.id) continue;

    const existing = map.get(overwrite.id);

    if (!existing) {
      map.set(overwrite.id, overwrite);
      continue;
    }

    map.set(overwrite.id, {
      id: overwrite.id,
      allow: [
        ...new Set([
          ...(existing.allow || []),
          ...(overwrite.allow || []),
        ]),
      ],
      deny: [
        ...new Set([
          ...(existing.deny || []),
          ...(overwrite.deny || []),
        ]),
      ],
    });
  }

  return [...map.values()];
}

async function createTicketChannel({
  client,
  guild,
  ticket,
  panel = null,
} = {}) {
  if (!guild || !ticket) {
    throw new Error('Missing guild or ticket.');
  }

  await ensureBotReady(guild);

  const settings = getTicketSettings(guild.id);

  const categoryId = getPanelOrGlobalCategory(settings, panel);
  const parentId = await resolveAvailableCategory(guild, categoryId);

  const name = buildTicketChannelName(ticket, guild, panel);

  const permissionOverwrites = buildTicketPermissionOverwrites({
    guild,
    ticket,
    panel,
    settings,
  });

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent: parentId || undefined,
    topic: [
      `Ticket: ${ticket.displayId || ticket.ticketId}`,
      `Creator: ${ticket.creatorId || ticket.userId || ticket.createdBy || 'Unknown'}`,
      `Type: ${ticket.type || 'ticket'}`,
      `Priority: ${ticket.priority || 'low'}`,
    ].join(' • '),
    permissionOverwrites,
    reason: `Goliath ticket created: ${
      ticket.displayId || ticket.ticketId
    }`,
  });

  await ensureBotChannelPermissions(channel);

  const updatedTicket = updateTicket(
    guild.id,
    ticket.ticketId,
    {
      discordChannelId: channel.id,
      channelId: channel.id,
    }
  );

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type: 'discord_channel_created',
      actorId: null,
      actorTag: 'System',
      message: `Discord ticket channel created: #${channel.name}`,
      metadata: {
        channelId: channel.id,
        parentId: channel.parentId || null,
      },
    }
  );

  return channel;
}

async function syncTicketChannelPermissions({
  guild,
  channel,
  ticket,
  panel = null,
} = {}) {
  if (!guild || !channel || !ticket) {
    return false;
  }

  const settings = getTicketSettings(guild.id);

  const overwrites = buildTicketPermissionOverwrites({
    guild,
    ticket,
    panel,
    settings,
  });

  for (const overwrite of overwrites) {
    await channel.permissionOverwrites
      .edit(overwrite.id, {
        ViewChannel: overwrite.allow?.includes(PermissionFlagsBits.ViewChannel) || false,
        SendMessages: overwrite.allow?.includes(PermissionFlagsBits.SendMessages) || false,
        ReadMessageHistory:
          overwrite.allow?.includes(PermissionFlagsBits.ReadMessageHistory) || false,
        AttachFiles: overwrite.allow?.includes(PermissionFlagsBits.AttachFiles) || false,
        EmbedLinks: overwrite.allow?.includes(PermissionFlagsBits.EmbedLinks) || false,
        ManageChannels:
          overwrite.allow?.includes(PermissionFlagsBits.ManageChannels) || false,
        ManageMessages:
          overwrite.allow?.includes(PermissionFlagsBits.ManageMessages) || false,
        AddReactions:
          overwrite.deny?.includes(PermissionFlagsBits.AddReactions) ? false : null,
      })
      .catch((error) => {
        console.error(
          '[Tickets] Failed to sync ticket channel overwrite:',
          overwrite.id,
          error
        );
      });
  }

  await ensureBotChannelPermissions(channel);

  return true;
}

async function closeTicketChannel({
  guild,
  channel,
  ticket,
  actorId = null,
} = {}) {
  if (!guild || !channel || !ticket) return false;

  const name = buildTicketChannelName(
    {
      ...ticket,
      status: 'closed',
    },
    guild
  );

  await channel.setName(name).catch(() => null);

  const creatorId =
    ticket.creatorId ||
    ticket.userId ||
    ticket.createdBy ||
    null;

  if (creatorId) {
    await channel.permissionOverwrites
      .edit(creatorId, {
        SendMessages: false,
        AttachFiles: false,
      })
      .catch(() => null);
  }

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type: 'discord_channel_closed',
      actorId,
      message: 'Discord ticket channel locked after close.',
      metadata: {
        channelId: channel.id,
      },
    }
  );

  return true;
}

async function archiveTicketChannel({
  guild,
  channel,
  ticket,
  panel = null,
  actorId = null,
} = {}) {
  if (!guild || !channel || !ticket) return false;

  const settings = getTicketSettings(guild.id);
  const archiveCategoryId = getArchiveCategory(settings, panel);

  const resolvedArchiveId = await resolveAvailableCategory(
    guild,
    archiveCategoryId
  );

  await channel
    .setName(
      buildTicketChannelName(
        {
          ...ticket,
          status: 'archived',
        },
        guild,
        panel
      )
    )
    .catch(() => null);

  if (resolvedArchiveId) {
    await channel.setParent(resolvedArchiveId).catch(() => null);
  }

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type: 'discord_channel_archived',
      actorId,
      message: 'Discord ticket channel archived.',
      metadata: {
        channelId: channel.id,
        archiveCategoryId: resolvedArchiveId || null,
      },
    }
  );

  return true;
}

async function reopenTicketChannel({
  guild,
  channel,
  ticket,
  panel = null,
  actorId = null,
} = {}) {
  if (!guild || !channel || !ticket) return false;

  const settings = getTicketSettings(guild.id);
  const categoryId = getPanelOrGlobalCategory(settings, panel);
  const resolvedCategoryId = await resolveAvailableCategory(guild, categoryId);

  await channel
    .setName(
      buildTicketChannelName(
        {
          ...ticket,
          status: 'open',
        },
        guild,
        panel
      )
    )
    .catch(() => null);

  if (resolvedCategoryId) {
    await channel.setParent(resolvedCategoryId).catch(() => null);
  }

  const creatorId =
    ticket.creatorId ||
    ticket.userId ||
    ticket.createdBy ||
    null;

  if (creatorId) {
    await channel.permissionOverwrites
      .edit(creatorId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      })
      .catch(() => null);
  }

  await syncTicketChannelPermissions({
    guild,
    channel,
    ticket,
    panel,
  });

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type: 'discord_channel_reopened',
      actorId,
      message: 'Discord ticket channel reopened.',
      metadata: {
        channelId: channel.id,
        parentId: channel.parentId || null,
      },
    }
  );

  return true;
}

async function deleteTicketChannel({
  guild,
  channel,
  ticket,
  actorId = null,
} = {}) {
  if (!guild || !channel || !ticket) return false;

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type: 'discord_channel_deleted',
      actorId,
      message: 'Discord ticket channel deleted.',
      metadata: {
        channelId: channel.id,
        channelName: channel.name,
      },
    }
  );

  await channel.delete('Goliath ticket deleted').catch(() => null);

  return true;
}

module.exports = {
  BOT_CHANNEL_PERMISSIONS,

  buildTicketChannelName,
  buildTicketPermissionOverwrites,

  createTicketChannel,
  syncTicketChannelPermissions,

  closeTicketChannel,
  archiveTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,

  ensureBotReady,
  ensureBotChannelPermissions,
  ensureBotCategoryPermissions,

  resolveAvailableCategory,
};