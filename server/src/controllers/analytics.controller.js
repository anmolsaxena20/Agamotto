function gatewayUrl(path) {
  const base = process.env.ANALYTICS_GATEWAY_URL || process.env.ANALYTICS_SERVICE;
  const token = process.env.ANALYTICS_GATEWAY_TOKEN || process.env.ANALYTICS_INTERNAL_TOKEN;
  if (!base || !token) throw new Error('Analytics gateway is not configured');
  return { url: new URL(path, base), token };
}
async function proxy(req, res, next, suffix) {
  try {
    const { url, token } = gatewayUrl(`/v1/organizations/${req.params.orgId}/${suffix}`);
    for (const [key, value] of Object.entries(req.query)) if (typeof value === 'string') url.searchParams.set(key, value);
    const response = await fetch(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    const body = await response.json();
    return res.status(response.status).json(body);
  } catch (error) { return next(error); }
}
export const latency = (req, res, next) => proxy(req, res, next, 'latency');
export const dependencyGraph = (req, res, next) => proxy(req, res, next, 'dependency-graph');
export const serviceOverview = (req, res, next) => proxy(req, res, next, 'service-overview');
export const errors = (req, res, next) => proxy(req, res, next, 'errors');
export const logs = (req, res, next) => proxy(req, res, next, 'logs');
export const metrics = (req, res, next) => proxy(req, res, next, 'metrics');
export const trace = (req, res, next) => proxy(req, res, next, `traces/${req.params.traceId}`);
export const traceFlow = (req, res, next) => proxy(req, res, next, `trace-flow/${req.params.traceId}`);
