// src/modules/tickets/ticketPermissions.js

'use strict';

const {
  PermissionsBitField,
} = require('discord.js');

const {
  getTicketSettings,
  getPanel,
} = require('./ticketStore');

const TICKET_ACTIONS = Object.freeze({
  VIEW: 'view',
  VIEW_ALL: 'view_all',

  CREATE: 'create',

  UPDATE: 'update',

  CLAIM: 'claim',
  ASSIGN: 'assign',

  CLOSE: 'close',
  REOPEN: 'reopen',

  APPROVE: 'approve',
  DENY: 'deny',

  ARCHIVE: 'archive',
  DELETE: 'delete',

  ADD_NOTE: 'add_note',

  MANAGE_SETTINGS: 'manage_settings',
  MANAGE_PANELS: 'manage_panels',
});

const LOCKED_STATUSES = [
  'closed',
  'archived',
];

function normaliseArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [...new Set(value.filter(Boolean).map(String))];
}

function normaliseStatus(status) {
  return String(status || 'open').toLowerCase();
}

function hasRole(member, roleId) {
  if (!member || !roleId) return false;

  return Boolean(
    member.roles?.cache?.has(String(roleId))
  );
}

function hasAnyRole(member, roleIds = []) {
  const ids = normaliseArray(roleIds);

  if (!member || !ids.length) {
    return false;
  }

  return ids.some((roleId) => hasRole(member, roleId));
}

function isGuildOwner(member) {
  return member?.guild?.ownerId === member?.id;
}

function isAdministrator(member) {
  return Boolean(
    member?.permissions?.has?.(
      PermissionsBitField.Flags.Administrator
    )
  );
}

function hasManageGuild(member) {
  return Boolean(
    member?.permissions?.has?.(
      PermissionsBitField.Flags.ManageGuild
    )
  );
}

function isSystemOverride(member) {
  return (
    isGuildOwner(member) ||
    isAdministrator(member)
  );
}

function getPermissionConfig(settings = {}) {
  const permissions = settings?.permissions || {};

  return {
    administratorOverride:
      permissions.administratorOverride !== false,

    allowCreatorView:
      permissions.allowCreatorView !== false,

    allowUserClose:
      permissions.allowUserClose === true,

    managerRoleIds:
      normaliseArray(
        permissions.managerRoleIds ||
          permissions.managerRoles ||
          permissions.managers ||
          []
      ),

    staffRoleIds:
      normaliseArray(
        permissions.staffRoleIds ||
          permissions.staffRoles ||
          permissions.staff ||
          []
      ),

    viewerRoleIds:
      normaliseArray(
        permissions.viewerRoleIds ||
          permissions.viewerRoles ||
          permissions.viewers ||
          []
      ),
  };
}

function getPanelPermissionConfig(panel = {}) {
  return {
    allowUserClose:
      panel?.allowUserClose === true,

    managerRoleIds:
      normaliseArray(panel?.managerRoleIds),

    staffRoleIds:
      normaliseArray(panel?.staffRoleIds),

    viewerRoleIds:
      normaliseArray(panel?.viewerRoleIds),
  };
}

function getMergedRoles(globalRoles = [], panelRoles = []) {
  return [
    ...new Set([
      ...normaliseArray(globalRoles),
      ...normaliseArray(panelRoles),
    ]),
  ];
}

function getTicketPanel(guildId, ticket = null) {
  if (!guildId || !ticket) return null;

  const panelId =
    ticket.metadata?.panelId ||
    ticket.panelId ||
    ticket.sourceId ||
    null;

  if (!panelId) return null;

  return getPanel(guildId, panelId);
}

function getMergedPermissionConfig(settings = {}, panel = null) {
  const globalConfig = getPermissionConfig(settings);
  const panelConfig = getPanelPermissionConfig(panel);

  return {
    administratorOverride:
      globalConfig.administratorOverride,

    allowCreatorView:
      globalConfig.allowCreatorView,

    allowUserClose:
      panelConfig.allowUserClose ||
      globalConfig.allowUserClose,

    managerRoleIds:
      getMergedRoles(
        globalConfig.managerRoleIds,
        panelConfig.managerRoleIds
      ),

    staffRoleIds:
      getMergedRoles(
        globalConfig.staffRoleIds,
        panelConfig.staffRoleIds
      ),

    viewerRoleIds:
      getMergedRoles(
        globalConfig.viewerRoleIds,
        panelConfig.viewerRoleIds
      ),
  };
}

function isManager(member, settings = {}, panel = null) {
  const config =
    getMergedPermissionConfig(settings, panel);

  return hasAnyRole(
    member,
    config.managerRoleIds
  );
}

function isStaff(member, settings = {}, panel = null) {
  const config =
    getMergedPermissionConfig(settings, panel);

  return hasAnyRole(
    member,
    config.staffRoleIds
  );
}

function isViewer(member, settings = {}, panel = null) {
  const config =
    getMergedPermissionConfig(settings, panel);

  return hasAnyRole(
    member,
    config.viewerRoleIds
  );
}

function isTicketCreator(member, ticket) {
  if (!member || !ticket) return false;

  const userId = member.id;

  return (
    ticket.creatorId === userId ||
    ticket.userId === userId ||
    ticket.createdBy === userId
  );
}

function isAllowedTicketUser(member, ticket) {
  if (!member || !ticket) return false;

  const allowedUserIds =
    normaliseArray(ticket.allowedUserIds);

  return allowedUserIds.includes(String(member.id));
}

function isLocked(ticket) {
  return LOCKED_STATUSES.includes(
    normaliseStatus(ticket?.status)
  );
}

function getRoleLevel(member, settings = {}, panel = null) {
  if (!member) return 'none';

  if (isSystemOverride(member)) {
    return 'admin';
  }

  if (isManager(member, settings, panel)) {
    return 'manager';
  }

  if (isStaff(member, settings, panel)) {
    return 'staff';
  }

  if (isViewer(member, settings, panel)) {
    return 'viewer';
  }

  return 'none';
}

function canView(member, ticket, settings = {}, panel = null) {
  if (!member) return false;

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  if (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel) ||
    isViewer(member, settings, panel)
  ) {
    return true;
  }

  if (
    config.allowCreatorView &&
    isTicketCreator(member, ticket)
  ) {
    return true;
  }

  if (isAllowedTicketUser(member, ticket)) {
    return true;
  }

  return false;
}

function canManagePanels(member, settings = {}, panel = null) {
  if (!member) return false;

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  if (hasManageGuild(member)) {
    return true;
  }

  return isManager(member, settings, panel);
}

function canCreate(member, settings = {}, panel = null) {
  if (!member) return false;

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  if (!panel) return true;

  const allowedRoleIds =
    normaliseArray(panel.allowedRoleIds);

  const blockedRoleIds =
    normaliseArray(panel.blockedRoleIds);

  if (
    blockedRoleIds.length &&
    hasAnyRole(member, blockedRoleIds)
  ) {
    return false;
  }

  if (
    allowedRoleIds.length &&
    !hasAnyRole(member, allowedRoleIds)
  ) {
    return false;
  }

  return true;
}

function canUpdate(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  if (isLocked(ticket)) {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function canClaim(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  if (isLocked(ticket)) {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function canAssign(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  if (isLocked(ticket)) {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return isManager(member, settings, panel);
}

function canClose(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  if (isLocked(ticket)) {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  if (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  ) {
    return true;
  }

  return (
    config.allowUserClose &&
    isTicketCreator(member, ticket)
  );
}

function canReopen(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  const status = normaliseStatus(ticket.status);

  if (!['closed', 'archived'].includes(status)) {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function canApproveOrDeny(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  if (isLocked(ticket)) {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function canArchive(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  const status = normaliseStatus(ticket.status);

  if (status === 'archived') {
    return false;
  }

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function canDelete(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return isManager(member, settings, panel);
}

function canAddNote(member, ticket, settings = {}, panel = null) {
  if (!member || !ticket) return false;

  const config =
    getMergedPermissionConfig(settings, panel);

  if (
    config.administratorOverride &&
    isSystemOverride(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function memberGuildId(member) {
  return member?.guild?.id || null;
}

function can(member, action, ticket = null) {
  if (!member) return false;

  const guildId =
    memberGuildId(member) ||
    ticket?.guildId ||
    null;

  const settings =
    guildId ? getTicketSettings(guildId) : {};

  const panel =
    ticket ? getTicketPanel(guildId, ticket) : null;

  switch (action) {
    case TICKET_ACTIONS.VIEW:
      return canView(member, ticket, settings, panel);

    case TICKET_ACTIONS.VIEW_ALL:
      return (
        isSystemOverride(member) ||
        isManager(member, settings, panel) ||
        isStaff(member, settings, panel) ||
        isViewer(member, settings, panel)
      );

    case TICKET_ACTIONS.CREATE:
      return canCreate(member, settings, panel);

    case TICKET_ACTIONS.UPDATE:
      return canUpdate(member, ticket, settings, panel);

    case TICKET_ACTIONS.CLAIM:
      return canClaim(member, ticket, settings, panel);

    case TICKET_ACTIONS.ASSIGN:
      return canAssign(member, ticket, settings, panel);

    case TICKET_ACTIONS.CLOSE:
      return canClose(member, ticket, settings, panel);

    case TICKET_ACTIONS.REOPEN:
      return canReopen(member, ticket, settings, panel);

    case TICKET_ACTIONS.APPROVE:
    case TICKET_ACTIONS.DENY:
      return canApproveOrDeny(member, ticket, settings, panel);

    case TICKET_ACTIONS.ARCHIVE:
      return canArchive(member, ticket, settings, panel);

    case TICKET_ACTIONS.DELETE:
      return canDelete(member, ticket, settings, panel);

    case TICKET_ACTIONS.ADD_NOTE:
      return canAddNote(member, ticket, settings, panel);

    case TICKET_ACTIONS.MANAGE_SETTINGS:
    case TICKET_ACTIONS.MANAGE_PANELS:
      return canManagePanels(member, settings, panel);

    default:
      return false;
  }
}

module.exports = {
  TICKET_ACTIONS,
  LOCKED_STATUSES,

  can,

  canView,
  canCreate,
  canUpdate,
  canClaim,
  canAssign,
  canClose,
  canReopen,
  canApproveOrDeny,
  canArchive,
  canDelete,
  canAddNote,
  canManagePanels,

  isManager,
  isStaff,
  isViewer,
  isTicketCreator,
  isAllowedTicketUser,
  isSystemOverride,
  isLocked,
  getRoleLevel,

  getPermissionConfig,
  getPanelPermissionConfig,
  getMergedPermissionConfig,
};
