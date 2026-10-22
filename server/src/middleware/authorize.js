import { db } from '../prisma/db.ts';
import { hasPermission } from '../services/rbac.service.js';

export async function requireOrgMember(req, res, next) {
  try {
    const orgId = req.params.orgId || req.headers['x-org-id'];

    if (!orgId) {
      return res.status(400).json({ error: 'Organization ID is required' });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const member = await db.orm.public.OrganizationMember.where({
      orgId,
      userId: req.user.id,
      status: 'ACTIVE',
    }).first();

    if (!member) {
      return res.status(403).json({ error: 'You are not an active member of this organization' });
    }

    req.orgId = orgId;
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
