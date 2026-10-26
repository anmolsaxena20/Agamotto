import crypto from 'node:crypto';
import { db } from '../prisma/db.ts';
import { provisionDefaultGroups, getMemberGroups } from '../services/rbac.service.js';
import { sendTeamInvitationEmail } from '../services/email.client.js';

export async function createOrg(req, res, next) {
  try {
    const { name, slug } = req.body ?? {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    const orgName = name.trim();
    let orgSlug = slug && typeof slug === 'string' && slug.trim().length > 0
      ? slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : `${orgName.toLowerCase().replace(/[^a-z0-9-]/g, '-')}-${crypto.randomBytes(3).toString('hex')}`;

    const existingSlug = await db.orm.public.Organization.where({ slug: orgSlug }).first();
    if (existingSlug) {
      return res.status(409).json({ error: 'Organization slug is already in use' });
    }

    const org = await db.orm.public.Organization.create({
      name: orgName,
      slug: orgSlug,
      createdById: req.user.id,
      status: 'ACTIVE',
    });

    const member = await db.orm.public.OrganizationMember.create({
      orgId: org.id,
      userId: req.user.id,
      status: 'ACTIVE',
    });

    await provisionDefaultGroups(org.id, member.id);

    return res.status(201).json({
      message: 'Organization created successfully',
      organization: org,
      member,
    });
  } catch (error) {
    next(error);
  }
}

export async function listUserOrgs(req, res, next) {
  try {
    const memberships = await db.orm.public.OrganizationMember.where({
      userId: req.user.id,
      status: 'ACTIVE',
    }).all();

    const organizations = [];

    for (const membership of memberships) {
      const org = await db.orm.public.Organization.where({ id: membership.orgId }).first();
      if (org) {
        const groups = await getMemberGroups(membership.id);
        organizations.push({
          ...org,
          membershipId: membership.id,
          groups: groups.map((g) => ({ id: g.id, name: g.name, code: g.code })),
        });
      }
    }

    return res.status(200).json({ organizations });
  } catch (error) {
    next(error);
  }
}

export async function getOrg(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const org = await db.orm.public.Organization.where({ id: orgId }).first();

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    return res.status(200).json({ organization: org });
  } catch (error) {
    next(error);
  }
}

export async function updateOrg(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const { name, slug } = req.body ?? {};

    const org = await db.orm.public.Organization.where({ id: orgId }).first();
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const updates = {};

    if (name && typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
    }

    if (slug && typeof slug === 'string' && slug.trim().length > 0) {
      const newSlug = slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
      if (newSlug !== org.slug) {
        const existing = await db.orm.public.Organization.where({ slug: newSlug }).first();
        if (existing) {
          return res.status(409).json({ error: 'Organization slug is already in use' });
        }
        updates.slug = newSlug;
      }
    }

    const updated = await db.orm.public.Organization.where({ id: orgId }).update(updates);

    return res.status(200).json({
      message: 'Organization updated successfully',
      organization: updated,
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteOrg(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const org = await db.orm.public.Organization.where({ id: orgId }).first();

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    await db.orm.public.Organization.where({ id: orgId }).delete();

    return res.status(200).json({ message: 'Organization deleted successfully' });
  } catch (error) {
    next(error);
  }
}

export async function listMembers(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const rawMembers = await db.orm.public.OrganizationMember.where({ orgId }).all();

    const members = [];

    for (const m of rawMembers) {
      const user = await db.orm.public.User.where({ id: m.userId }).first();
      const groups = await getMemberGroups(m.id);

      members.push({
        id: m.id,
        orgId: m.orgId,
        userId: m.userId,
        status: m.status,
        createdAt: m.createdAt,
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
            }
          : null,
        groups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          code: g.code,
          isSystem: g.isSystem,
        })),
      });
    }

    return res.status(200).json({ members });
  } catch (error) {
    next(error);
  }
}

export async function addMember(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const { email, groupId, role } = req.body ?? {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid user email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await db.orm.public.User.where({ email: normalizedEmail }).first();

    if (!user) {
      return res.status(404).json({
        error: 'No registered user found with this email address. The user must register first.',
      });
    }

    const existingMembership = await db.orm.public.OrganizationMember.where({
      orgId,
      userId: user.id,
    }).first();

    if (existingMembership) {
      return res.status(409).json({ error: 'User is already a member of this organization' });
    }

    const member = await db.orm.public.OrganizationMember.create({
      orgId,
      userId: user.id,
      status: 'ACTIVE',
    });

    let targetGroup = null;
    if (groupId) {
      targetGroup = (await db.orm.public.OrganizationGroup.where({ id: groupId, orgId }).first())
        || (await db.orm.public.OrganizationGroup.where({ code: String(groupId).toUpperCase(), orgId }).first());
    }
    if (!targetGroup && role) {
      const roleUpper = String(role).toUpperCase();
      targetGroup = (await db.orm.public.OrganizationGroup.where({ code: roleUpper, orgId }).first())
        || (await db.orm.public.OrganizationGroup.where({ name: role, orgId }).first());
    }
    if (!targetGroup) {
      targetGroup = (await db.orm.public.OrganizationGroup.where({ orgId, code: 'VIEWER' }).first())
        || (await db.orm.public.OrganizationGroup.where({ orgId, code: 'DEVELOPER' }).first());
    }

    if (targetGroup) {
      await db.orm.public.MemberGroupAssignment.create({
        memberId: member.id,
        groupId: targetGroup.id,
      });
    }

    const org = await db.orm.public.Organization.where({ id: orgId }).first();
    const inviterName = req.user?.name || req.user?.email || 'A team member';
    const workspaceName = org?.name || 'Agamotto';
    const roleName = targetGroup?.name || targetGroup?.code || 'Member';
    const clientUrl = process.env.CLIENT_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const inviteUrl = `${clientUrl}/dashboard`;

    sendTeamInvitationEmail({
      email: normalizedEmail,
      inviterName,
      workspaceName,
      roleName,
      inviteUrl,
    }).catch(err => {
      // Non-blocking log if email service is unavailable
      console.error('[sendTeamInvitationEmail] Failed:', err.message);
    });

    return res.status(201).json({
      message: 'Member added successfully',
      member: {
        id: member.id,
        orgId: member.orgId,
        userId: user.id,
        status: member.status,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function removeMember(req, res, next) {
  try {
    const orgId = req.params.orgId;
    const memberId = req.params.memberId;

    const member = await db.orm.public.OrganizationMember.where({ id: memberId }).first();

    if (!member || member.orgId !== orgId) {
      return res.status(404).json({ error: 'Member not found in this organization' });
    }

    const org = await db.orm.public.Organization.where({ id: orgId }).first();
    if (org && org.createdById === member.userId) {
      return res.status(400).json({ error: 'Cannot remove the organization creator' });
    }

    await db.orm.public.OrganizationMember.where({ id: memberId }).delete();

    return res.status(200).json({ message: 'Member removed successfully' });
  } catch (error) {
    next(error);
  }
}
