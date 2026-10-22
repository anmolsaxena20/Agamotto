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

export async function seedPermissions() {
  for (const perm of MASTER_PERMISSIONS) {
    const existing = await db.orm.public.Permission.where({ key: perm.key }).first();
    if (!existing) {
      await db.orm.public.Permission.create(perm);
    }
  }
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
