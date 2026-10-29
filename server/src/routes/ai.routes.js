import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  askAssistantStream,
  askAssistantSync,
  parseFilter,
  executeFilter,
  getAnomalies,
  validateEvidence,
  checkEvidenceItem,
  listMcpTools,
  executeMcpTool,
  toggleMcpTool,
  checkAiHealth,
} from '../controllers/ai.controller.js';

const router = Router({ mergeParams: true });

// Require user authentication for all AI routes
router.use(authenticate);

// Require active org membership and read permission
router.use(requirePermission('org:read'));

// 1. AI Investigation Assistant (SSE Streaming & Sync)
router.post('/ask', askAssistantStream);
router.post('/ask/sync', askAssistantSync);

// 2. Natural-Language Search & Execution
router.post('/parse-filter', parseFilter);
router.post('/search/execute', executeFilter);

// 3. Automated Root-Cause Anomalies
router.get('/anomalies', getAnomalies);

// 4. Clickable Evidence Verification & Deep Links
router.post('/evidence/validate', validateEvidence);
router.get('/evidence/check/:kind/:itemId', checkEvidenceItem);

// 5. MCP Telemetry Tools Catalog & Management
router.get('/mcp/tools', listMcpTools);
router.post('/mcp/tools/:toolName', executeMcpTool);
router.post('/mcp/tools/toggle', requirePermission('org:update'), toggleMcpTool);

// 6. AI Microservice Health
router.get('/health', checkAiHealth);

export default router;
