import React from 'react';

import AccessControlCard from './AccessControlCard';

export const COMMAND_ACCESS_ITEMS = [
  ['ban', '/ban', 'Restrict a member from returning to the server.'],
  ['kick', '/kick', 'Remove a member from the server.'],
  ['timeout', '/timeout', 'Temporarily restrict a member.'],
  ['mute', '/mute', 'Mute a member in supported moderation workflows.'],
  ['warn', '/warn', 'Issue a moderation warning.'],
  ['purge', '/purge', 'Bulk remove messages from a channel.'],
  ['lock', '/lock', 'Lock a channel during incidents or moderation actions.'],
  ['unlock', '/unlock', 'Unlock a previously locked channel.'],
  ['slowmode', '/slowmode', 'Adjust channel slowmode.'],
  ['ticket', '/ticket', 'Create or manage support tickets.'],
  ['claim', '/claim', 'Claim ownership of an active support ticket.'],
  ['close', '/close', 'Close an active support ticket.'],
  ['forms', '/forms', 'Manage or deploy form workflows.'],
  ['translate', '/translate', 'Use translation tools and commands.'],
  ['backup', '/backup', 'Create or inspect server backups.'],
  ['restore', '/restore', 'Restore server data from backups.'],
  ['deploy', '/deploy', 'Deploy configured Goliath modules.'],
  ['publish', '/publish', 'Publish configured dashboard or module content.'],
];

export function getConfiguredCommandAccessCount(commandAccess = {}) {
  return COMMAND_ACCESS_ITEMS.filter(([key]) => {
    const access = commandAccess[key] || {};
    const roles = Array.isArray(access.roles) ? access.roles : [];
    const users = Array.isArray(access.users) ? access.users : [];
    return roles.length || users.length;
  }).length;
}

export default function CommandAccessPanel({ commandAccess = {}, guildRoles, onChange, theme }) {
  return <div style={{ display: 'grid', gap: 12 }}>
    {COMMAND_ACCESS_ITEMS.map(([key, label, description]) => <AccessControlCard key={key} access={commandAccess[key]} description={description} guildRoles={guildRoles} onChange={(nextAccess) => onChange?.(key, nextAccess)} theme={theme} title={label} />)}
  </div>;
}
