import { db } from '../prisma/db.ts';

export async function listPermissions(_req, res, next) {
  try {
    const permissions = await db.orm.public.Permission.all();
    return res.status(200).json({ permissions });
  } catch (error) {
    next(error);
  }
}

export async function listGroups(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const groups = await db.orm.public.OrganizationGroup.where({ orgId }).all();

    const result = [];

    for (const group of groups) {
      const permAssignments = await db.orm.public.GroupPermissionAssignment.where({ groupId: group.id }).all();
      const memberAssignments = await db.orm.public.MemberGroupAssignment.where({ groupId: group.id }).all();

      const permissions = [];
      for (const pa of permAssignments) {
        const perm = await db.orm.public.Permission.where({ id: pa.permissionId }).first();
        if (perm) {
          permissions.push(perm);
        }
      }

      result.push({
        ...group,
        memberCount: memberAssignments.length,
        permissions,
      });
    }

    return res.status(200).json({ groups: result });
  } catch (error) {
    next(error);
  }
}

export async function createGroup(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const { name, code, description, permissionIds } = req.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Group name is required' });
    }

    const groupName = name.trim();
    const groupCode = (code || groupName)
      .toUpperCase()
      .trim()
      .replace(/[^A-Z0-9_]/g, '_');

    const existing = await db.orm.public.OrganizationGroup.where({
      orgId,
      code: groupCode,
    }).first();

    if (existing) {
      return res.status(409).json({ error: `Group with code '${groupCode}' already exists in this organization` });
    }

    const group = await db.orm.public.OrganizationGroup.create({
      orgId,
      name: groupName,
      code: groupCode,
      description: description?.trim() || null,
      isSystem: false,
    });

    if (Array.isArray(permissionIds) && permissionIds.length > 0) {
      for (const permId of permissionIds) {
        let perm = await db.orm.public.Permission.where({ id: permId }).first();
        if (!perm) {
          perm = await db.orm.public.Permission.where({ key: permId }).first();
        }
        if (perm) {
          await db.orm.public.GroupPermissionAssignment.create({
            groupId: group.id,
            permissionId: perm.id,
          });
        }
      }
    }

    return res.status(201).json({
      message: 'Group created successfully',
      group,
    });
  } catch (error) {
    next(error);
  }
}

export async function getGroup(req, res, next) {
  try {
    const { orgId, groupId } = req.params;
    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const permAssignments = await db.orm.public.GroupPermissionAssignment.where({ groupId: group.id }).all();
    const memberAssignments = await db.orm.public.MemberGroupAssignment.where({ groupId: group.id }).all();

    const permissions = [];
    for (const pa of permAssignments) {
      const perm = await db.orm.public.Permission.where({ id: pa.permissionId }).first();
      if (perm) {
        permissions.push(perm);
      }
    }

    const members = [];
    for (const ma of memberAssignments) {
      const member = await db.orm.public.OrganizationMember.where({ id: ma.memberId }).first();
      if (member) {
        const user = await db.orm.public.User.where({ id: member.userId }).first();
        members.push({
          memberId: member.id,
          userId: member.userId,
          status: member.status,
          user: user
            ? {
                name: user.name,
                email: user.email,
                avatarUrl: user.avatarUrl,
              }
            : null,
        });
      }
    }

    return res.status(200).json({
      group: {
        ...group,
        permissions,
        members,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateGroup(req, res, next) {
  try {
    const { orgId, groupId } = req.params;
    const { name, description } = req.body ?? {};

    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    const updates = {};
    if (name && typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
    }
    if (description !== undefined) {
      updates.description = typeof description === 'string' ? description.trim() : null;
    }

    const updated = await db.orm.public.OrganizationGroup.where({ id: groupId }).update(updates);

    return res.status(200).json({
      message: 'Group updated successfully',
      group: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteGroup(req, res, next) {
  try {
    const { orgId, groupId } = req.params;
    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();

    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.isSystem) {
      return res.status(400).json({ error: 'System groups cannot be deleted' });
    }

    await db.orm.public.OrganizationGroup.where({ id: groupId }).delete();

    return res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function assignPermissionToGroup(req, res, next) {
  try {
    const { orgId, groupId } = req.params;
    const { permissionId, permissionKey } = req.body ?? {};

    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    let perm = null;
    if (permissionId) {
      perm = await db.orm.public.Permission.where({ id: permissionId }).first();
    } else if (permissionKey) {
      perm = await db.orm.public.Permission.where({ key: permissionKey }).first();
    }

    if (!perm) {
      return res.status(404).json({ error: 'Permission not found' });
    }

    const existing = await db.orm.public.GroupPermissionAssignment.where({
      groupId: group.id,
      permissionId: perm.id,
    }).first();

    if (existing) {
      return res.status(200).json({ message: 'Permission already assigned to group', assignment: existing });
    }

    const assignment = await db.orm.public.GroupPermissionAssignment.create({
      groupId: group.id,
      permissionId: perm.id,
    });

    return res.status(201).json({
      message: 'Permission assigned to group successfully',
      assignment,
    });
  } catch (error) {
    next(error);
  }
}

export async function removePermissionFromGroup(req, res, next) {
  try {
    const { orgId, groupId, permissionId } = req.params;

    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found' });
    }

    if (group.isSystem && group.code === 'SUPER_ADMIN') {
      return res.status(400).json({ error: 'Permissions of SUPER_ADMIN group cannot be altered' });
    }

    const assignment = await db.orm.public.GroupPermissionAssignment.where({
      groupId,
      permissionId,
    }).first();

    if (!assignment) {
      return res.status(404).json({ error: 'Permission is not assigned to this group' });
    }

    await db.orm.public.GroupPermissionAssignment.where({ id: assignment.id }).delete();

    return res.status(200).json({ message: 'Permission removed from group successfully' });
  } catch (error) {
    next(error);
  }
}

export async function assignMemberToGroup(req, res, next) {
  try {
    const { orgId, groupId } = req.params;
    const { memberId } = req.body ?? {};

    if (!memberId) {
      return res.status(400).json({ error: 'memberId is required' });
    }

    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found in this organization' });
    }

    const member = await db.orm.public.OrganizationMember.where({ id: memberId, orgId }).first();
    if (!member) {
      return res.status(404).json({ error: 'Member not found in this organization' });
    }

    const existing = await db.orm.public.MemberGroupAssignment.where({
      memberId: member.id,
      groupId: group.id,
    }).first();

    if (existing) {
      return res.status(200).json({ message: 'Member is already assigned to this group', assignment: existing });
    }

    const assignment = await db.orm.public.MemberGroupAssignment.create({
      memberId: member.id,
      groupId: group.id,
    });

    return res.status(201).json({
      message: 'Member assigned to group successfully',
      assignment,
    });
  } catch (error) {
    next(error);
  }
}

export async function removeMemberFromGroup(req, res, next) {
  try {
    const { orgId, groupId, memberId } = req.params;

    const group = await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first();
    if (!group) {
      return res.status(404).json({ error: 'Group not found in this organization' });
    }

    const member = await db.orm.public.OrganizationMember.where({ id: memberId, orgId }).first();
    if (!member) {
      return res.status(404).json({ error: 'Member not found in this organization' });
    }

    if (group.code === 'SUPER_ADMIN') {
      const superAdminAssignments = await db.orm.public.MemberGroupAssignment.where({
        groupId: group.id,
      }).all();

      if (superAdminAssignments.length <= 1) {
        return res.status(400).json({
          error: 'Cannot remove the last Super Admin member from the organization',
        });
      }
    }

    const assignment = await db.orm.public.MemberGroupAssignment.where({
      memberId,
      groupId,
    }).first();

    if (!assignment) {
      return res.status(404).json({ error: 'Member is not assigned to this group' });
    }

    await db.orm.public.MemberGroupAssignment.where({ id: assignment.id }).delete();

    return res.status(200).json({ message: 'Member removed from group successfully' });
  } catch (error) {
    next(error);
  }
}
