'use strict';

/**
 * GOLIATH UNIVERSAL TICKET TRANSCRIPT MANAGER
 *
 * Standardized to existing ticketStore architecture:
 * - ticket.ticketId
 * - ticket.guildId
 * - ticket.discordChannelId
 *
 * Creates:
 * - HTML transcripts
 * - JSON transcripts
 * - saved runtime transcript files
 * - optional upload to transcript/log channel
 */

const fs = require('fs');
const path = require('path');

const {
  AttachmentBuilder,
  ChannelType,
} = require('discord.js');

const {
  getTicketSettings,
} = require('./ticketStore');

function now() {
  return new Date().toISOString();
}

function safe(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getTicketId(ticket) {
  return ticket?.ticketId || ticket?.id || 'unknown-ticket';
}

function getChannelId(ticket) {
  return ticket?.discordChannelId || ticket?.channelId || null;
}

function getCreatorId(ticket) {
  return ticket?.creatorId || ticket?.createdBy || ticket?.userId || null;
}

function getRuntimeRoot() {
  const mode =
    process.env.BOT_MODE ||
    process.env.NODE_ENV ||
    'dev';

  return path.join(process.cwd(), 'src', 'runtime', mode);
}

function getTranscriptDir(guildId) {
  return path.join(
    getRuntimeRoot(),
    'tickets',
    String(guildId),
    'transcripts'
  );
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function formatFileName(ticket, ext) {
  const ticketId = getTicketId(ticket);
  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-');

  return `${ticketId}-${stamp}.${ext}`;
}

async function fetchAllMessages(channel, limit = 1000) {
  const messages = [];
  let before;

  while (messages.length < limit) {
    const batch = await channel.messages.fetch({
      limit: Math.min(100, limit - messages.length),
      before,
    });

    if (!batch.size) break;

    const sorted = [...batch.values()].sort(
      (a, b) => a.createdTimestamp - b.createdTimestamp
    );

    messages.push(...sorted);
    before = batch.last().id;

    if (batch.size < 100) break;
  }

  return messages.sort(
    (a, b) => a.createdTimestamp - b.createdTimestamp
  );
}

function serializeMessage(message) {
  return {
    id: message.id,
    authorId: message.author?.id || null,
    authorTag:
      message.author?.tag ||
      message.author?.username ||
      'Unknown',
    authorBot: Boolean(message.author?.bot),
    content: message.content || '',
    createdAt:
      message.createdAt?.toISOString?.() ||
      null,
    editedAt:
      message.editedAt?.toISOString?.() ||
      null,
    attachments: [...message.attachments.values()].map((file) => ({
      id: file.id,
      name: file.name,
      url: file.url,
      contentType: file.contentType,
      size: file.size,
    })),
    embeds: message.embeds.map((embed) => ({
      title: embed.title || null,
      description: embed.description || null,
      url: embed.url || null,
      color: embed.color || null,
      fields: embed.fields || [],
    })),
  };
}

function buildJsonTranscript(ticket, messages, meta = {}) {
  return {
    generatedAt: now(),

    ticket: {
      ticketId: getTicketId(ticket),
      displayId: ticket.displayId || null,
      guildId: ticket.guildId,
      discordChannelId: getChannelId(ticket),

      title: ticket.title || null,
      type: ticket.type || null,
      status: ticket.status || null,
      priority: ticket.priority || null,

      creatorId: getCreatorId(ticket),
      claimedById: ticket.claimedById || null,

      createdAt: ticket.createdAt || null,
      updatedAt: ticket.updatedAt || null,
      closedAt: ticket.closedAt || null,
      archivedAt: ticket.archivedAt || null,

      source: ticket.source || null,
      sourceId: ticket.sourceId || null,

      metadata: ticket.metadata || {},
    },

    meta,

    messageCount: messages.length,

    messages: messages.map(serializeMessage),
  };
}

function buildHtmlTranscript(ticket, json) {
  const ticketId = getTicketId(ticket);
  const channelId = getChannelId(ticket);

  const messagesHtml = json.messages
    .map((msg) => {
      const attachments = msg.attachments
        .map(
          (file) =>
            `<li><a href="${safe(file.url)}" target="_blank">${safe(
              file.name || file.url
            )}</a></li>`
        )
        .join('');

      const embeds = msg.embeds
        .map(
          (embed) => `
            <div class="embed">
              ${
                embed.title
                  ? `<div class="embed-title">${safe(embed.title)}</div>`
                  : ''
              }
              ${
                embed.description
                  ? `<div class="embed-description">${safe(embed.description)}</div>`
                  : ''
              }
            </div>
          `
        )
        .join('');

      return `
        <div class="message">
          <div class="message-header">
            <span class="author">${safe(msg.authorTag)}</span>
            <span class="time">${safe(msg.createdAt || '')}</span>
          </div>
          <div class="content">${safe(msg.content || '') || '<em>No text content</em>'}</div>
          ${
            attachments
              ? `<ul class="attachments">${attachments}</ul>`
              : ''
          }
          ${embeds || ''}
        </div>
      `;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Ticket Transcript - ${safe(ticketId)}</title>
  <style>
    body {
      margin: 0;
      padding: 32px;
      background: #0b0f19;
      color: #e5e7eb;
      font-family: Arial, Helvetica, sans-serif;
    }

    .wrap {
      max-width: 1100px;
      margin: 0 auto;
    }

    .header {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 18px;
      padding: 24px;
      margin-bottom: 24px;
    }

    h1 {
      margin: 0 0 12px;
      font-size: 28px;
    }

    .meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 10px;
      color: #9ca3af;
      font-size: 14px;
    }

    .message {
      background: #111827;
      border: 1px solid #1f2937;
      border-radius: 14px;
      padding: 16px;
      margin-bottom: 12px;
    }

    .message-header {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
    }

    .author {
      color: #60a5fa;
      font-weight: 700;
    }

    .time {
      color: #6b7280;
      font-size: 12px;
    }

    .content {
      white-space: pre-wrap;
      line-height: 1.45;
    }

    .attachments {
      margin-top: 10px;
    }

    a {
      color: #93c5fd;
    }

    .embed {
      margin-top: 10px;
      padding: 10px 12px;
      border-left: 4px solid #6366f1;
      background: #0f172a;
      border-radius: 8px;
    }

    .embed-title {
      font-weight: 700;
      margin-bottom: 4px;
    }

    .embed-description {
      color: #d1d5db;
      white-space: pre-wrap;
    }

    .footer {
      color: #6b7280;
      margin-top: 32px;
      font-size: 13px;
      text-align: center;
    }
  </style>
</head>
<body>
  <main class="wrap">
    <section class="header">
      <h1>Goliath Ticket Transcript</h1>
      <div class="meta">
        <div><strong>Ticket:</strong> ${safe(ticketId)}</div>
        <div><strong>Display ID:</strong> ${safe(ticket.displayId || 'N/A')}</div>
        <div><strong>Status:</strong> ${safe(ticket.status || 'unknown')}</div>
        <div><strong>Priority:</strong> ${safe(ticket.priority || 'normal')}</div>
        <div><strong>Guild:</strong> ${safe(ticket.guildId)}</div>
        <div><strong>Channel:</strong> ${safe(channelId || 'unknown')}</div>
        <div><strong>Generated:</strong> ${safe(json.generatedAt)}</div>
        <div><strong>Messages:</strong> ${safe(json.messageCount)}</div>
      </div>
    </section>

    ${messagesHtml || '<p>No messages found.</p>'}

    <div class="footer">
      Generated by KSJ Goliath
    </div>
  </main>
</body>
</html>`;
}

function getTranscriptTargetChannelId(ticket, options = {}) {
  if (options.channelId) return options.channelId;
  if (options.transcriptChannelId) return options.transcriptChannelId;

  if (ticket.transcriptsChannelId) return ticket.transcriptsChannelId;
  if (ticket.transcriptChannelId) return ticket.transcriptChannelId;
  if (ticket.logsChannelId) return ticket.logsChannelId;
  if (ticket.logChannelId) return ticket.logChannelId;

  const panelMeta = ticket.metadata || {};

  if (panelMeta.transcriptsChannelId) return panelMeta.transcriptsChannelId;
  if (panelMeta.logsChannelId) return panelMeta.logsChannelId;

  const settings = getTicketSettings(ticket.guildId);

  return (
    settings?.discord?.transcriptsChannelId ||
    settings?.discord?.logsChannelId ||
    settings?.transcriptsChannelId ||
    settings?.logsChannelId ||
    null
  );
}

async function createTranscript(client, ticket, options = {}) {
  if (!client) throw new Error('Missing Discord client.');
  if (!ticket?.guildId) throw new Error('Missing ticket guildId.');

  const channelId = getChannelId(ticket);

  if (!channelId) {
    throw new Error('Missing ticket Discord channel id.');
  }

  const guild = await client.guilds
    .fetch(ticket.guildId)
    .catch(() => null);

  if (!guild) throw new Error('Guild not found.');

  const channel = await guild.channels
    .fetch(channelId)
    .catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    throw new Error('Ticket channel not found or is not a text channel.');
  }

  const messages = await fetchAllMessages(
    channel,
    options.limit || 1000
  );

  const jsonTranscript = buildJsonTranscript(ticket, messages, {
    channelName: channel.name,
    guildName: guild.name,
    generatedBy: options.generatedBy || null,
    reason: options.reason || null,
  });

  const htmlTranscript = buildHtmlTranscript(
    ticket,
    jsonTranscript
  );

  const dir = getTranscriptDir(ticket.guildId);
  ensureDir(dir);

  const htmlFileName = formatFileName(ticket, 'html');
  const jsonFileName = formatFileName(ticket, 'json');

  const htmlPath = path.join(dir, htmlFileName);
  const jsonPath = path.join(dir, jsonFileName);

  fs.writeFileSync(htmlPath, htmlTranscript, 'utf8');
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(jsonTranscript, null, 2),
    'utf8'
  );

  return {
    ticketId: getTicketId(ticket),
    guildId: ticket.guildId,
    discordChannelId: channelId,

    messageCount: messages.length,

    htmlPath,
    jsonPath,

    htmlFileName,
    jsonFileName,

    generatedAt: jsonTranscript.generatedAt,
  };
}

async function uploadTranscript(client, ticket, transcript, options = {}) {
  if (!client) throw new Error('Missing Discord client.');
  if (!ticket?.guildId) throw new Error('Missing ticket guildId.');

  if (!transcript?.htmlPath || !transcript?.jsonPath) {
    throw new Error('Missing transcript files.');
  }

  const targetChannelId = getTranscriptTargetChannelId(
    ticket,
    options
  );

  if (!targetChannelId) {
    return {
      uploaded: false,
      reason: 'No transcript channel configured.',
    };
  }

  const guild = await client.guilds
    .fetch(ticket.guildId)
    .catch(() => null);

  if (!guild) throw new Error('Guild not found.');

  const channel = await guild.channels
    .fetch(targetChannelId)
    .catch(() => null);

  if (!channel || channel.type !== ChannelType.GuildText) {
    return {
      uploaded: false,
      reason: 'Transcript channel not found.',
    };
  }

  const htmlAttachment = new AttachmentBuilder(
    transcript.htmlPath,
    {
      name: transcript.htmlFileName,
    }
  );

  const jsonAttachment = new AttachmentBuilder(
    transcript.jsonPath,
    {
      name: transcript.jsonFileName,
    }
  );

  const message = await channel.send({
    content:
      `📄 **Ticket Transcript Generated**\n` +
      `> Ticket: \`${getTicketId(ticket)}\`\n` +
      `> Display ID: \`${ticket.displayId || 'N/A'}\`\n` +
      `> Status: \`${ticket.status || 'unknown'}\`\n` +
      `> Messages: \`${transcript.messageCount}\``,
    files: [
      htmlAttachment,
      jsonAttachment,
    ],
  });

  return {
    uploaded: true,
    channelId: channel.id,
    messageId: message.id,
    url: message.url,
  };
}

async function createAndUploadTranscript(client, ticket, options = {}) {
  const transcript = await createTranscript(
    client,
    ticket,
    options
  );

  const upload = await uploadTranscript(
    client,
    ticket,
    transcript,
    options
  );

  return {
    ...transcript,
    upload,
  };
}

module.exports = {
  createTranscript,
  uploadTranscript,
  createAndUploadTranscript,

  buildJsonTranscript,
  buildHtmlTranscript,
  fetchAllMessages,

  getTicketId,
  getChannelId,
};