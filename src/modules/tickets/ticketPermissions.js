// src/modules/tickets/ticketPermissions.js

const {
  PermissionsBitField,
} = require('discord.js');

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

  MANAGE_SETTINGS:
    'manage_settings',

  MANAGE_PANELS:
    'manage_panels',
});

const LOCKED_STATUSES = [
  'closed',
  'archived',
];

function normaliseArray(
  value
) {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter(Boolean)
    ),
  ];
}

function hasRole(
  member,
  roleId
) {
  if (!member || !roleId) {
    return false;
  }

  return member.roles?.cache?.has(
    roleId
  );
}

function hasAnyRole(
  member,
  roleIds = []
) {
  if (
    !member ||
    !Array.isArray(roleIds)
  ) {
    return false;
  }

  return roleIds.some(
    (roleId) =>
      member.roles?.cache?.has(
        roleId
      )
  );
}

function isGuildOwner(
  member
) {
  return (
    member?.guild?.ownerId ===
    member?.id
  );
}

function isAdministrator(
  member
) {
  return member?.permissions?.has?.(
    PermissionsBitField.Flags
      .Administrator
  );
}

function isSystemOverride(
  member
) {
  return (
    isGuildOwner(member) ||
    isAdministrator(member)
  );
}

function getPermissionConfig(
  settings = {}
) {
  return {
    allowCreatorView:
      settings?.permissions
        ?.allowCreatorView !==
      false,

    allowUserClose:
      settings?.permissions
        ?.allowUserClose ===
      true,

    managerRoleIds:
      normaliseArray(
        settings?.permissions
          ?.managerRoleIds
      ),

    staffRoleIds:
      normaliseArray(
        settings?.permissions
          ?.staffRoleIds
      ),

    viewerRoleIds:
      normaliseArray(
        settings?.permissions
          ?.viewerRoleIds
      ),
  };
}

function getPanelPermissionConfig(
  panel = {}
) {
  return {
    allowUserClose:
      panel?.allowUserClose ===
      true,

    managerRoleIds:
      normaliseArray(
        panel?.managerRoleIds
      ),

    staffRoleIds:
      normaliseArray(
        panel?.staffRoleIds
      ),

    viewerRoleIds:
      normaliseArray(
        panel?.viewerRoleIds
      ),
  };
}

function getMergedRoles(
  globalRoles = [],
  panelRoles = []
) {
  return [
    ...new Set([
      ...normaliseArray(
        globalRoles
      ),
      ...normaliseArray(
        panelRoles
      ),
    ]),
  ];
}

function isManager(
  member,
  settings = {},
  panel = null
) {
  const globalConfig =
    getPermissionConfig(
      settings
    );

  const panelConfig =
    getPanelPermissionConfig(
      panel
    );

  return hasAnyRole(
    member,
    getMergedRoles(
      globalConfig.managerRoleIds,
      panelConfig.managerRoleIds
    )
  );
}

function isStaff(
  member,
  settings = {},
  panel = null
) {
  const globalConfig =
    getPermissionConfig(
      settings
    );

  const panelConfig =
    getPanelPermissionConfig(
      panel
    );

  return hasAnyRole(
    member,
    getMergedRoles(
      globalConfig.staffRoleIds,
      panelConfig.staffRoleIds
    )
  );
}

function isViewer(
  member,
  settings = {},
  panel = null
) {
  const globalConfig =
    getPermissionConfig(
      settings
    );

  const panelConfig =
    getPanelPermissionConfig(
      panel
    );

  return hasAnyRole(
    member,
    getMergedRoles(
      globalConfig.viewerRoleIds,
      panelConfig.viewerRoleIds
    )
  );
}

function isCreator(
  member,
  ticket
) {
  if (!member || !ticket) {
    return false;
  }

  return (
    ticket.creatorId ===
    member.id
  );
}

function isAllowedUser(
  member,
  ticket
) {
  if (!member || !ticket) {
    return false;
  }

  return (
    Array.isArray(
      ticket.allowedUserIds
    ) &&
    ticket.allowedUserIds.includes(
      member.id
    )
  );
}

function isTicketLocked(
  ticket
) {
  return LOCKED_STATUSES.includes(
    String(
      ticket?.status || ''
    ).toLowerCase()
  );
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
    isSystemOverride(
      member
    )
  ) {
    return true;
  }

  if (
    isManager(
      member,
      settings,
      panel
    ) ||
    isStaff(
      member,
      settings,
      panel
    ) ||
    isViewer(
      member,
      settings,
      panel
    )
  ) {
    return true;
  }

  const config =
    getPermissionConfig(
      settings
    );

  if (
    config.allowCreatorView &&
    isCreator(
      member,
      ticket
    )
  ) {
    return true;
  }

  if (
    config.allowCreatorView &&
    isAllowedUser(
      member,
      ticket
    )
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
    isSystemOverride(
      member
    )
  ) {
    return true;
  }

  return isManager(
    member,
    settings,
    panel
  );
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
    isSystemOverride(
      member
    )
  ) {
    return true;
  }

  return (
    isManager(
      member,
      settings,
      panel
    ) ||
    isStaff(
      member,
      settings,
      panel
    )
  );
}

function canUserManageOwnTicket({
  member,
  ticket,
  settings = {},
  panel = null,
}) {
  if (
    !member ||
    !ticket
  ) {
    return false;
  }

  if (
    !isCreator(
      member,
      ticket
    )
  ) {
    return false;
  }

  if (
    isTicketLocked(
      ticket
    )
  ) {
    return false;
  }

  const globalConfig =
    getPermissionConfig(
      settings
    );

  const panelConfig =
    getPanelPermissionConfig(
      panel
    );

  return (
    globalConfig.allowUserClose ||
    panelConfig.allowUserClose
  );
}

function canClaimTicket({
  member,
  ticket,
  settings = {},
  panel = null,
}) {
  if (
    !canStaffAction({
      member,
      settings,
      panel,
    })
  ) {
    return false;
  }

  if (
    isTicketLocked(
      ticket
    )
  ) {
    return false;
  }

  return true;
}

function canDeleteTicket({
  member,
  settings = {},
  panel = null,
}) {
  return canManageTicket({
    member,
    settings,
    panel,
  });
}

function can(
  member,
  action,
  ticket = null,
  panel = null
) {
  if (
    !member ||
    !member.guild
  ) {
    return false;
  }

  const settings =
    getTicketSettings(
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
    case TICKET_ACTIONS.ASSIGN:
    case TICKET_ACTIONS.ADD_NOTE:
    case TICKET_ACTIONS.APPROVE:
    case TICKET_ACTIONS.DENY:
      return canStaffAction({
        member,
        settings,
        panel,
      });

    case TICKET_ACTIONS.CLAIM:
      return canClaimTicket({
        member,
        ticket,
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
          settings,
          panel,
        })
      );

    case TICKET_ACTIONS.REOPEN:
    case TICKET_ACTIONS.ARCHIVE:
    case TICKET_ACTIONS.MANAGE_SETTINGS:
    case TICKET_ACTIONS.MANAGE_PANELS:
      return canManageTicket({
        member,
        settings,
        panel,
      });

    case TICKET_ACTIONS.DELETE:
      return canDeleteTicket({
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
  isSystemOverride,

  isManager,
  isStaff,
  isViewer,

  isCreator,
  isAllowedUser,

  isTicketLocked,

  canViewTicket,
  canManageTicket,
  canStaffAction,
  canUserManageOwnTicket,

  canClaimTicket,
  canDeleteTicket,

  getPermissionConfig,
  getPanelPermissionConfig,
  getMergedRoles,
};