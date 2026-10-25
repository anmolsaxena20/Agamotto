import { db } from '../prisma/db.ts';

export const MASTER_PERMISSIONS = [
  { key: 'org:read', category: 'ORGANIZATION', description: 'View organization details and summary' },
  { key: 'org:update', category: 'ORGANIZATION', description: 'Modify organization name, slug, and settings' },
  { key: 'org:delete', category: 'ORGANIZATION', description: 'Permanently delete the organization' },
  { key: 'members:read', category: 'MEMBERS', description: 'View organization members and invitations' },
  { key: 'members:invite', category: 'MEMBERS', description: 'Add or invite new members to the organization' },
  { key: 'members:update', category: 'MEMBERS', description: 'Update member status and assign them to groups' },
  { key: 'members:remove', category: 'MEMBERS', description: 'Remove members from the organization' },
  { key: 'groups:read', category: 'GROUPS', description: 'View organization groups and assigned permissions' },
  { key: 'groups:manage', category: 'GROUPS', description: 'Create, update, and delete groups' },
  { key: 'groups:assign_permissions', category: 'GROUPS', description: 'Attach or detach permissions to/from groups' },
  { key: 'groups:assign_members', category: 'GROUPS', description: 'Add or remove members to/from groups' },
  { key: 'ingest_keys:read', category: 'INGEST_KEYS', description: 'List telemetry ingest keys and prefixes' },
  { key: 'ingest_keys:create', category: 'INGEST_KEYS', description: 'Generate new telemetry ingest keys' },
  { key: 'ingest_keys:revoke', category: 'INGEST_KEYS', description: 'Deactivate or delete telemetry ingest keys' },
  { key: 'telemetry:read', category: 'TELEMETRY', description: 'Query traces, logs, metrics, and anomaly data' },
];

export async function ensureMasterPermissions() {
  const existing = await db.orm.public.Permission.all();
  const existingKeys = new Set(existing.map((p) => p.key));
  for (const perm of MASTER_PERMISSIONS) {
    if (!existingKeys.has(perm.key)) {
      await db.orm.public.Permission.create(perm);
    }
  }
  return await db.orm.public.Permission.all();
}

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
    let allMasterPermissions = await db.orm.public.Permission.all();
    if (!allMasterPermissions || allMasterPermissions.length === 0) {
      allMasterPermissions = await ensureMasterPermissions();
    }
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
  let allPermissions = await db.orm.public.Permission.all();
  if (!allPermissions || allPermissions.length === 0) {
    allPermissions = await ensureMasterPermissions();
  }
  const permMap = new Map(allPermissions.map((p) => [p.key, p.id]));

  let superAdminGroup = await db.orm.public.OrganizationGroup.where({ orgId, code: 'SUPER_ADMIN' }).first();
  if (!superAdminGroup) {
    superAdminGroup = await db.orm.public.OrganizationGroup.create({
      orgId,
      name: 'Super Admin',
      code: 'SUPER_ADMIN',
      description: 'Full administrative access and organization ownership',
      isSystem: true,
    });
  }

  let adminGroup = await db.orm.public.OrganizationGroup.where({ orgId, code: 'ADMIN' }).first();
  if (!adminGroup) {
    adminGroup = await db.orm.public.OrganizationGroup.create({
      orgId,
      name: 'Admin',
      code: 'ADMIN',
      description: 'Manage members, groups, ingest keys and telemetry',
      isSystem: true,
    });
  }

  let devGroup = await db.orm.public.OrganizationGroup.where({ orgId, code: 'DEVELOPER' }).first();
  if (!devGroup) {
    devGroup = await db.orm.public.OrganizationGroup.create({
      orgId,
      name: 'Developer',
      code: 'DEVELOPER',
      description: 'Manage ingest keys and inspect telemetry',
      isSystem: true,
    });
  }

  let viewerGroup = await db.orm.public.OrganizationGroup.where({ orgId, code: 'VIEWER' }).first();
  if (!viewerGroup) {
    viewerGroup = await db.orm.public.OrganizationGroup.create({
      orgId,
      name: 'Viewer',
      code: 'VIEWER',
      description: 'Read-only access to organization details and telemetry',
      isSystem: true,
    });
  }

  for (const perm of allPermissions) {
    const exists = await db.orm.public.GroupPermissionAssignment.where({
      groupId: superAdminGroup.id,
      permissionId: perm.id,
    }).first();
    if (!exists) {
      await db.orm.public.GroupPermissionAssignment.create({
        groupId: superAdminGroup.id,
        permissionId: perm.id,
      });
    }
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
      const exists = await db.orm.public.GroupPermissionAssignment.where({
        groupId: adminGroup.id,
        permissionId: permId,
      }).first();
      if (!exists) {
        await db.orm.public.GroupPermissionAssignment.create({
          groupId: adminGroup.id,
          permissionId: permId,
        });
      }
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
      const exists = await db.orm.public.GroupPermissionAssignment.where({
        groupId: devGroup.id,
        permissionId: permId,
      }).first();
      if (!exists) {
        await db.orm.public.GroupPermissionAssignment.create({
          groupId: devGroup.id,
          permissionId: permId,
        });
      }
    }
  }

  const viewerKeys = ['org:read', 'telemetry:read'];
  for (const key of viewerKeys) {
    const permId = permMap.get(key);
    if (permId) {
      const exists = await db.orm.public.GroupPermissionAssignment.where({
        groupId: viewerGroup.id,
        permissionId: permId,
      }).first();
      if (!exists) {
        await db.orm.public.GroupPermissionAssignment.create({
          groupId: viewerGroup.id,
          permissionId: permId,
        });
      }
    }
  }

  if (creatorMemberId) {
    const exists = await db.orm.public.MemberGroupAssignment.where({
      memberId: creatorMemberId,
      groupId: superAdminGroup.id,
    }).first();
    if (!exists) {
      await db.orm.public.MemberGroupAssignment.create({
        memberId: creatorMemberId,
        groupId: superAdminGroup.id,
      });
    }
  }

  return { superAdminGroup, adminGroup, devGroup, viewerGroup };
}

