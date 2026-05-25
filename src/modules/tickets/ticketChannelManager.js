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
  return [
    ...new Set(
      (ids || []).filter(Boolean)
    ),
  ];
}

function buildTicketChannelName(ticket) {
  if (!ticket) {
    return 'ticket-0000';
  }

  if (ticket.displayId) {
    return String(ticket.displayId)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 90);
  }

  const type = String(ticket.type || 'ticket')
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const number =
    ticket.number ||
    ticket.ticketNumber ||
    0;

  return `${type}-${String(number).padStart(4, '0')}`.slice(0, 90);
}

function getPanelOrGlobalCategory(
  settings,
  panel
) {
  return (
    panel?.outputCategoryId ||
    settings.discord?.categoryId ||
    null
  );
}

function getArchiveCategory(
  settings,
  panel
) {
  return (
    panel?.archiveCategoryId ||
    settings.discord
      ?.archiveCategoryId ||
    null
  );
}

async function resolveAvailableCategory(
  guild,
  categoryId
) {
  if (!guild || !categoryId) {
    return null;
  }

  const baseCategory =
    guild.channels.cache.get(categoryId);

  if (
    !baseCategory ||
    baseCategory.type !==
      ChannelType.GuildCategory
  ) {
    return null;
  }

  const MAX_CHANNELS_PER_CATEGORY = 48;

  const getChildCount = (id) =>
    guild.channels.cache.filter(
      (channel) =>
        channel.parentId === id
    ).size;

  /*
   * Use original category first
   */

  if (
    getChildCount(baseCategory.id) <
    MAX_CHANNELS_PER_CATEGORY
  ) {
    return baseCategory.id;
  }

  /*
   * Find reusable overflow categories
   */

  const baseName =
    baseCategory.name
      .replace(/\s+\d+$/, '')
      .trim();

  const siblingCategories =
    guild.channels.cache
      .filter(
        (channel) =>
          channel.type ===
            ChannelType.GuildCategory &&
          (
            channel.name === baseName ||
            channel.name.startsWith(
              `${baseName} `
            )
          )
      )
      .sort((a, b) => {
        const aNum =
          Number(
            a.name.match(
              /(\d+)$/
            )?.[1] || 1
          );

        const bNum =
          Number(
            b.name.match(
              /(\d+)$/
            )?.[1] || 1
          );

        return aNum - bNum;
      });

  for (const category of siblingCategories.values()) {
    if (
      getChildCount(category.id) <
      MAX_CHANNELS_PER_CATEGORY
    ) {
      return category.id;
    }
  }

  /*
   * Create overflow category
   */

  const overflowNumber =
    siblingCategories.size + 1;

  const overflowName =
    `${baseName} ${overflowNumber}`;

  const newCategory =
    await guild.channels.create({
      name: overflowName,

      type:
        ChannelType.GuildCategory,

      permissionOverwrites:
        baseCategory.permissionOverwrites.cache.map(
          (overwrite) => ({
            id: overwrite.id,

            allow:
              overwrite.allow.bitfield,

            deny:
              overwrite.deny.bitfield,
          })
        ),
    });

  return newCategory.id;
}

function getPanelOrGlobalStaffRoles(
  settings,
  panel
) {
  return uniqueIds([
    ...(settings.permissions
      ?.staffRoleIds || []),

    ...(panel?.staffRoleIds ||
      []),
  ]);
}

function getPanelOrGlobalManagerRoles(
  settings,
  panel
) {
  return uniqueIds([
    ...(settings.permissions
      ?.managerRoleIds || []),

    ...(panel?.managerRoleIds ||
      []),
  ]);
}

function getPanelOrGlobalViewerRoles(
  settings,
  panel
) {
  return uniqueIds([
    ...(settings.permissions
      ?.viewerRoleIds || []),

    ...(panel?.viewerRoleIds ||
      []),
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
      deny: [
        PermissionFlagsBits.ViewChannel,
      ],
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

  const extraUserIds =
    uniqueIds(
      ticket.allowedUserIds || []
    );

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

  for (const roleId of getPanelOrGlobalStaffRoles(
    settings,
    panel
  )) {
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

  for (const roleId of getPanelOrGlobalManagerRoles(
    settings,
    panel
  )) {
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

  for (const roleId of getPanelOrGlobalViewerRoles(
    settings,
    panel
  )) {
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

function validatePermissionOverwrites(
  overwrites = []
) {
  const seen = new Set();

  return overwrites.filter(
    (overwrite) => {
      if (
        !overwrite?.id ||
        seen.has(overwrite.id)
      ) {
        return false;
      }

      seen.add(overwrite.id);

      return true;
    }
  );
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

  const settings =
    getTicketSettings(guild.id);

  const rawCategoryId =
    getPanelOrGlobalCategory(
      settings,
      panel
    );

  const categoryId =
    await resolveAvailableCategory(
      guild,
      rawCategoryId
    );

  const permissionOverwrites =
    validatePermissionOverwrites(
      buildPermissionOverwrites({
        guild,
        ticket,
        settings,
        panel,
      })
    );

  const channel =
    await guild.channels.create({
      name:
        buildTicketChannelName(
          ticket
        ),

      type:
        ChannelType.GuildText,

      parent:
        categoryId || undefined,

      permissionOverwrites,

      topic: `Ticket ${
        ticket.displayId ||
        ticket.ticketId
      }`,
    });

  updateTicket(
    guild.id,
    ticket.ticketId,
    {
      discordChannelId:
        channel.id,

      metadata: {
        ...(ticket.metadata ||
          {}),

        outputCategoryId:
          categoryId,

        panelId:
          panel?.panelId ||
          ticket.metadata
            ?.panelId ||
          null,

        panelStaffRoleIds:
          panel?.staffRoleIds ||
          [],

        panelManagerRoleIds:
          panel?.managerRoleIds ||
          [],

        panelViewerRoleIds:
          panel?.viewerRoleIds ||
          [],

        logsChannelId:
          panel?.logsChannelId ||
          null,

        transcriptsChannelId:
          panel?.transcriptsChannelId ||
          null,

        archiveCategoryId:
          panel?.archiveCategoryId ||
          null,
      },
    }
  );

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type:
        'discord_channel_created',

      actorId: null,

      message:
        `Discord ticket channel created: ${channel.id}`,

      metadata: {
        channelId:
          channel.id,

        categoryId,

        panelId:
          panel?.panelId ||
          null,
      },
    }
  );

  return channel;
}

async function archiveTicketChannel({
  guild,
  ticket,
  panel = null,
} = {}) {
  if (
    !guild ||
    !ticket?.discordChannelId
  ) {
    return null;
  }

  const settings =
    getTicketSettings(guild.id);

  const archiveCategoryId =
    getArchiveCategory(
      settings,
      panel
    );

  const channel =
    await guild.channels
      .fetch(
        ticket.discordChannelId
      )
      .catch(() => null);

  if (!channel) {
    return null;
  }

  if (archiveCategoryId) {
    await channel
      .setParent(
        archiveCategoryId
      )
      .catch(() => null);
  }

  await channel.permissionOverwrites
    .edit(
      guild.roles.everyone.id,
      {
        ViewChannel: false,
      }
    )
    .catch(() => null);

  if (ticket.creatorId) {
    await channel.permissionOverwrites
      .edit(
        ticket.creatorId,
        {
          ViewChannel: false,
          SendMessages: false,
        }
      )
      .catch(() => null);
  }

  const cleanName =
    channel.name
      .replace(/^closed-/, '')
      .replace(
        /^archived-/,
        ''
      );

  await channel
    .setName(
      `archived-${cleanName}`.slice(
        0,
        90
      )
    )
    .catch(() => null);

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type:
        'discord_channel_archived',

      actorId: null,

      message:
        `Discord ticket channel archived: ${channel.id}`,

      metadata: {
        channelId:
          channel.id,

        archiveCategoryId,
      },
    }
  );

  return channel;
}

async function closeTicketChannel({
  guild,
  ticket,
} = {}) {
  if (
    !guild ||
    !ticket?.discordChannelId
  ) {
    return null;
  }

  const channel =
    await guild.channels
      .fetch(
        ticket.discordChannelId
      )
      .catch(() => null);

  if (!channel) {
    return null;
  }

  if (ticket.creatorId) {
    await channel.permissionOverwrites
      .edit(
        ticket.creatorId,
        {
          SendMessages: false,
        }
      )
      .catch(() => null);
  }

  const cleanName =
    channel.name
      .replace(/^closed-/, '')
      .replace(
        /^archived-/,
        ''
      );

  await channel
    .setName(
      `closed-${cleanName}`.slice(
        0,
        90
      )
    )
    .catch(() => null);

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type:
        'discord_channel_closed',

      actorId: null,

      message:
        `Discord ticket channel closed: ${channel.id}`,

      metadata: {
        channelId:
          channel.id,
      },
    }
  );

  return channel;
}

async function reopenTicketChannel({
  guild,
  ticket,
} = {}) {
  if (
    !guild ||
    !ticket?.discordChannelId
  ) {
    return null;
  }

  const channel =
    await guild.channels
      .fetch(
        ticket.discordChannelId
      )
      .catch(() => null);

  if (!channel) {
    return null;
  }

  if (ticket.creatorId) {
    await channel.permissionOverwrites
      .edit(
        ticket.creatorId,
        {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
          AttachFiles: true,
          EmbedLinks: true,
        }
      )
      .catch(() => null);
  }

  const cleanName =
    channel.name
      .replace(/^closed-/, '')
      .replace(
        /^archived-/,
        ''
      );

  await channel
    .setName(cleanName)
    .catch(() => null);

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type:
        'discord_channel_reopened',

      actorId: null,

      message:
        `Discord ticket channel reopened: ${channel.id}`,

      metadata: {
        channelId:
          channel.id,
      },
    }
  );

  return channel;
}

async function deleteTicketChannel({
  guild,
  ticket,
  reason = 'Ticket deleted',
} = {}) {
  if (
    !guild ||
    !ticket?.discordChannelId
  ) {
    return false;
  }

  const channel =
    await guild.channels
      .fetch(
        ticket.discordChannelId
      )
      .catch(() => null);

  if (!channel) {
    return false;
  }

  addTimelineEntry(
    guild.id,
    ticket.ticketId,
    {
      type:
        'discord_channel_deleted',

      actorId: null,

      message:
        `Discord ticket channel deleted: ${channel.id}`,

      metadata: {
        channelId:
          channel.id,

        reason,
      },
    }
  );

  await channel
    .delete(reason)
    .catch(() => null);

  return true;
}

module.exports = {
  buildTicketChannelName,
  buildPermissionOverwrites,
  validatePermissionOverwrites,
  resolveAvailableCategory,

  createTicketChannel,
  archiveTicketChannel,
  closeTicketChannel,
  reopenTicketChannel,
  deleteTicketChannel,
};