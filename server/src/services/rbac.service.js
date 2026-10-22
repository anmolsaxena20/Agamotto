import { db } from '../prisma/db.ts';

export async function getMemberGroups(memberId) {
  const assignments = await db.orm.public.MemberGroupAssignment.where({ memberId }).all();
  if (!assignments || assignments.length === 0) {
    return [];
  }

  const groupIds = assignments.map((a) => a.groupId);
  const groups = [];

  for (const groupId of groupIds) {
    const group = await db.orm.public.OrganizationGroup.where({ id: groupId }).first();
    if (group) {
      groups.push(group);
    }
  }

  return groups;
}

export async function getMemberPermissions(memberId) {
  const groups = await getMemberGroups(memberId);
  if (groups.length === 0) {
    return [];
  }

  const isSuperAdmin = groups.some((g) => g.code === 'SUPER_ADMIN');
  if (isSuperAdmin) {
    const allMasterPermissions = await db.orm.public.Permission.all();
    return allMasterPermissions.map((p) => p.key);
  }

  const permissionKeys = new Set();

  for (const group of groups) {
    const permAssignments = await db.orm.public.GroupPermissionAssignment.where({ groupId: group.id }).all();
    for (const assignment of permAssignments) {
      const perm = await db.orm.public.Permission.where({ id: assignment.permissionId }).first();
      if (perm) {
        permissionKeys.add(perm.key);
      }
    }
  }

  return Array.from(permissionKeys);
}

export async function hasPermission(memberId, requiredPermission) {
  const permissions = await getMemberPermissions(memberId);
  return permissions.includes(requiredPermission);
}
