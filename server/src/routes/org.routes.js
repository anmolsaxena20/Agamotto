import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  createOrg,
  listUserOrgs,
  getOrg,
  updateOrg,
  deleteOrg,
  listMembers,
  addMember,
  removeMember,
} from '../controllers/org.controller.js';
import {
  listGroups,
  createGroup,
  getGroup,
  updateGroup,
  deleteGroup,
  assignPermissionToGroup,
  removePermissionFromGroup,
  assignMemberToGroup,
  removeMemberFromGroup,
} from '../controllers/rbac.controller.js';
import {
  createKey,
  listKeys,
  toggleKey,
  revokeKey,
} from '../controllers/ingestKey.controller.js';

const router = Router();

router.use(authenticate);

router.post('/', createOrg);
router.get('/', listUserOrgs);
router.get('/:orgId', requirePermission('org:read'), getOrg);
router.patch('/:orgId', requirePermission('org:update'), updateOrg);
router.delete('/:orgId', requirePermission('org:delete'), deleteOrg);

router.get('/:orgId/members', requirePermission('members:read'), listMembers);
router.post('/:orgId/members', requirePermission('members:invite'), addMember);
router.delete('/:orgId/members/:memberId', requirePermission('members:remove'), removeMember);

router.get('/:orgId/groups', requirePermission('groups:read'), listGroups);
router.post('/:orgId/groups', requirePermission('groups:manage'), createGroup);
router.get('/:orgId/groups/:groupId', requirePermission('groups:read'), getGroup);
router.patch('/:orgId/groups/:groupId', requirePermission('groups:manage'), updateGroup);
router.delete('/:orgId/groups/:groupId', requirePermission('groups:manage'), deleteGroup);

router.post('/:orgId/groups/:groupId/permissions', requirePermission('groups:assign_permissions'), assignPermissionToGroup);
router.delete('/:orgId/groups/:groupId/permissions/:permissionId', requirePermission('groups:assign_permissions'), removePermissionFromGroup);

router.post('/:orgId/groups/:groupId/members', requirePermission('groups:assign_members'), assignMemberToGroup);
router.delete('/:orgId/groups/:groupId/members/:memberId', requirePermission('groups:assign_members'), removeMemberFromGroup);

router.get('/:orgId/keys', requirePermission('ingest_keys:read'), listKeys);
router.post('/:orgId/keys', requirePermission('ingest_keys:create'), createKey);
router.patch('/:orgId/keys/:keyId', requirePermission('ingest_keys:revoke'), toggleKey);
router.delete('/:orgId/keys/:keyId', requirePermission('ingest_keys:revoke'), revokeKey);

export default router;
