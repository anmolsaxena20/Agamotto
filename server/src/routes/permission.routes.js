import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { listPermissions } from '../controllers/rbac.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', listPermissions);

export default router;
