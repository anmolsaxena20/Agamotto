import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requirePermission } from '../middleware/authorize.js';
import {
  getOverview,
  getLatency,
  getLatencyTimeseries,
  getThroughput,
  getEndpoints,
  getServiceOverview,
  getDependencyGraph,
  getErrors,
  getLogs,
  getMetrics,
  getResourceOverview,
  getResourceCpu,
  getResourceMemory,
  getEmailMetrics,
  searchTraces,
  getTrace,
  getTraceFlow,
  getServiceDetailOverview,
  getServiceTraces,
  getServiceLogs,
  getServiceMetrics,
  getServiceEndpoints,
  getServiceErrors,
} from '../controllers/analytics.controller.js';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.use(requirePermission('org:read'));

router.get('/overview', getOverview);
router.get('/latency', getLatency);
router.get('/latency/timeseries', getLatencyTimeseries);
router.get('/throughput', getThroughput);
router.get('/endpoints', getEndpoints);
router.get('/services', getServiceOverview);
router.get('/dependency-graph', getDependencyGraph);
router.get('/errors', getErrors);
router.get('/logs', getLogs);
router.get('/metrics', getMetrics);
router.get('/resources/overview', getResourceOverview);
router.get('/resources/cpu', getResourceCpu);
router.get('/resources/memory', getResourceMemory);
router.get('/email-metrics', getEmailMetrics);
router.get('/traces', searchTraces);
router.get('/traces/:traceId', getTrace);
router.get('/trace-flow/:traceId', getTraceFlow);

router.get('/services/:serviceName/overview', getServiceDetailOverview);
router.get('/services/:serviceName/traces', getServiceTraces);
router.get('/services/:serviceName/logs', getServiceLogs);
router.get('/services/:serviceName/metrics', getServiceMetrics);
router.get('/services/:serviceName/endpoints', getServiceEndpoints);
router.get('/services/:serviceName/errors', getServiceErrors);

export default router;
