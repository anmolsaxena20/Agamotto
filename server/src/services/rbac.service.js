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

export async function provisionDefaultGroups(orgId, creatorMemberId) {
  const allPermissions = await db.orm.public.Permission.all();
  const permMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  const superAdminGroup = await db.orm.public.OrganizationGroup.create({
    orgId,
    name: 'Super Admin',
    code: 'SUPER_ADMIN',
    description: 'Full administrative access and organization ownership',
    isSystem: true,
  });

  const adminGroup = await db.orm.public.OrganizationGroup.create({
    orgId,
    name: 'Admin',
    code: 'ADMIN',
    description: 'Manage members, groups, ingest keys and telemetry',
    isSystem: true,
  });

  const devGroup = await db.orm.public.OrganizationGroup.create({
    orgId,
    name: 'Developer',
    code: 'DEVELOPER',
    description: 'Manage ingest keys and inspect telemetry',
    isSystem: true,
  });

  const viewerGroup = await db.orm.public.OrganizationGroup.create({
    orgId,
    name: 'Viewer',
    code: 'VIEWER',
    description: 'Read-only access to organization details and telemetry',
    isSystem: true,
  });

  for (const perm of allPermissions) {
    await db.orm.public.GroupPermissionAssignment.create({
      groupId: superAdminGroup.id,
      permissionId: perm.id,
    });
  }

  const adminKeys = [
    'org:read',
    'org:update',
    'members:read',
    'members:invite',
    'members:update',
    'members:remove',
    'groups:read',
    'groups:manage',
    'groups:assign_permissions',
    'groups:assign_members',
    'ingest_keys:read',
    'ingest_keys:create',
    'ingest_keys:revoke',
    'telemetry:read',
  ];
  for (const key of adminKeys) {
    const permId = permMap.get(key);
    if (permId) {
      await db.orm.public.GroupPermissionAssignment.create({
        groupId: adminGroup.id,
        permissionId: permId,
      });
    }
  }

  const devKeys = [
    'org:read',
    'members:read',
    'groups:read',
    'ingest_keys:read',
    'ingest_keys:create',
    'ingest_keys:revoke',
    'telemetry:read',
  ];
  for (const key of devKeys) {
    const permId = permMap.get(key);
    if (permId) {
      await db.orm.public.GroupPermissionAssignment.create({
        groupId: devGroup.id,
        permissionId: permId,
      });
    }
  }

  const viewerKeys = ['org:read', 'telemetry:read'];
  for (const key of viewerKeys) {
    const permId = permMap.get(key);
    if (permId) {
      await db.orm.public.GroupPermissionAssignment.create({
        groupId: viewerGroup.id,
        permissionId: permId,
      });
    }
  }

  if (creatorMemberId) {
    await db.orm.public.MemberGroupAssignment.create({
      memberId: creatorMemberId,
      groupId: superAdminGroup.id,
    });
  }

  return { superAdminGroup, adminGroup, devGroup, viewerGroup };
}
