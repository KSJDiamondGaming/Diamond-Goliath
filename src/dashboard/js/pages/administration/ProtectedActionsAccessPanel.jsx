import React from 'react';

import AccessControlCard from './AccessControlCard';

export const PROTECTED_ACTION_ITEMS = [
  ['deployModule', 'Deploy Module', 'Control who can deploy or redeploy configured modules.'],
  ['publishPanel', 'Publish Panel', 'Control who can publish panels, embeds or interactive content.'],
  ['syncDiscordRoles', 'Sync Discord Roles', 'Control who can sync role data with Discord.'],
  ['moveRoleHierarchy', 'Move Role Hierarchy', 'Control who can change role ordering and hierarchy.'],
  ['manageRoles', 'Manage Roles', 'Control who can perform high-impact role management.'],
  ['restoreBackup', 'Restore Backup', 'Control who can restore server data from backup snapshots.'],
  ['manageBackups', 'Manage Backups', 'Control who can manage stored backup records.'],
  ['manageRuntime', 'Manage Runtime', 'Control who can use runtime recovery controls.'],
  ['changeBilling', 'Change Billing', 'Control who can change billing or entitlement settings.'],
  ['changeSecuritySettings', 'Change Security Settings', 'Control who can modify security and protection settings.'],
  ['manageGuildData', 'Manage Guild Data', 'Control who can manage stored guild configuration.'],
  ['ownerOverride', 'Owner Override', 'Control who can use owner-level emergency controls.'],
];

export function getConfiguredProtectedActionAccessCount(protectedActions = {}) {
  return PROTECTED_ACTION_ITEMS.filter(([key]) => {
    const access = protectedActions[key] || {};
    const roles = Array.isArray(access.roles) ? access.roles : [];
    const users = Array.isArray(access.users) ? access.users : [];
    return roles.length || users.length;
  }).length;
}

export default function ProtectedActionsAccessPanel({ guildRoles, onChange, protectedActions = {}, theme }) {
  return <div style={{ display: 'grid', gap: 12 }}>
    {PROTECTED_ACTION_ITEMS.map(([key, label, description]) => <AccessControlCard key={key} access={protectedActions[key]} description={description} guildRoles={guildRoles} onChange={(nextAccess) => onChange?.(key, nextAccess)} theme={theme} title={label} />)}
  </div>;
}
