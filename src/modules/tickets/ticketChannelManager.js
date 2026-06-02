// src/modules/tickets/ticketChannelManager.js

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
  return [...new Set((ids || []).filter(Boolean))];
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
      console.error('[Tickets] Failed to repair bot channel permissions:', error);
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

function getPriorityIndicator(priority = 'normal') {
  const cleanPriority = String(priority || 'normal').toLowerCase();

  if (cleanPriority === 'low') {
    return '🟢';
  }

  if (cleanPriority === 'normal') {
    return '🔵';
  }

  if (cleanPriority === 'high') {
    return '🟡';
  }

  if (cleanPriority === 'urgent') {
    return '🔴';
  }

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
    return (
      guild.members.cache.get(creatorId)?.user?.username ||
      guild.members.cache.get(creatorId)?.displayName ||
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

  const type = String(ticket.type || 'ticket')
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
  return panel?.outputCategoryId || settings.discord?.categoryId || null;
}

function getArchiveCategory(settings, panel) {
  return panel?.archiveCategoryId || settings.discord?.archiveCategoryId || null;
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

  const baseName = baseCategory.name.replace(/\s+\d+$/, '').trim();

  const siblingCategories = guild.channels.cache
    .filter(
      (channel) =>
        channel.type === ChannelType.GuildCategory &&
        (channel.name === baseName || channel.name.startsWith(`${baseName} `))
    )
    .sort((a, b) => {
      const aNum = Number(a.name.match(/(\d+)$/)?.[1] || 1);
      const bNum = Number(b.name.match(/(\d+)$/)?.[1] || 1);
      return aNum - bNum;
    });

  for (const category of siblingCategories.values()) {
    if (getChildCount(category.id) < MAX_CHANNELS_PER_CATEGORY) {
      await ensureBotCategoryPermissions(guild, category.id);
      return category.id;
    }
  }

  const overflowNumber = siblingCategories.size + 1;
  const overflowName = `${baseName} ${overflowNumber}`;

  const newCategory = await guild.channels.create({
    name: overflowName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: baseCategory.permissionOverwrites.cache.map(
      (overwrite) => ({
        id: overwrite.id,
        allow: overwrite.allow.bitfield,
        deny: overwrite.deny.bitfield,
      })
    ),
  });

  await ensureBotCategoryPermissions(guild, newCategory.id);

  return newCategory.id;
}

function getPanelOrGlobalStaffRoles(settings, panel) {
  return uniqueIds([
    ...(settings.permissions?.staffRoleIds || []),
    ...(panel?.staffRoleIds || []),
  ]);
}

function getPanelOrGlobalManagerRoles(settings, panel) {
  return uniqueIds([
    ...(settings.permissions?.managerRoleIds || []),
    ...(panel?.managerRoleIds || []),
  ]);
}

function getPanelOrGlobalViewerRoles(settings, panel) {
  return uniqueIds([
    ...(settings.permissions?.viewerRoleIds || []),
    ...(panel?.viewerRoleIds || []),
  ]);
}

function buildPermissionOverwrites({
  guild,
  ticket,
  settings,
  panel,
}) {
  const botId = getBotId(guild);

  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

  if (botId) {
    permissionOverwrites.push({
      id: botId,
      allow: BOT_CHANNEL_PERMISSIONS,
    });
  }

  if (ticket.creatorId) {
    permissionOverwrites.push({
      id: ticket.creatorId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  for (const userId of uniqueIds(ticket.allowedUserIds || [])) {
    permissionOverwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
      ],
    });
  }

  for (const roleId of getPanelOrGlobalStaffRoles(settings, panel)) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  for (const roleId of getPanelOrGlobalManagerRoles(settings, panel)) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  for (const roleId of getPanelOrGlobalViewerRoles(settings, panel)) {
    permissionOverwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.ReadMessageHistory,
      ],
      deny: [PermissionFlagsBits.SendMessages],
    });
  }

  return permissionOverwrites;
}

function validatePermissionOverwrites(overwrites = []) {
  const seen = new Set();

  return overwrites.filter((overwrite) => {
    if (!overwrite?.id || seen.has(overwrite.id)) return false;
    seen.add(overwrite.id);
    return true;
  });
}

async function createTicketChannel({
  client,
  guild,
  ticket,
  panel = null,
} = {}) {
  if (!guild || !ticket) return null;

  await ensureBotReady(guild);

  const settings = getTicketSettings(guild.id);

  const rawCategoryId = getPanelOrGlobalCategory(settings, panel);

  const categoryId = await resolveAvailableCategory(guild, rawCategoryId);

  const permissionOverwrites = validatePermissionOverwrites(
    buildPermissionOverwrites({
      guild,
      ticket,
      settings,
      panel,
    })
  );

  const channel = await guild.channels.create({
    name: buildTicketChannelName(ticket, guild, panel),
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites,
    topic: `Ticket ${ticket.displayId || ticket.ticketId}`,
  });

  await ensureBotChannelPermissions(channel);

  updateTicket(guild.id, ticket.ticketId, {
    discordChannelId: channel.id,
    metadata: {
      ...(ticket.metadata || {}),
      outputCategoryId: categoryId,
      panelId: panel?.panelId || ticket.metadata?.panelId || null,
      panelStaffRoleIds: panel?.staffRoleIds || [],
      panelManagerRoleIds: panel?.managerRoleIds || [],
      panelViewerRoleIds: panel?.viewerRoleIds || [],
      logsChannelId: panel?.logsChannelId || null,
      transcriptsChannelId: panel?.transcriptsChannelId || null,
      archiveCategoryId: panel?.archiveCategoryId || null,
    },
  });

  addTimelineEntry(guild.id, ticket.ticketId, {
    type: 'discord_channel_created',
    actorId: null,
    message: `Discord ticket channel created: ${channel.id}`,
    metadata: {
      channelId: channel.id,
      categoryId,
      panelId: panel?.panelId || null,
    },
  });

  return channel;
}

async function archiveTicketChannel({
  guild,
  ticket,
  panel = null,
} = {}) {
  if (!guild || !ticket?.discordChannelId) return null;

  const settings = getTicketSettings(guild.id);
  const archiveCategoryId = getArchiveCategory(settings, panel);

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) return null;

  await ensureBotChannelPermissions(channel);

  if (archiveCategoryId) {
    await ensureBotCategoryPermissions(guild, archiveCategoryId);
    await channel.setParent(archiveCategoryId).catch(() => null);
  }

  await channel.permissionOverwrites
    .edit(guild.roles.everyone.id, {
      ViewChannel: false,
    })
    .catch(() => null);

  if (ticket.creatorId) {
    await channel.permissionOverwrites
      .edit(ticket.creatorId, {
        ViewChannel: false,
        SendMessages: false,
      })
      .catch(() => null);
  }

  const archiveName = buildTicketChannelName(
    {
      ...ticket,
      status: 'archived',
    },
    guild,
    panel
  );

  console.log(
  '[Tickets] Archive rename check:',
  channel.name,
  '=>',
  archiveName
);

try {
  await channel.setName(
    archiveName,
    'Ticket archived'
  );

  console.log(
    '[Tickets] Archive channel renamed:',
    archiveName
  );
} catch (error) {
  console.error(
    '[Tickets] Archive rename failed:',
    error
  );
}

  addTimelineEntry(guild.id, ticket.ticketId, {
    type: 'discord_channel_archived',
    actorId: null,
    message: `Discord ticket channel archived: ${channel.id}`,
    metadata: {
      channelId: channel.id,
      archiveCategoryId,
    },
  });

  return channel;
}

async function closeTicketChannel({
  guild,
  ticket,
} = {}) {
  if (!guild || !ticket?.discordChannelId) return null;

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) return null;

  await ensureBotChannelPermissions(channel);

  if (ticket.creatorId) {
    await channel.permissionOverwrites
      .edit(ticket.creatorId, {
        SendMessages: false,
      })
      .catch(() => null);
  }

  const cleanName = channel.name
    .replace(/^closed-/, '')
    .replace(/^archived-/, '');

  await channel
    .setName(`closed-${cleanName}`.slice(0, 90))
    .catch(() => null);

  addTimelineEntry(guild.id, ticket.ticketId, {
    type: 'discord_channel_closed',
    actorId: null,
    message: `Discord ticket channel closed: ${channel.id}`,
    metadata: {
      channelId: channel.id,
    },
  });

  return channel;
}

async function reopenTicketChannel({
  guild,
  ticket,
} = {}) {
  if (!guild || !ticket?.discordChannelId) return null;

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) return null;

  await ensureBotChannelPermissions(channel);

  if (ticket.creatorId) {
    await channel.permissionOverwrites
      .edit(ticket.creatorId, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      })
      .catch(() => null);
  }

  const reopenedName = buildTicketChannelName(
  {
    ...ticket,
    status: 'open',
  },
  guild
);

console.log(
  '[Tickets] Reopen rename check:',
  channel.name,
  '=>',
  reopenedName
);

await channel.setName(
  reopenedName,
  'Ticket reopened'
);

  addTimelineEntry(guild.id, ticket.ticketId, {
    type: 'discord_channel_reopened',
    actorId: null,
    message: `Discord ticket channel reopened: ${channel.id}`,
    metadata: {
      channelId: channel.id,
    },
  });

  return channel;
}

async function deleteTicketChannel({
  guild,
  ticket,
  reason = 'Ticket deleted',
} = {}) {
  if (!guild || !ticket?.discordChannelId) return false;

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) return false;

  await ensureBotChannelPermissions(channel);

  addTimelineEntry(guild.id, ticket.ticketId, {
    type: 'discord_channel_deleted',
    actorId: null,
    message: `Discord ticket channel deleted: ${channel.id}`,
    metadata: {
      channelId: channel.id,
      reason,
    },
  });

  await channel.delete(reason).catch(() => null);

  return true;
}

module.exports = {
  buildTicketChannelName,
  cleanChannelPart,
  getPriorityIndicator,
  buildPermissionOverwrites,
  validatePermissionOverwrites,
  resolveAvailableCategory,

  ensureBotReady,
  ensureBotChannelPermissions,
  ensureBotCategoryPermissions,

  createTicketChannel,
  archiveTicketChannel,
  closeTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
};