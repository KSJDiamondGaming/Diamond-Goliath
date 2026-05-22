// src/modules/tickets/ticketPermissions.js

const {
  getTicketSettings,
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

function hasRole(member, roleId) {
  if (!member || !roleId) {
    return false;
  }

  return member.roles?.cache?.has(roleId);
}

function hasAnyRole(member, roleIds = []) {
  if (!member || !Array.isArray(roleIds)) {
    return false;
  }

  return roleIds.some((roleId) =>
    member.roles?.cache?.has(roleId)
  );
}

function isGuildOwner(member) {
  return member?.guild?.ownerId === member?.id;
}

function isAdministrator(member) {
  return member?.permissions?.has?.('Administrator');
}

function getPermissionConfig(settings = {}) {
  return {
    allowCreatorView:
      settings?.permissions?.allowCreatorView !== false,

    managerRoleIds:
      settings?.permissions?.managerRoleIds || [],

    staffRoleIds:
      settings?.permissions?.staffRoleIds || [],

    viewerRoleIds:
      settings?.permissions?.viewerRoleIds || [],
  };
}

function getPanelPermissionConfig(panel = {}) {
  return {
    managerRoleIds:
      panel?.managerRoleIds || [],

    staffRoleIds:
      panel?.staffRoleIds || [],

    viewerRoleIds:
      panel?.viewerRoleIds || [],
  };
}

function isManager(member, settings = {}, panel = null) {
  const globalConfig = getPermissionConfig(settings);
  const panelConfig = getPanelPermissionConfig(panel);

  return (
    hasAnyRole(member, globalConfig.managerRoleIds) ||
    hasAnyRole(member, panelConfig.managerRoleIds)
  );
}

function isStaff(member, settings = {}, panel = null) {
  const globalConfig = getPermissionConfig(settings);
  const panelConfig = getPanelPermissionConfig(panel);

  return (
    hasAnyRole(member, globalConfig.staffRoleIds) ||
    hasAnyRole(member, panelConfig.staffRoleIds)
  );
}

function isViewer(member, settings = {}, panel = null) {
  const globalConfig = getPermissionConfig(settings);
  const panelConfig = getPanelPermissionConfig(panel);

  return (
    hasAnyRole(member, globalConfig.viewerRoleIds) ||
    hasAnyRole(member, panelConfig.viewerRoleIds)
  );
}

function isCreator(member, ticket) {
  if (!member || !ticket) {
    return false;
  }

  return ticket.creatorId === member.id;
}

function isAllowedUser(member, ticket) {
  if (!member || !ticket) {
    return false;
  }

  if (!Array.isArray(ticket.allowedUserIds)) {
    return false;
  }

  return ticket.allowedUserIds.includes(member.id);
}

function canViewTicket({
  member,
  ticket,
  settings = {},
  panel = null,
}) {
  if (!member || !ticket) {
    return false;
  }

  if (
    isGuildOwner(member) ||
    isAdministrator(member)
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

  const permissionConfig =
    getPermissionConfig(settings);

  if (
    permissionConfig.allowCreatorView &&
    isCreator(member, ticket)
  ) {
    return true;
  }

  if (
    permissionConfig.allowCreatorView &&
    isAllowedUser(member, ticket)
  ) {
    return true;
  }

  return false;
}

function canManageTicket({
  member,
  settings = {},
  panel = null,
}) {
  if (!member) {
    return false;
  }

  if (
    isGuildOwner(member) ||
    isAdministrator(member)
  ) {
    return true;
  }

  return isManager(member, settings, panel);
}

function canStaffAction({
  member,
  settings = {},
  panel = null,
}) {
  if (!member) {
    return false;
  }

  if (
    isGuildOwner(member) ||
    isAdministrator(member)
  ) {
    return true;
  }

  return (
    isManager(member, settings, panel) ||
    isStaff(member, settings, panel)
  );
}

function canUserManageOwnTicket({
  member,
  ticket,
  panel = null,
}) {
  if (!member || !ticket) {
    return false;
  }

  if (!isCreator(member, ticket)) {
    return false;
  }

  if (!panel) {
    return false;
  }

  return Boolean(panel.allowUserClose);
}

function can(
  member,
  action,
  ticket = null,
  panel = null
) {
  if (!member || !member.guild) {
    return false;
  }

  const settings = getTicketSettings(
    member.guild.id
  );

  switch (action) {
    case TICKET_ACTIONS.VIEW:
      return canViewTicket({
        member,
        ticket,
        settings,
        panel,
      });

    case TICKET_ACTIONS.VIEW_ALL:
      return canStaffAction({
        member,
        settings,
        panel,
      });

    case TICKET_ACTIONS.CREATE:
      return true;

    case TICKET_ACTIONS.UPDATE:
    case TICKET_ACTIONS.CLAIM:
    case TICKET_ACTIONS.ASSIGN:
    case TICKET_ACTIONS.ADD_NOTE:
    case TICKET_ACTIONS.APPROVE:
    case TICKET_ACTIONS.DENY:
      return canStaffAction({
        member,
        settings,
        panel,
      });

    case TICKET_ACTIONS.CLOSE:
      return (
        canStaffAction({
          member,
          settings,
          panel,
        }) ||
        canUserManageOwnTicket({
          member,
          ticket,
          panel,
        })
      );

    case TICKET_ACTIONS.REOPEN:
    case TICKET_ACTIONS.ARCHIVE:
    case TICKET_ACTIONS.DELETE:
    case TICKET_ACTIONS.MANAGE_SETTINGS:
    case TICKET_ACTIONS.MANAGE_PANELS:
      return canManageTicket({
        member,
        settings,
        panel,
      });

    default:
      return false;
  }
}

module.exports = {
  TICKET_ACTIONS,

  can,

  hasRole,
  hasAnyRole,

  isGuildOwner,
  isAdministrator,

  isManager,
  isStaff,
  isViewer,

  isCreator,
  isAllowedUser,

  canViewTicket,
  canManageTicket,
  canStaffAction,
  canUserManageOwnTicket,
};