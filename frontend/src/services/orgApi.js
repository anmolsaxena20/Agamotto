/**
 * Eye of Agamotto Organization & Member Management Service
 * Communicates with Agamotto Express Server /orgs and /permissions endpoints
 * Includes realistic in-memory fallback store for offline and demo testing.
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Master permissions catalog matching backend contract
export const SYSTEM_PERMISSIONS = [
  // Telemetry & Traces
  { id: 'perm-tel-read', key: 'telemetry:read', category: 'Telemetry', description: 'View system health metrics, OTLP status, and summaries' },
  { id: 'perm-trc-read', key: 'traces:read', category: 'Telemetry', description: 'Read spans, traces waterfall, and topology map' },
  { id: 'perm-log-read', key: 'logs:read', category: 'Telemetry', description: 'Read correlated log streams and error fingerprints' },
  
  // AI & Alerts
  { id: 'perm-ai-use', key: 'ai:use', category: 'AI & Insights', description: 'Use AI drawer, hypothesis engine, and natural language search' },
  { id: 'perm-alr-manage', key: 'alerts:manage', category: 'AI & Insights', description: 'Create, update, and manage alert conditions' },
  
  // Member & RBAC Management
  { id: 'perm-mem-read', key: 'members:read', category: 'Member Management', description: 'List organization members and pending invitations' },
  { id: 'perm-mem-invite', key: 'members:invite', category: 'Member Management', description: 'Invite new members to the organization by email' },
  { id: 'perm-mem-update', key: 'members:update', category: 'Member Management', description: 'Change roles and group assignments for existing members' },
  { id: 'perm-mem-remove', key: 'members:remove', category: 'Member Management', description: 'Remove members or revoke invites from the organization' },
  { id: 'perm-grp-read', key: 'groups:read', category: 'Role Management', description: 'List groups and view role permission definitions' },
  { id: 'perm-grp-manage', key: 'groups:manage', category: 'Role Management', description: 'Create, update, or delete organization custom groups' },
  { id: 'perm-grp-assign-perm', key: 'groups:assign_permissions', category: 'Role Management', description: 'Assign or remove granular permissions to/from a group' },
  { id: 'perm-grp-assign-mem', key: 'groups:assign_members', category: 'Role Management', description: 'Assign or remove members to/from a specific group' },
  
  // Infrastructure & Keys
  { id: 'perm-key-read', key: 'ingest_keys:read', category: 'API & Ingestion', description: 'List and view telemetry ingestion keys' },
  { id: 'perm-key-create', key: 'ingest_keys:create', category: 'API & Ingestion', description: 'Generate new ingestion keys for OTLP collectors' },
  { id: 'perm-key-revoke', key: 'ingest_keys:revoke', category: 'API & Ingestion', description: 'Revoke or rotate ingestion keys' },
  { id: 'perm-dep-run', key: 'deploy:run', category: 'API & Ingestion', description: 'Deploy, stop, restart, and inspect microservice containers' },
  
  // Organization & Billing
  { id: 'perm-org-read', key: 'org:read', category: 'Organization', description: 'View organization profile, slug, and settings' },
  { id: 'perm-org-update', key: 'org:update', category: 'Organization', description: 'Update organization name, settings, and slug' },
  { id: 'perm-org-delete', key: 'org:delete', category: 'Organization', description: 'Permanently delete the organization (Owner only)' },
  { id: 'perm-bil-manage', key: 'billing:manage', category: 'Organization', description: 'Manage subscription tier, invoices, and checkout' },
];

// Initial mock state for realistic standalone interaction
const MOCK_GROUPS = [
  {
    id: 'grp-super-admin',
    orgId: 'org-kamar-taj',
    name: 'Super Admin',
    code: 'SUPER_ADMIN',
    description: 'Full administrative access and organization ownership',
    isSystem: true,
    memberCount: 2,
    permissions: SYSTEM_PERMISSIONS,
  },
  {
    id: 'grp-admin',
    orgId: 'org-kamar-taj',
    name: 'Admin',
    code: 'ADMIN',
    description: 'Manage members, groups, ingest keys, and inspect telemetry',
    isSystem: true,
    memberCount: 1,
    permissions: SYSTEM_PERMISSIONS.filter((p) =>
      [
        'org:read', 'org:update',
        'members:read', 'members:invite', 'members:update', 'members:remove',
        'groups:read', 'groups:manage', 'groups:assign_permissions', 'groups:assign_members',
        'ingest_keys:read', 'ingest_keys:create', 'ingest_keys:revoke',
        'telemetry:read', 'traces:read', 'logs:read', 'ai:use'
      ].includes(p.key)
    ),
  },
  {
    id: 'grp-developer',
    orgId: 'org-kamar-taj',
    name: 'Developer',
    code: 'DEVELOPER',
    description: 'Manage ingest keys, run deployments, and inspect all telemetry',
    isSystem: true,
    memberCount: 1,
    permissions: SYSTEM_PERMISSIONS.filter((p) =>
      [
        'org:read', 'members:read', 'groups:read',
        'ingest_keys:read', 'ingest_keys:create', 'ingest_keys:revoke',
        'telemetry:read', 'traces:read', 'logs:read', 'ai:use', 'deploy:run'
      ].includes(p.key)
    ),
  },
  {
    id: 'grp-viewer',
    orgId: 'org-kamar-taj',
    name: 'Viewer',
    code: 'VIEWER',
    description: 'Read-only access to organization telemetry and service health',
    isSystem: true,
    memberCount: 1,
    permissions: SYSTEM_PERMISSIONS.filter((p) =>
      ['org:read', 'telemetry:read', 'traces:read', 'logs:read'].includes(p.key)
    ),
  },
];

let mockGroupsStore = JSON.parse(JSON.stringify(MOCK_GROUPS));

let mockMembersStore = [
  {
    id: 'mem-1',
    orgId: 'org-kamar-taj',
    userId: 'usr-agamotto-master',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
    isCreator: true,
    user: {
      id: 'usr-agamotto-master',
      name: 'Doctor Strange',
      email: 'sorcerer.supreme@agamotto.dev',
      avatarUrl: null,
    },
    groups: [
      { id: 'grp-super-admin', name: 'Super Admin', code: 'SUPER_ADMIN', isSystem: true },
    ],
  },
  {
    id: 'mem-2',
    orgId: 'org-kamar-taj',
    userId: 'usr-wong',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 20 * 24 * 3600 * 1000).toISOString(),
    isCreator: false,
    user: {
      id: 'usr-wong',
      name: 'Master Wong',
      email: 'wong@kamar-taj.org',
      avatarUrl: null,
    },
    groups: [
      { id: 'grp-admin', name: 'Admin', code: 'ADMIN', isSystem: true },
    ],
  },
  {
    id: 'mem-3',
    orgId: 'org-kamar-taj',
    userId: 'usr-ancient-one',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString(),
    isCreator: false,
    user: {
      id: 'usr-ancient-one',
      name: 'The Ancient One',
      email: 'ancient.one@sanctum.dev',
      avatarUrl: null,
    },
    groups: [
      { id: 'grp-super-admin', name: 'Super Admin', code: 'SUPER_ADMIN', isSystem: true },
    ],
  },
  {
    id: 'mem-4',
    orgId: 'org-kamar-taj',
    userId: 'usr-christine',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 10 * 24 * 3600 * 1000).toISOString(),
    isCreator: false,
    user: {
      id: 'usr-christine',
      name: 'Dr. Christine Palmer',
      email: 'palmer@metro-gen.org',
      avatarUrl: null,
    },
    groups: [
      { id: 'grp-developer', name: 'Developer', code: 'DEVELOPER', isSystem: true },
    ],
  },
  {
    id: 'mem-5',
    orgId: 'org-kamar-taj',
    userId: 'usr-mordo',
    status: 'ACTIVE',
    createdAt: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
    isCreator: false,
    user: {
      id: 'usr-mordo',
      name: 'Karl Mordo',
      email: 'mordo@london-sanctum.dev',
      avatarUrl: null,
    },
    groups: [
      { id: 'grp-viewer', name: 'Viewer', code: 'VIEWER', isSystem: true },
    ],
  },
];

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  const isMock = localStorage.getItem('agamotto_mock_mode') === 'true';

  if (isMock) {
    return handleMockRequest(endpoint, options);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const storedToken =
    localStorage.getItem('access_token') ||
    localStorage.getItem('eoa_token') ||
    localStorage.getItem('token');
  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
      const error = new Error(errorMsg);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    if (err.status) {
      throw err;
    }
    // Fall back to robust mock handler when server is offline
    console.warn(`[Eye of Agamotto] Server unreachable at ${url}. Operating with mock data.`);
    return handleMockRequest(endpoint, options);
  }
}

// In-memory mock router providing complete CRUD simulation
async function handleMockRequest(endpoint, options = {}) {
  await new Promise((r) => setTimeout(r, 180));
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  // GET /permissions
  if (endpoint === '/permissions') {
    return { permissions: SYSTEM_PERMISSIONS };
  }

  // GET /orgs/:orgId/members
  const membersMatch = endpoint.match(/^\/orgs\/([^/]+)\/members$/);
  if (membersMatch && method === 'GET') {
    return { members: JSON.parse(JSON.stringify(mockMembersStore)) };
  }

  // POST /orgs/:orgId/members (Add / Invite member)
  if (membersMatch && method === 'POST') {
    const { email, groupId } = body;
    if (!email) {
      const err = new Error('Valid user email is required');
      err.status = 400;
      throw err;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = mockMembersStore.find((m) => m.user?.email.toLowerCase() === normalizedEmail);
    if (existing) {
      const err = new Error('User is already a member of this organization');
      err.status = 409;
      throw err;
    }

    const targetGroup = mockGroupsStore.find((g) => g.id === groupId) ||
      mockGroupsStore.find((g) => g.code === 'VIEWER') || mockGroupsStore[0];

    const newId = `mem-${Date.now()}`;
    const newMember = {
      id: newId,
      orgId: membersMatch[1],
      userId: `usr-${Date.now()}`,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      isCreator: false,
      user: {
        id: `usr-${Date.now()}`,
        name: normalizedEmail.split('@')[0].replace(/[._-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        email: normalizedEmail,
        avatarUrl: null,
      },
      groups: targetGroup ? [{ id: targetGroup.id, name: targetGroup.name, code: targetGroup.code, isSystem: targetGroup.isSystem }] : [],
    };

    mockMembersStore.push(newMember);
    if (targetGroup) {
      targetGroup.memberCount = (targetGroup.memberCount || 0) + 1;
    }

    return {
      message: 'Member added successfully',
      member: newMember,
    };
  }

  // DELETE /orgs/:orgId/members/:memberId
  const deleteMemberMatch = endpoint.match(/^\/orgs\/([^/]+)\/members\/([^/]+)$/);
  if (deleteMemberMatch && method === 'DELETE') {
    const memberId = deleteMemberMatch[2];
    const member = mockMembersStore.find((m) => m.id === memberId);
    if (!member) {
      const err = new Error('Member not found in this organization');
      err.status = 404;
      throw err;
    }

    if (member.isCreator) {
      const err = new Error('Cannot remove the organization creator');
      err.status = 400;
      throw err;
    }

    mockMembersStore = mockMembersStore.filter((m) => m.id !== memberId);
    return { message: 'Member removed successfully' };
  }

  // GET /orgs/:orgId/groups
  const groupsMatch = endpoint.match(/^\/orgs\/([^/]+)\/groups$/);
  if (groupsMatch && method === 'GET') {
    return { groups: JSON.parse(JSON.stringify(mockGroupsStore)) };
  }

  // POST /orgs/:orgId/groups (Create group)
  if (groupsMatch && method === 'POST') {
    const { name, code, description, permissionIds } = body;
    if (!name?.trim()) {
      const err = new Error('Group name is required');
      err.status = 400;
      throw err;
    }

    const groupName = name.trim();
    const groupCode = (code || groupName).toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_');

    if (mockGroupsStore.some((g) => g.code === groupCode)) {
      const err = new Error(`Group with code '${groupCode}' already exists in this organization`);
      err.status = 409;
      throw err;
    }

    const assignedPerms = (permissionIds || [])
      .map((pid) => SYSTEM_PERMISSIONS.find((p) => p.id === pid || p.key === pid))
      .filter(Boolean);

    const newGroup = {
      id: `grp-${Date.now()}`,
      orgId: groupsMatch[1],
      name: groupName,
      code: groupCode,
      description: description?.trim() || null,
      isSystem: false,
      memberCount: 0,
      permissions: assignedPerms,
    };

    mockGroupsStore.push(newGroup);
    return { message: 'Group created successfully', group: newGroup };
  }

  // PATCH /orgs/:orgId/groups/:groupId
  const updateGroupMatch = endpoint.match(/^\/orgs\/([^/]+)\/groups\/([^/]+)$/);
  if (updateGroupMatch && method === 'PATCH') {
    const groupId = updateGroupMatch[2];
    const group = mockGroupsStore.find((g) => g.id === groupId);
    if (!group) {
      const err = new Error('Group not found');
      err.status = 404;
      throw err;
    }

    if (body.name?.trim()) group.name = body.name.trim();
    if (body.description !== undefined) group.description = body.description?.trim() || null;

    return { message: 'Group updated successfully', group };
  }

  // DELETE /orgs/:orgId/groups/:groupId
  if (updateGroupMatch && method === 'DELETE') {
    const groupId = updateGroupMatch[2];
    const group = mockGroupsStore.find((g) => g.id === groupId);
    if (!group) {
      const err = new Error('Group not found');
      err.status = 404;
      throw err;
    }
    if (group.isSystem) {
      const err = new Error('System groups cannot be deleted');
      err.status = 400;
      throw err;
    }

    mockGroupsStore = mockGroupsStore.filter((g) => g.id !== groupId);
    return { message: 'Group deleted successfully' };
  }

  // POST /orgs/:orgId/groups/:groupId/permissions
  const assignPermMatch = endpoint.match(/^\/orgs\/([^/]+)\/groups\/([^/]+)\/permissions$/);
  if (assignPermMatch && method === 'POST') {
    const groupId = assignPermMatch[2];
    const group = mockGroupsStore.find((g) => g.id === groupId);
    if (!group) throw new Error('Group not found');

    const perm = SYSTEM_PERMISSIONS.find((p) => p.id === body.permissionId || p.key === body.permissionKey);
    if (perm && !group.permissions.some((p) => p.id === perm.id)) {
      group.permissions.push(perm);
    }
    return { message: 'Permission assigned to group successfully' };
  }

  // DELETE /orgs/:orgId/groups/:groupId/permissions/:permId
  const deletePermMatch = endpoint.match(/^\/orgs\/([^/]+)\/groups\/([^/]+)\/permissions\/([^/]+)$/);
  if (deletePermMatch && method === 'DELETE') {
    const [, , groupId, permId] = deletePermMatch;
    const group = mockGroupsStore.find((g) => g.id === groupId);
    if (!group) throw new Error('Group not found');
    if (group.code === 'SUPER_ADMIN') {
      const err = new Error('Permissions of SUPER_ADMIN group cannot be altered');
      err.status = 400;
      throw err;
    }
    group.permissions = group.permissions.filter((p) => p.id !== permId && p.key !== permId);
    return { message: 'Permission removed from group successfully' };
  }

  // POST /orgs/:orgId/groups/:groupId/members (Assign member to group)
  const assignMemberGroupMatch = endpoint.match(/^\/orgs\/([^/]+)\/groups\/([^/]+)\/members$/);
  if (assignMemberGroupMatch && method === 'POST') {
    const groupId = assignMemberGroupMatch[2];
    const group = mockGroupsStore.find((g) => g.id === groupId);
    const member = mockMembersStore.find((m) => m.id === body.memberId);
    if (!group || !member) throw new Error('Group or Member not found');

    if (!member.groups.some((g) => g.id === group.id)) {
      member.groups.push({ id: group.id, name: group.name, code: group.code, isSystem: group.isSystem });
      group.memberCount = (group.memberCount || 0) + 1;
    }
    return { message: 'Member assigned to group successfully' };
  }

  // DELETE /orgs/:orgId/groups/:groupId/members/:memberId (Remove member from group)
  const removeMemberGroupMatch = endpoint.match(/^\/orgs\/([^/]+)\/groups\/([^/]+)\/members\/([^/]+)$/);
  if (removeMemberGroupMatch && method === 'DELETE') {
    const [, , groupId, memberId] = removeMemberGroupMatch;
    const group = mockGroupsStore.find((g) => g.id === groupId);
    const member = mockMembersStore.find((m) => m.id === memberId);
    if (!group || !member) throw new Error('Group or Member not found');

    if (group.code === 'SUPER_ADMIN') {
      const superAdmins = mockMembersStore.filter((m) => m.groups.some((g) => g.code === 'SUPER_ADMIN'));
      if (superAdmins.length <= 1) {
        const err = new Error('Cannot remove the last Super Admin member from the organization');
        err.status = 400;
        throw err;
      }
    }

    member.groups = member.groups.filter((g) => g.id !== groupId);
    group.memberCount = Math.max(0, (group.memberCount || 1) - 1);
    return { message: 'Member removed from group successfully' };
  }

  return { success: true };
}

export const orgApi = {
  /**
   * List all members of an organization
   */
  async listMembers(orgId) {
    return request(`/orgs/${orgId}/members`, { method: 'GET' });
  },

  /**
   * Invite or add a member to the organization
   * @param {string} orgId
   * @param {{ email: string, groupId?: string }} payload
   */
  async addMember(orgId, payload) {
    return request(`/orgs/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Remove a member from the organization
   * @param {string} orgId
   * @param {string} memberId
   */
  async removeMember(orgId, memberId) {
    return request(`/orgs/${orgId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  /**
   * List all RBAC groups in the organization
   * @param {string} orgId
   */
  async listGroups(orgId) {
    return request(`/orgs/${orgId}/groups`, { method: 'GET' });
  },

  /**
   * Create a new custom RBAC group
   * @param {string} orgId
   * @param {{ name: string, code?: string, description?: string, permissionIds?: string[] }} payload
   */
  async createGroup(orgId, payload) {
    return request(`/orgs/${orgId}/groups`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Update group properties (name, description)
   */
  async updateGroup(orgId, groupId, payload) {
    return request(`/orgs/${orgId}/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Delete a custom group
   */
  async deleteGroup(orgId, groupId) {
    return request(`/orgs/${orgId}/groups/${groupId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Assign a permission to a group
   */
  async assignPermissionToGroup(orgId, groupId, permissionId, permissionKey) {
    return request(`/orgs/${orgId}/groups/${groupId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionId, permissionKey }),
    });
  },

  /**
   * Remove a permission from a group
   */
  async removePermissionFromGroup(orgId, groupId, permissionId) {
    return request(`/orgs/${orgId}/groups/${groupId}/permissions/${permissionId}`, {
      method: 'DELETE',
    });
  },

  /**
   * Assign member to group
   */
  async assignMemberToGroup(orgId, groupId, memberId) {
    return request(`/orgs/${orgId}/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    });
  },

  /**
   * Remove member from group
   */
  async removeMemberFromGroup(orgId, groupId, memberId) {
    return request(`/orgs/${orgId}/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },

  /**
   * List all master permissions
   */
  async listPermissions() {
    return request('/permissions', { method: 'GET' });
  },
};
