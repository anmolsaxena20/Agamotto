import { useMemo } from 'react';

/**
 * Hook to compute user's permissions and role privileges for the active organization
 * @param {object} user - Current logged-in user
 * @param {Array} userGroups - Groups the current user belongs to
 */
export function usePermissions(user, userGroups = []) {
  return useMemo(() => {
    const isSuperAdmin = userGroups.some((g) => g.code === 'SUPER_ADMIN');
    const isAdmin = isSuperAdmin || userGroups.some((g) => g.code === 'ADMIN');
    const isDeveloper = isAdmin || userGroups.some((g) => g.code === 'DEVELOPER');

    // Aggregate unique permission keys across groups
    const permissionKeys = new Set();

    if (isSuperAdmin) {
      // Super admin has every permission
      permissionKeys.add('*');
    } else {
      userGroups.forEach((group) => {
        if (Array.isArray(group.permissions)) {
          group.permissions.forEach((perm) => {
            if (typeof perm === 'string') permissionKeys.add(perm);
            else if (perm?.key) permissionKeys.add(perm.key);
          });
        }
      });
    }

    const hasPermission = (requiredKey) => {
      if (isSuperAdmin) return true;
      if (permissionKeys.has('*')) return true;
      return permissionKeys.has(requiredKey);
    };

    return {
      isSuperAdmin,
      isAdmin,
      isDeveloper,
      permissions: Array.from(permissionKeys),
      hasPermission,
    };
  }, [user, userGroups]);
}
