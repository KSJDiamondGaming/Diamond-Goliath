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

function uniqueIds(ids = []) {
  return [...new Set((ids || []).filter(Boolean))];
}

function buildTicketChannelName(ticket) {
  const type = ticket.type || 'ticket';

  const cleanType = type
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const display = ticket.displayId?.toLowerCase?.() || 'unknown';

  return `${cleanType}-${display}`;
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
  const permissionOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
  ];

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

  const extraUserIds = uniqueIds(ticket.allowedUserIds || []);

  for (const userId of extraUserIds) {
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
      deny: [
        PermissionFlagsBits.SendMessages,
      ],
    });
  }

  return permissionOverwrites;
}

async function createTicketChannel({
  client,
  guild,
  ticket,
  panel = null,
} = {}) {
  if (!guild || !ticket) {
    return null;
  }

  const settings = getTicketSettings(guild.id);

  const categoryId = getPanelOrGlobalCategory(
    settings,
    panel
  );

  const permissionOverwrites =
    buildPermissionOverwrites({
      guild,
      ticket,
      settings,
      panel,
    });

  const channel = await guild.channels.create({
    name: buildTicketChannelName(ticket),
    type: ChannelType.GuildText,
    parent: categoryId || undefined,
    permissionOverwrites,
    topic: `Ticket ${ticket.displayId || ticket.ticketId}`,
  });

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
  if (!guild || !ticket?.discordChannelId) {
    return null;
  }

  const settings = getTicketSettings(guild.id);
  const archiveCategoryId = getArchiveCategory(settings, panel);

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) {
    return null;
  }

  if (archiveCategoryId) {
    await channel.setParent(archiveCategoryId).catch(() => null);
  }

  await channel.permissionOverwrites.edit(
    guild.roles.everyone.id,
    {
      ViewChannel: false,
    }
  ).catch(() => null);

  if (ticket.creatorId) {
    await channel.permissionOverwrites.edit(
      ticket.creatorId,
      {
        ViewChannel: false,
        SendMessages: false,
      }
    ).catch(() => null);
  }

  await channel.setName(
    `archived-${channel.name}`.slice(0, 90)
  ).catch(() => null);

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
  if (!guild || !ticket?.discordChannelId) {
    return null;
  }

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) {
    return null;
  }

  if (ticket.creatorId) {
    await channel.permissionOverwrites.edit(
      ticket.creatorId,
      {
        SendMessages: false,
      }
    ).catch(() => null);
  }

  await channel.setName(
    `closed-${channel.name}`.slice(0, 90)
  ).catch(() => null);

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
  if (!guild || !ticket?.discordChannelId) {
    return null;
  }

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) {
    return null;
  }

  if (ticket.creatorId) {
    await channel.permissionOverwrites.edit(
      ticket.creatorId,
      {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        AttachFiles: true,
        EmbedLinks: true,
      }
    ).catch(() => null);
  }

  const cleanName = channel.name
    .replace(/^closed-/, '')
    .replace(/^archived-/, '');

  await channel.setName(cleanName).catch(() => null);

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
  if (!guild || !ticket?.discordChannelId) {
    return false;
  }

  const channel = await guild.channels
    .fetch(ticket.discordChannelId)
    .catch(() => null);

  if (!channel) {
    return false;
  }

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
  buildPermissionOverwrites,

  createTicketChannel,
  archiveTicketChannel,
  closeTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
};