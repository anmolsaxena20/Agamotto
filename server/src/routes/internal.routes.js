import { Router } from 'express';
import { validateIngestKey } from '../controllers/internal.controller.js';

const router = Router();

router.post('/validate-ingest-key', validateIngestKey);

export default router;
