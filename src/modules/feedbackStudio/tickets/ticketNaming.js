// src/modules/feedbackStudio/tickets/ticketNaming.js

'use strict';

const DEFAULT_TICKET_TYPE = 'ticket';
const DEFAULT_TICKET_USER = 'user';
const DEFAULT_TICKET_NUMBER = 0;
const DEFAULT_TICKET_PADDING = 4;
const DEFAULT_USERNAME_LENGTH = 10;
const MAX_DISCORD_CHANNEL_NAME_LENGTH = 90;

function cleanTicketType(value, fallback = DEFAULT_TICKET_TYPE) {
  return (
    String(value || fallback)
      .toLowerCase()
      .replace(/_/g, '-')
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}

function cleanChannelPart(value, fallback = DEFAULT_TICKET_USER, maxLength = DEFAULT_USERNAME_LENGTH) {
  const cleaned = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, maxLength);

  return cleaned || fallback;
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

  return creatorId || DEFAULT_TICKET_USER;
}

function getTicketNumber(ticket) {
  return (
    ticket?.number ||
    ticket?.ticketNumber ||
    String(ticket?.displayId || '').match(/(\d+)$/)?.[1] ||
    DEFAULT_TICKET_NUMBER
  );
}

function buildTicketChannelName(ticket, guild = null, options = {}) {
  if (!ticket) return `${DEFAULT_TICKET_TYPE}-${DEFAULT_TICKET_USER}-0000`;

  const type = cleanTicketType(ticket.type || options.type || DEFAULT_TICKET_TYPE);
  const username = cleanChannelPart(
    getTicketCreatorName(ticket, guild),
    DEFAULT_TICKET_USER,
    options.usernameLength || DEFAULT_USERNAME_LENGTH
  );

  const padding = Number(options.padding || DEFAULT_TICKET_PADDING);
  const number = String(getTicketNumber(ticket)).padStart(padding, '0');

  return `${type}-${username}-${number}`.slice(0, MAX_DISCORD_CHANNEL_NAME_LENGTH);
}

module.exports = {
  DEFAULT_TICKET_TYPE,
  DEFAULT_TICKET_USER,
  DEFAULT_TICKET_NUMBER,
  DEFAULT_TICKET_PADDING,
  DEFAULT_USERNAME_LENGTH,
  MAX_DISCORD_CHANNEL_NAME_LENGTH,

  cleanTicketType,
  cleanChannelPart,
  getTicketCreatorName,
  getTicketNumber,
  buildTicketChannelName,
};
