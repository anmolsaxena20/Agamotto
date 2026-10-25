import { db } from '../prisma/db.ts';
import { hasPermission, getMemberGroups, provisionDefaultGroups } from '../services/rbac.service.js';

export async function requireOrgMember(req, res, next) {
  try {
    const orgId = req.params.orgId || req.query.orgId || req.headers['x-org-id'] || req.headers['x-organization-id'];

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const org = await db.orm.public.Organization.where({ id: orgId }).first();
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    let member = await db.orm.public.OrganizationMember.where({
      orgId,
      userId: req.user.id,
      status: 'ACTIVE',
    }).first();

    const isCreator = org.createdById === req.user.id;

    if (!member && isCreator) {
      // Auto-create active membership for organization creator
      member = await db.orm.public.OrganizationMember.create({
        orgId,
        userId: req.user.id,
        status: 'ACTIVE',
      });
      await provisionDefaultGroups(orgId, member.id);
    } else if (member && isCreator) {
      // Verify creator has default groups provisioned
      const groups = await getMemberGroups(member.id);
      if (groups.length === 0 || !groups.some((g) => g.code === 'SUPER_ADMIN')) {
        await provisionDefaultGroups(orgId, member.id);
      }
    }

    if (!member) {
      return res.status(403).json({ error: 'You are not an active member of this organization' });
    }

    req.orgId = orgId;
    req.org = org;
    req.member = member;
    next();
  } catch (error) {
    next(error);
  }
}

export function requirePermission(permissionKey) {
  return async (req, res, next) => {
    try {
      if (!req.member) {
        await new Promise((resolve, reject) => {
          requireOrgMember(req, res, (err) => {
            if (err) return reject(err);
            resolve();
          });
        });
        if (res.headersSent) {
          return;
        }
      }

      // Organization creator has full privileges by default
      if (req.org && req.org.createdById === req.user?.id) {
        return next();
      }

      const allowed = await hasPermission(req.member.id, permissionKey);

      if (!allowed) {
        return res.status(403).json({
          error: `Forbidden: missing required permission '${permissionKey}'`,
        });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

