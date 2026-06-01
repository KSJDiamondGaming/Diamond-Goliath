// src/modules/tickets/ticketPanelManager.js

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const {
  DEFAULT_TICKET_PANEL,
  TICKET_SOURCE,
} = require('./ticketDefaults');

const {
  getPanels,
  getPanel,
  createPanel,
  updatePanel,
  deletePanel,
  markPanelDeployed,
  markPanelUndeployed,
} = require('./ticketStore');

const {
  createNewTicket,
} = require('./ticketManager');

const {
  createTicketChannel,
  ensureBotChannelPermissions,
} = require('./ticketChannelManager');

const {
  getTicketActionRows,
} = require('./ticketChannelButtons');

const {
  emitPanelCreated,
  emitPanelUpdated,
  emitPanelDeleted,
  emitPanelDeployed,
  emitTicketCreated,
} = require('./ticketSocketEvents');

const ticketGuard = require('./ticketGuard');

function now() {
  return new Date().toISOString();
}

function getTicketChannelId(ticket) {
  return (
    ticket?.discordChannelId ||
    ticket?.channelId ||
    null
  );
}

function resolveButtonStyle(style) {
  if (!style) {
    return ButtonStyle.Primary;
  }

  return (
    ButtonStyle[style] ||
    ButtonStyle.Primary
  );
}

function buildPanelStatusText(panel) {
  if (!panel) {
    return 'Unknown';
  }

  if (panel.deployed) {
    return '🟢 Deployed';
  }

  if (panel.enabled === false) {
    return '🔴 Disabled';
  }

  return '🟡 Draft';
}

function buildPanelEmbed(
  panel = DEFAULT_TICKET_PANEL
) {
  const appearance =
    panel.appearance || {};

  const embed = new EmbedBuilder()
    .setTitle(
      appearance.title ||
        'Open a Ticket'
    )
    .setDescription(
      appearance.description ||
        'Need help? Open a ticket and our staff team will assist you.'
    )
    .addFields(
      {
        name: 'Panel',
        value: `\`${panel.name || 'Unknown'}\``,
        inline: true,
      },
      {
        name: 'Status',
        value: buildPanelStatusText(panel),
        inline: true,
      },
      {
        name: 'Ticket Type',
        value: `\`${panel.ticketType || 'Support'}\``,
        inline: true,
      }
    )
    .setTimestamp();

  if (appearance.color) {
    embed.setColor(appearance.color);
  }

  if (appearance.imageUrl) {
    embed.setImage(
      appearance.imageUrl
    );
  }

  if (appearance.thumbnailUrl) {
    embed.setThumbnail(
      appearance.thumbnailUrl
    );
  }

  if (appearance.footerText) {
    embed.setFooter({
      text: appearance.footerText,
    });
  }

  return embed;
}

function buildPanelButtons(
  panel = DEFAULT_TICKET_PANEL
) {
  const appearance =
    panel.appearance || {};

  const button =
    new ButtonBuilder()
      .setCustomId(
        `ticket_open:${panel.panelId}`
      )
      .setLabel(
        appearance.buttonLabel ||
          'Open Ticket'
      )
      .setStyle(
        resolveButtonStyle(
          panel.buttonStyle
        )
      )
      .setDisabled(
        panel.enabled === false
      );

  if (appearance.buttonEmoji) {
    button.setEmoji(
      appearance.buttonEmoji
    );
  }

  return [
    new ActionRowBuilder().addComponents(
      button
    ),
  ];
}

async function cleanupDuplicateDeployments({
  guild,
  panel,
}) {
  if (!guild || !panel) {
    return;
  }

  const allPanels =
    getPanels(guild.id).panels || [];

  const duplicates =
    allPanels.filter(
      (existingPanel) =>
        existingPanel.panelId !==
          panel.panelId &&
        existingPanel.deployChannelId ===
          panel.deployChannelId &&
        existingPanel.deployMessageId ===
          panel.deployMessageId
    );

  for (const duplicate of duplicates) {
    await updatePanel(
      guild.id,
      duplicate.panelId,
      {
        deployed: false,
        status: 'draft',

        deployChannelId: null,
        deployMessageId: null,
      }
    );
  }
}

async function validateDeployment({
  guild,
  channel,
  panel,
}) {
  if (!guild) {
    throw new Error(
      'Missing guild.'
    );
  }

  if (!channel) {
    throw new Error(
      'Missing deployment channel.'
    );
  }

  if (!panel) {
    throw new Error(
      'Missing panel.'
    );
  }

  if (panel.enabled === false) {
    throw new Error(
      'Panel is disabled.'
    );
  }

  return true;
}

async function deployPanel({
  guild,
  channel,
  panel,
  actorId = null,
} = {}) {
  await validateDeployment({
    guild,
    channel,
    panel,
  });

  await ensureBotChannelPermissions(channel);

  await cleanupDuplicateDeployments({
    guild,
    panel,
  });

  const existingMessageId =
    panel.deployMessageId ||
    panel.messageId;

  if (existingMessageId) {
    try {
      const existingMessage =
        await channel.messages.fetch(
          existingMessageId
        );

      if (existingMessage) {
        await existingMessage.edit({
          embeds: [
            buildPanelEmbed(panel),
          ],

          components:
            buildPanelButtons(panel),
        });

        const deployed =
          await markPanelDeployed(
            guild.id,
            panel.panelId,
            {
              deployChannelId:
                channel.id,

              deployMessageId:
                existingMessage.id,

              actorId,
            }
          );

        emitPanelUpdated(
        guild.id,
        deployed
      );

        return deployed;
      }
    } catch (error) {
      console.warn(
        '[Tickets] Existing deployed panel could not be updated:',
        error.message
      );
    }
  }

  const message =
    await channel.send({
      embeds: [
        buildPanelEmbed(panel),
      ],

      components:
        buildPanelButtons(panel),
    });

  const deployed =
    await markPanelDeployed(
      guild.id,
      panel.panelId,
      {
        deployChannelId:
          channel.id,

        deployMessageId:
          message.id,

        actorId,
      }
    );

    emitPanelDeployed(
    guild.id,
    deployed
  );

  return deployed;
}

async function undeployPanel({
  guild,
  panel,
} = {}) {
  if (!guild || !panel) {
    return false;
  }

  const channelId =
    panel.deployChannelId;

  const messageId =
    panel.deployMessageId;

  if (!channelId || !messageId) {
    return false;
  }

  try {
    const channel =
      await guild.channels.fetch(
        channelId
      );

    if (!channel) {
      return false;
    }

    const message =
      await channel.messages.fetch(
        messageId
      );

    if (message) {
      await message.delete().catch(
        () => null
      );
    }

    const updated =
      await markPanelUndeployed(
        guild.id,
        panel.panelId
      );

    emitPanelUpdated(
    guild.id,
    updated
);

    return true;
  } catch (error) {
    console.error(
      '[Tickets] Failed to undeploy panel:',
      error
    );

    return false;
  }
}

async function redeployPanel({
  guild,
  channel,
  panel,
  actorId = null,
} = {}) {
  await undeployPanel({
    guild,
    panel,
  });

  return deployPanel({
    guild,
    channel,
    panel,
    actorId,
  });
}

async function refreshDeployedPanel({
  guild,
  panel,
}) {
  if (
    !guild ||
    !panel?.deployChannelId ||
    !panel?.deployMessageId
  ) {
    return false;
  }

  try {
    const channel =
      await guild.channels.fetch(
        panel.deployChannelId
      );

    if (!channel) {
      return false;
    }

    const message =
      await channel.messages.fetch(
        panel.deployMessageId
      );

    if (!message) {
      return false;
    }

    await message.edit({
      embeds: [
        buildPanelEmbed(panel),
      ],

      components:
        buildPanelButtons(panel),
    });

    return true;
  } catch {
    return false;
  }
}

async function sendTicketControlMessage({
  channel,
  ticket,
  panel,
  user,
} = {}) {
  if (!channel || !ticket) {
    return null;
  }

  const ticketTitle =
    ticket.title ||
    panel?.name ||
    'Ticket';

  const embed = new EmbedBuilder()
    .setTitle(
      `🎫 ${ticketTitle}`
    )
    .setDescription(
      [
        `Ticket opened by <@${user?.id || ticket.creatorId}>.`,
        '',
        '**Staff Controls**',
        'Use the buttons below to manage this ticket.',
      ].join('\n')
    )
    .addFields(
      {
        name: 'Ticket ID',
        value: `\`${ticket.displayId || ticket.ticketId || 'Unknown'}\``,
        inline: true,
      },
      {
        name: 'Status',
        value: `\`${ticket.status || 'open'}\``,
        inline: true,
      },
      {
        name: 'Priority',
        value: `\`${ticket.priority || panel?.ticketPriority || 'normal'}\``,
        inline: true,
      },
      {
        name: 'Panel',
        value: `\`${panel?.name || panel?.panelId || 'Unknown'}\``,
        inline: true,
      }
    )
    .setTimestamp();

  return channel.send({
    content: `<@${user?.id || ticket.creatorId}>`,

    embeds: [embed],

    components:
      getTicketActionRows(ticket, {
        allowReopen: true,
        allowDelete: true,
      }),
  });
}

async function handleTicketPanelButton(
  interaction,
  client,
  io = null
) {
  if (!interaction.isButton()) {
    return false;
  }

  const customId =
    interaction.customId || '';

  if (
    !customId.startsWith(
      'ticket_open:'
    )
  ) {
    return false;
  }

  const panelId =
    customId.split(':')[1];

  const guild =
    interaction.guild;

  if (!guild) {
    await interaction.reply({
      content:
        'Tickets can only be opened inside a server.',

      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  const panel = getPanel(
    guild.id,
    panelId
  );

  if (!panel || !panel.enabled) {
    await interaction.reply({
      content:
        'This ticket panel is no longer available.',

      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  const guard =
    await ticketGuard.canCreateTicket({
      guildId: guild.id,

      userId:
        interaction.user.id,

      type: panel.ticketType,

      cooldownMs:
        panel.cooldownMs ||
        60 * 1000,

      oneActivePerType:
        panel.oneActivePerType !==
        false,

      maxOpenTicketsPerUser:
        panel.maxOpenTicketsPerUser ||
        panel.maxActiveTicketsPerUser ||
        2,
    });

  if (!guard.allowed) {
    const existingChannelId =
      getTicketChannelId(
        guard.ticket
      );

    await interaction.reply({
      content: existingChannelId
        ? `${guard.reason}\nExisting ticket: <#${existingChannelId}>`
        : guard.reason,

      flags: MessageFlags.Ephemeral,
    });

    return true;
  }

  await interaction.deferReply({
    flags: MessageFlags.Ephemeral,
  });

  const ticket =
    await createNewTicket({
      guildId: guild.id,

      creatorId:
        interaction.user.id,

      type:
        panel.ticketType,

      title: `${panel.name || 'Ticket'} - ${interaction.user.username}`,

      description: `Ticket opened by <@${interaction.user.id}>.`,

      priority:
        panel.ticketPriority,

      source:
        TICKET_SOURCE.DISCORD_PANEL,

      sourceId:
        panel.panelId,

      metadata: {
        panelId:
          panel.panelId,

        openedFromChannelId:
          interaction.channelId,

        logsChannelId:
          panel.logsChannelId ||
          null,

        transcriptsChannelId:
          panel.transcriptsChannelId ||
          null,

        archiveCategoryId:
          panel.archiveCategoryId ||
          null,

        deployedAt:
          panel.lastDeployAt ||
          null,

        creatorUsername:
          interaction.user.username,

        creatorTag:
          interaction.user.tag ||
          interaction.user.username,

        priorityIndicators:
          panel.priorityIndicators !== false,

        sla:
          panel.sla || null,

        reminders:
          panel.reminders || null,
      },
    });

  await ticketGuard.markTicketCreated({
    guildId: guild.id,

    userId:
      interaction.user.id,

    type:
      panel.ticketType,
  });

  const channel =
    await createTicketChannel({
      client,
      guild,
      ticket,
      panel,
    });

  if (channel) {
    await sendTicketControlMessage({
      channel,

      ticket: {
        ...ticket,
        discordChannelId:
          channel.id,
      },

      panel,

      user:
        interaction.user,
    });
  }

  emitTicketCreated(
  guild.id,
  {
    ...ticket,
    discordChannelId:
      channel?.id || null,
  }
);

  await interaction.editReply({
    content: channel
      ? `Ticket created: <#${channel.id}>`
      : 'Ticket created, but I could not create the Discord channel.',
  });

  return true;
}

module.exports = {
  buildPanelEmbed,
  buildPanelButtons,

  createPanel: (...args) => {
  const panel =
    createPanel(...args);

  if (panel) {
    emitPanelCreated(
      args[0],
      panel
    );
  }

  return panel;
},

getPanels,
getPanel,

updatePanel: (...args) => {
  const panel =
    updatePanel(...args);

  if (panel) {
    emitPanelUpdated(
      args[0],
      panel
    );
  }

  return panel;
},

deletePanel: (...args) => {
  const panelId =
    args[1];

  const deleted =
    deletePanel(...args);

  if (deleted) {
    emitPanelDeleted(
      args[0],
      panelId
    );
  }

  return deleted;
},

  deployPanel,
  undeployPanel,
  redeployPanel,
  refreshDeployedPanel,

  cleanupDuplicateDeployments,
  validateDeployment,

  sendTicketControlMessage,

  handleTicketPanelButton,

  getTicketChannelId,
};