import React from 'react';

import AccessControlCard from './AccessControlCard';

export const MODULE_ACCESS_ITEMS = [
  ['tickets', 'Tickets', 'Ticket panels, claims, transcripts and support workflows.'],
  ['forms', 'Forms', 'Universal forms, submissions and form-to-ticket workflows.'],
  ['verification', 'Verification', 'Verification panels, rules and member onboarding.'],
  ['autoRoles', 'Auto Roles', 'Join roles, bot roles and automatic assignment.'],
  ['reactionRoles', 'Reaction Roles', 'Reaction role menus and emoji mappings.'],
  ['welcome', 'Welcome & Leave', 'Welcome, leave and DM welcome messages.'],
  ['leveling', 'Leveling', 'XP, rewards, levels and leaderboard controls.'],
  ['giveaways', 'Giveaways', 'Giveaway creation, winners and review tools.'],
  ['polls', 'Polls', 'Community polls, deployment and results.'],
  ['translation', 'Translation', 'Translation channels, language settings and provider controls.'],
  ['embedStudio', 'Embed Studio', 'Embed drafts, presets, deployments and previews.'],
  ['tempVoice', 'Temp Voice', 'Temporary voice hubs and owner controls.'],
  ['starboard', 'Starboard', 'Popular message highlighting and thresholds.'],
  ['sticky', 'Sticky Messages', 'Persistent channel messages and updates.'],
  ['social', 'Social Alerts', 'Creator account alerts across supported platforms.'],
  ['stats', 'Stats', 'Server, module and workflow statistics.'],
];

export function getConfiguredModuleAccessCount(modulesAccess = {}) {
  return MODULE_ACCESS_ITEMS.filter(([key]) => {
    const access = modulesAccess[key] || {};
    const roles = Array.isArray(access.roles) ? access.roles : [];
    const users = Array.isArray(access.users) ? access.users : [];
    return roles.length || users.length;
  }).length;
}

export default function ModuleAccessPanel({ guildRoles, modulesAccess = {}, onChange, theme }) {
  return <div style={{ display: 'grid', gap: 12 }}>
    {MODULE_ACCESS_ITEMS.map(([key, label, description]) => <AccessControlCard key={key} access={modulesAccess[key]} description={description} guildRoles={guildRoles} onChange={(nextAccess) => onChange?.(key, nextAccess)} theme={theme} title={label} />)}
  </div>;
}
