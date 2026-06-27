import { DISCORD_ROLE_PERMISSION_GROUPS, DEFAULT_ROLE_PERMISSIONS } from './rolePermissionGroups';

export function getRolePermissionMatrixStats() {
  const permissions = DISCORD_ROLE_PERMISSION_GROUPS.flatMap(([, items]) => items.map(([key]) => key));
  return {
    defaultCount: DEFAULT_ROLE_PERMISSIONS.length,
    groupCount: DISCORD_ROLE_PERMISSION_GROUPS.length,
    permissionCount: new Set(permissions).size,
  };
}
