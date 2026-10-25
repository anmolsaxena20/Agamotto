import { context, metrics, propagation } from '@opentelemetry/api';

const meter = metrics.getMeter('server.analytics');
const queryCounter = meter.createCounter('analytics.query.count');
const queryDuration = meter.createHistogram('analytics.query.duration', { unit: 'ms' });

function gatewayUrl(path) {
  const base = process.env.ANALYTICS_GATEWAY_URL || process.env.ANALYTICS_SERVICE;
  const token = process.env.ANALYTICS_GATEWAY_TOKEN || process.env.ANALYTICS_INTERNAL_TOKEN;
  if (!base || !token) throw new Error('Analytics gateway is not configured');
  return { url: new URL(path, base), token };
}

function resolveOrgId(req) {
  return req.orgId || req.params.orgId || req.query.orgId || req.headers['x-org-id'] || req.headers['x-organization-id'];
}

async function proxy(req, res, next, suffix) {
  const started = performance.now();
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'orgId is required in path, query, or x-organization-id header' });

  try {
    const { url, token } = gatewayUrl(`/v1/organizations/${orgId}/${suffix}`);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && key !== 'orgId') url.searchParams.set(key, value);
    }

    const headers = {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    };
    propagation.inject(context.active(), headers, { set: (carrier, key, value) => carrier[key] = String(value) });

    const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    const elapsed = performance.now() - started;
    queryCounter.add(1, { operation: suffix.split('/')[0], status_code: response.status });
    queryDuration.record(elapsed, { operation: suffix.split('/')[0], status_code: response.status });

    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (error) {
    const elapsed = performance.now() - started;
    queryCounter.add(1, { operation: suffix.split('/')[0], status_code: 500 });
    queryDuration.record(elapsed, { operation: suffix.split('/')[0], status_code: 500 });
    return next(error);
  }
}

export const getOverview = (req, res, next) => proxy(req, res, next, 'overview');
export const getLatency = (req, res, next) => proxy(req, res, next, 'latency');
export const getLatencyTimeseries = (req, res, next) => proxy(req, res, next, 'latency/timeseries');
export const getThroughput = (req, res, next) => proxy(req, res, next, 'throughput');
export const getEndpoints = (req, res, next) => proxy(req, res, next, 'endpoints');
export const getServiceOverview = (req, res, next) => proxy(req, res, next, 'service-overview');
export const getDependencyGraph = (req, res, next) => proxy(req, res, next, 'dependency-graph');
export const getErrors = (req, res, next) => proxy(req, res, next, 'errors');
export const getLogs = (req, res, next) => proxy(req, res, next, 'logs');
export const getMetrics = (req, res, next) => proxy(req, res, next, 'metrics');
export const getResourceOverview = (req, res, next) => proxy(req, res, next, 'resources/overview');
export const getResourceCpu = (req, res, next) => proxy(req, res, next, 'resources/cpu');
export const getResourceMemory = (req, res, next) => proxy(req, res, next, 'resources/memory');
export const getEmailMetrics = (req, res, next) => proxy(req, res, next, 'email-metrics');
export const searchTraces = (req, res, next) => proxy(req, res, next, 'traces');
export const getTrace = (req, res, next) => proxy(req, res, next, `traces/${req.params.traceId}`);
export const getTraceFlow = (req, res, next) => proxy(req, res, next, `trace-flow/${req.params.traceId}`);

export const getServiceDetailOverview = (req, res, next) => proxy(req, res, next, `services/${req.params.serviceName}/overview`);
export const getServiceTraces = (req, res, next) => proxy(req, res, next, `services/${req.params.serviceName}/traces`);
export const getServiceLogs = (req, res, next) => proxy(req, res, next, `services/${req.params.serviceName}/logs`);
export const getServiceMetrics = (req, res, next) => proxy(req, res, next, `services/${req.params.serviceName}/metrics`);
export const getServiceEndpoints = (req, res, next) => proxy(req, res, next, `services/${req.params.serviceName}/endpoints`);
export const getServiceErrors = (req, res, next) => proxy(req, res, next, `services/${req.params.serviceName}/errors`);

export const latency = getLatency;
export const dependencyGraph = getDependencyGraph;
export const serviceOverview = getServiceOverview;
export const errors = getErrors;
export const logs = getLogs;
export const metricsHandler = getMetrics;
export const trace = getTrace;
export const traceFlow = getTraceFlow;
