function internalAuth(req) {
  const token = process.env.ANALYTICS_INTERNAL_TOKEN;
  return Boolean(token && token.trim().length > 0 && req.headers.authorization === `Bearer ${token}`);
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function buildTraceTree(spans) {
  const byId = new Map();
  for (const s of spans) byId.set(s.span_id, { ...s, children: [] });
  const roots = [];
  for (const s of spans) {
    const node = byId.get(s.span_id);
    if (s.parent_span_id && byId.has(s.parent_span_id) && s.parent_span_id !== s.span_id) {
      byId.get(s.parent_span_id).children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

export function createAnalyticsHandler(store) {
  const db = (process.env.CLICKHOUSE_DATABASE || 'agamotto_telemetry').replace(/[^a-zA-Z0-9_]/g, '');

  return async (req, res) => {
    if (!internalAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });

    const url = new URL(req.url, 'http://gateway');
    const match = url.pathname.match(/^\/v1\/organizations\/([^/]+)\/(latency|dependency-graph|service-overview|errors|logs|metrics|traces\/([a-f0-9]{32})|trace-flow\/([a-f0-9]{32}))$/);
    if (!match) return sendJson(res, 404, { error: 'Analytics endpoint not found' });

    const organizationId = match[1];
    const operation = match[2];
    const isTraceFlow = Boolean(match[4]);
    const requestedSince = url.searchParams.get('since');
    const parsedSince = requestedSince ? new Date(requestedSince) : new Date(Date.now() - 3600000);

    if (Number.isNaN(parsedSince.getTime())) return sendJson(res, 400, { error: 'since must be a valid date/time' });

    const since = parsedSince.toISOString().replace('T', ' ').replace('Z', '');

    try {
      let query;
      let params = { organizationId, since };

      if (operation === 'latency') {
        const service = url.searchParams.get('service');
        query = `SELECT service_name, quantileTDigest(0.05)(duration_ns) / 1000000 AS p05_ms, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, count() AS span_count FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name ORDER BY p99_ms DESC`;
        if (service) params.service = service;
      } else if (operation === 'dependency-graph') {
        query = `SELECT parent.service_name AS source, child.service_name AS target, count() AS calls, quantileTDigest(0.99)(child.duration_ns) / 1000000 AS p99_ms FROM ${db}.trace_spans child INNER JOIN ${db}.trace_spans parent ON child.organization_id = parent.organization_id AND child.trace_id = parent.trace_id AND child.parent_span_id = parent.span_id WHERE child.organization_id = {organizationId:UUID} AND child.start_time >= {since:DateTime64(3)} AND parent.service_name != child.service_name GROUP BY source, target ORDER BY calls DESC`;
      } else if (operation === 'service-overview') {
        query = `SELECT service_name, count() AS spans, countIf(status_code = 2) AS errors, errors / spans AS error_rate, avg(duration_ns) / 1000000 AS avg_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} GROUP BY service_name ORDER BY errors DESC, p99_ms DESC`;
      } else if (operation === 'errors') {
        query = `SELECT service_name, name, count() AS errors, any(start_time) AS last_seen FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND status_code = 2 GROUP BY service_name, name ORDER BY errors DESC LIMIT 100`;
      } else if (operation === 'logs') {
        const pattern = url.searchParams.get('regex');
        if (pattern && (pattern.length > 256 || /\(\?[=!<]/.test(pattern))) return sendJson(res, 400, { error: 'Unsafe or oversized regex' });
        params.limit = Math.min(Number(url.searchParams.get('limit') || 100), 500);
        if (pattern) params.pattern = pattern;
        query = `SELECT service_name, time, severity_number, severity_text, body, trace_id, span_id FROM ${db}.telemetry_logs WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} ${pattern ? 'AND match(body, {pattern:String})' : ''} ORDER BY time DESC LIMIT {limit:UInt16}`;
      } else if (operation === 'metrics') {
        const metric = url.searchParams.get('name');
        if (metric) params.metric = metric;
        query = `SELECT service_name, metric_name, metric_type, toStartOfMinute(time) AS timestamp, avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value, count() AS samples FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} ${metric ? 'AND metric_name = {metric:String}' : ''} GROUP BY service_name, metric_name, metric_type, timestamp ORDER BY timestamp ASC LIMIT 10000`;
      } else {
        params.traceId = match[3] || match[4];
        query = `SELECT trace_id, span_id, parent_span_id, service_name, name, kind, start_time, duration_ns, status_code FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND trace_id = {traceId:FixedString(32)} ORDER BY start_time`;
      }

      const result = await store.query(query, params);
      const rawData = await result.json();
      const responseData = isTraceFlow ? buildTraceTree(rawData) : rawData;
      return sendJson(res, 200, { data: responseData });
    } catch {
      return sendJson(res, 503, { error: 'Analytics storage is unavailable' });
    }
  };
}
