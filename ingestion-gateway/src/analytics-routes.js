import { logger } from './observability/index.js';

const log = logger('ingestion-gateway');

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

function validateRegex(pattern) {
  if (!pattern) return null;
  if (pattern.length > 256 || /\(\?[=!<]/.test(pattern)) return { error: 'Unsafe or oversized regex pattern' };
  try {
    new RegExp(pattern);
    return null;
  } catch {
    return { error: 'Invalid regex syntax' };
  }
}

export function createAnalyticsHandler(store) {
  const db = (process.env.CLICKHOUSE_DATABASE || 'agamotto_telemetry').replace(/[^a-zA-Z0-9_]/g, '');

  return async (req, res) => {
    if (!internalAuth(req)) return sendJson(res, 401, { error: 'Unauthorized' });

    const url = new URL(req.url, 'http://gateway');
    const pathname = url.pathname.replace(/^\/v1\/organizations\//, '');
    const slashIdx = pathname.indexOf('/');
    if (slashIdx === -1) return sendJson(res, 404, { error: 'Analytics endpoint not found' });

    const organizationId = pathname.substring(0, slashIdx);
    const route = pathname.substring(slashIdx + 1);

    const requestedSince = url.searchParams.get('since');
    const requestedUntil = url.searchParams.get('until');
    // Default window: last 24 hours to ensure active observability data is captured
    const parsedSince = requestedSince ? new Date(requestedSince) : new Date(Date.now() - 86400000);
    const parsedUntil = requestedUntil ? new Date(requestedUntil) : new Date(Date.now() + 60000);

    if (Number.isNaN(parsedSince.getTime()) || Number.isNaN(parsedUntil.getTime())) {
      return sendJson(res, 400, { error: 'Invalid since or until timestamp' });
    }

    const since = parsedSince.toISOString().replace('T', ' ').replace('Z', '');
    const until = parsedUntil.toISOString().replace('T', ' ').replace('Z', '');

    const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10));
    const limit = Math.min(Math.max(1, Number.parseInt(url.searchParams.get('limit') || '50', 10)), 200);
    const offset = (page - 1) * limit;
    const fetchLimit = limit + 1;

    try {
      let query;
      let params = { organizationId, since, until };
      let isPaginated = false;
      let isTraceFlow = false;

      if (route === 'overview') {
        query = `SELECT count() AS total_spans, countIf(kind = 2) AS total_requests, countIf(status_code = 2) AS error_spans, countIf(status_code = 2) / nullIf(count(), 0) AS error_rate, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, uniq(service_name) AS active_services FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)}`;
      } else if (route === 'latency') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        query = `SELECT service_name, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.90)(duration_ns) / 1000000 AS p90_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, quantileTDigest(0.999)(duration_ns) / 1000000 AS p999_ms, avg(duration_ns) / 1000000 AS avg_ms, min(duration_ns) / 1000000 AS min_ms, max(duration_ns) / 1000000 AS max_ms, count() AS span_count FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name ORDER BY p99_ms DESC`;
      } else if (route === 'latency/timeseries') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        query = `SELECT toStartOfMinute(start_time) AS timestamp, service_name, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, count() AS requests FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} ${service ? 'AND service_name = {service:String}' : ''} GROUP BY timestamp, service_name ORDER BY timestamp ASC LIMIT 5000`;
      } else if (route === 'throughput') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        query = `SELECT toStartOfMinute(start_time) AS timestamp, service_name, count() AS request_count, count() / 60.0 AS rps FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} ${service ? 'AND service_name = {service:String}' : ''} GROUP BY timestamp, service_name ORDER BY timestamp ASC LIMIT 5000`;
      } else if (route === 'endpoints') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        isPaginated = true;
        params.limit = fetchLimit;
        params.offset = offset;
        query = `SELECT service_name, name AS endpoint, count() AS total_calls, countIf(status_code = 2) AS error_count, countIf(status_code = 2) / nullIf(count(), 0) AS error_rate, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, avg(duration_ns) / 1000000 AS avg_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name, name ORDER BY total_calls DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
      } else if (route === 'dependency-graph') {
        const depSince = requestedSince ? since : new Date(Date.now() - 30 * 86400000).toISOString().replace('T', ' ').replace('Z', '');
        params.since = depSince;
        query = `SELECT parent.service_name AS source, child.service_name AS target, count() AS calls, countIf(child.status_code = 2) AS error_count, quantileTDigest(0.50)(child.duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.99)(child.duration_ns) / 1000000 AS p99_ms FROM ${db}.trace_spans child INNER JOIN ${db}.trace_spans parent ON child.organization_id = parent.organization_id AND child.trace_id = parent.trace_id AND child.parent_span_id = parent.span_id WHERE child.organization_id = {organizationId:UUID} AND child.start_time >= {since:DateTime64(3)} AND child.start_time <= {until:DateTime64(3)} AND parent.service_name != child.service_name GROUP BY source, target ORDER BY calls DESC`;
      } else if (route === 'service-overview') {
        query = `SELECT service_name, count() AS spans, countIf(status_code = 2) AS errors, errors / nullIf(spans, 0) AS error_rate, avg(duration_ns) / 1000000 AS avg_ms, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} GROUP BY service_name ORDER BY errors DESC, p99_ms DESC`;
      } else if (route === 'errors') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        isPaginated = true;
        params.limit = fetchLimit;
        params.offset = offset;
        query = `SELECT service_name, name AS endpoint, count() AS errors, any(start_time) AS last_seen, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} AND status_code = 2 ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name, name ORDER BY errors DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
      } else if (route === 'logs') {
        const regex = url.searchParams.get('regex');
        const rawSearch = url.searchParams.get('search') || url.searchParams.get('query');
        const search = rawSearch && rawSearch !== 'undefined' ? rawSearch : null;
        const rawSeverity = url.searchParams.get('severity');
        const severity = rawSeverity && rawSeverity !== 'ALL' && rawSeverity !== 'undefined' ? rawSeverity.toUpperCase() : null;
        const service = url.searchParams.get('service');
        const traceId = url.searchParams.get('traceId');

        if (regex) {
          const err = validateRegex(regex);
          if (err) return sendJson(res, 400, err);
          params.pattern = regex;
        }
        if (search) params.search = search;
        if (severity) params.severity = severity;
        if (service && service !== 'undefined') params.service = service;
        if (traceId && traceId !== 'undefined') params.traceId = traceId;

        isPaginated = true;
        params.limit = fetchLimit;
        params.offset = offset;

        let whereExtra = '';
        if (regex) whereExtra += 'AND match(body, {pattern:String}) ';
        if (search) whereExtra += 'AND positionCaseInsensitive(body, {search:String}) > 0 ';
        if (severity) whereExtra += 'AND severity_text = {severity:String} ';
        if (service && service !== 'undefined') whereExtra += 'AND service_name = {service:String} ';
        if (traceId && traceId !== 'undefined') whereExtra += 'AND trace_id = {traceId:String} ';

        query = `SELECT service_name, time, severity_number, severity_text, body, trace_id, span_id, attributes_json FROM ${db}.telemetry_logs WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} ${whereExtra}ORDER BY time DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
      } else if (route === 'metrics') {
        const metric = url.searchParams.get('name');
        const service = url.searchParams.get('service');
        if (metric) params.metric = metric;
        if (service) params.service = service;
        query = `SELECT service_name, metric_name, metric_type, toStartOfMinute(time) AS timestamp, avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value, count() AS samples FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} ${metric ? 'AND metric_name = {metric:String}' : ''} ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name, metric_name, metric_type, timestamp ORDER BY timestamp ASC LIMIT 10000`;
      } else if (route === 'resources/overview') {
        query = `SELECT service_name, metric_name, attributes_json, argMax(value, time) AS latest_value, max(time) AS last_updated FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} AND (metric_name LIKE '%cpu%' OR metric_name LIKE '%memory%' OR metric_name LIKE '%heap%' OR metric_name LIKE '%eventloop%') GROUP BY service_name, metric_name, attributes_json ORDER BY service_name, metric_name`;
      } else if (route === 'resources/cpu') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        query = `SELECT service_name, toStartOfMinute(time) AS timestamp, avg(value) AS avg_cpu_pct, max(value) AS max_cpu_pct, quantileTDigest(0.95)(value) AS p95_cpu_pct FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} AND (metric_name = 'process.cpu.utilization' OR metric_name = 'nodejs.eventloop.utilization' OR metric_name LIKE '%cpu%') ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name, timestamp ORDER BY timestamp ASC LIMIT 5000`;
      } else if (route === 'resources/memory') {
        const service = url.searchParams.get('service');
        if (service) params.service = service;
        query = `SELECT service_name, attributes_json, toStartOfMinute(time) AS timestamp, avg(value) AS avg_bytes, max(value) AS max_bytes FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} AND (metric_name = 'process.memory.usage' OR metric_name = 'v8js.memory.heap.used' OR metric_name LIKE '%memory%') ${service ? 'AND service_name = {service:String}' : ''} GROUP BY service_name, attributes_json, timestamp ORDER BY timestamp ASC LIMIT 5000`;
      } else if (route === 'email-metrics') {
        query = `SELECT metric_name, attributes_json, sum(value) AS total_count FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} AND metric_name IN ('email.sent.count', 'email.failure.count') GROUP BY metric_name, attributes_json`;
      } else if (route === 'traces') {
        const service = url.searchParams.get('service');
        const status = url.searchParams.get('status');
        const minDurationMs = url.searchParams.get('minDurationMs');
        if (service) params.service = service;

        isPaginated = true;
        params.limit = fetchLimit;
        params.offset = offset;

        let whereClause = '';
        if (service) whereClause += 'AND service_name = {service:String} ';
        if (status === 'error') whereClause += 'AND status_code = 2 ';
        if (status === 'ok') whereClause += 'AND status_code != 2 ';

        query = `SELECT trace_id, any(service_name) AS root_service, any(name) AS root_name, min(start_time) AS trace_start_time, (max(start_time + toIntervalNanosecond(duration_ns)) - min(start_time)) / 1000000.0 AS duration_ms, count() AS span_count, countIf(status_code = 2) AS error_spans FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} ${whereClause}GROUP BY trace_id HAVING 1=1 ${minDurationMs ? 'AND duration_ms >= {minDurationMs:Float64}' : ''} ORDER BY trace_start_time DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
        if (minDurationMs) params.minDurationMs = Number(minDurationMs);
      } else if (route.startsWith('traces/')) {
        const traceId = route.substring('traces/'.length);
        params.traceId = traceId;
        query = `SELECT trace_id, span_id, parent_span_id, service_name, name, kind, start_time, duration_ns, status_code FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND trace_id = {traceId:FixedString(32)} ORDER BY start_time ASC`;
      } else if (route.startsWith('trace-flow/')) {
        const traceId = route.substring('trace-flow/'.length);
        params.traceId = traceId;
        isTraceFlow = true;
        query = `SELECT trace_id, span_id, parent_span_id, service_name, name, kind, start_time, duration_ns, status_code FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND trace_id = {traceId:FixedString(32)} ORDER BY start_time ASC`;
      } else if (route.startsWith('services/')) {
        const rest = route.substring('services/'.length);
        const subSlash = rest.indexOf('/');
        if (subSlash === -1) return sendJson(res, 404, { error: 'Service subroute required' });
        const serviceName = rest.substring(0, subSlash);
        const subOp = rest.substring(subSlash + 1);
        params.service = serviceName;

        if (subOp === 'overview') {
          query = `SELECT service_name, count() AS total_spans, countIf(kind = 2) AS incoming_requests, countIf(status_code = 2) AS error_count, countIf(status_code = 2) / nullIf(count(), 0) AS error_rate, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, avg(duration_ns) / 1000000 AS avg_ms, min(duration_ns) / 1000000 AS min_ms, max(duration_ns) / 1000000 AS max_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND service_name = {service:String} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} GROUP BY service_name`;
        } else if (subOp === 'traces') {
          const status = url.searchParams.get('status');
          const minDurationMs = url.searchParams.get('minDurationMs');
          isPaginated = true;
          params.limit = fetchLimit;
          params.offset = offset;
          let whereClause = '';
          if (status === 'error') whereClause += 'AND status_code = 2 ';
          if (status === 'ok') whereClause += 'AND status_code != 2 ';
          if (minDurationMs) {
            whereClause += 'AND duration_ns >= {minDurationNs:UInt64} ';
            params.minDurationNs = Math.round(Number(minDurationMs) * 1000000);
          }
          query = `SELECT trace_id, span_id, name, kind, start_time, duration_ns / 1000000.0 AS duration_ms, status_code FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND service_name = {service:String} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} ${whereClause}ORDER BY start_time DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
        } else if (subOp === 'logs') {
          const regex = url.searchParams.get('regex');
          const search = url.searchParams.get('search');
          const severity = url.searchParams.get('severity');
          if (regex) {
            const err = validateRegex(regex);
            if (err) return sendJson(res, 400, err);
            params.pattern = regex;
          }
          if (search) params.search = search;
          if (severity) params.severity = severity.toUpperCase();

          isPaginated = true;
          params.limit = fetchLimit;
          params.offset = offset;
          let whereExtra = '';
          if (regex) whereExtra += 'AND match(body, {pattern:String}) ';
          if (search) whereExtra += 'AND positionCaseInsensitive(body, {search:String}) > 0 ';
          if (severity) whereExtra += 'AND severity_text = {severity:String} ';

          query = `SELECT service_name, time, severity_number, severity_text, body, trace_id, span_id, attributes_json FROM ${db}.telemetry_logs WHERE organization_id = {organizationId:UUID} AND service_name = {service:String} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} ${whereExtra}ORDER BY time DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
        } else if (subOp === 'metrics') {
          const metric = url.searchParams.get('name');
          if (metric) params.metric = metric;
          query = `SELECT metric_name, metric_type, toStartOfMinute(time) AS timestamp, avg(value) AS avg_value, min(value) AS min_value, max(value) AS max_value, count() AS samples FROM ${db}.metric_samples WHERE organization_id = {organizationId:UUID} AND service_name = {service:String} AND time >= {since:DateTime64(3)} AND time <= {until:DateTime64(3)} ${metric ? 'AND metric_name = {metric:String}' : ''} GROUP BY metric_name, metric_type, timestamp ORDER BY timestamp ASC LIMIT 5000`;
        } else if (subOp === 'endpoints') {
          isPaginated = true;
          params.limit = fetchLimit;
          params.offset = offset;
          query = `SELECT name AS endpoint, count() AS total_calls, countIf(status_code = 2) AS error_count, countIf(status_code = 2) / nullIf(count(), 0) AS error_rate, quantileTDigest(0.50)(duration_ns) / 1000000 AS p50_ms, quantileTDigest(0.95)(duration_ns) / 1000000 AS p95_ms, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms, avg(duration_ns) / 1000000 AS avg_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND service_name = {service:String} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} GROUP BY name ORDER BY total_calls DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
        } else if (subOp === 'errors') {
          isPaginated = true;
          params.limit = fetchLimit;
          params.offset = offset;
          query = `SELECT name AS endpoint, count() AS errors, any(start_time) AS last_seen, quantileTDigest(0.99)(duration_ns) / 1000000 AS p99_ms FROM ${db}.trace_spans WHERE organization_id = {organizationId:UUID} AND service_name = {service:String} AND start_time >= {since:DateTime64(3)} AND start_time <= {until:DateTime64(3)} AND status_code = 2 GROUP BY name ORDER BY errors DESC LIMIT {limit:UInt16} OFFSET {offset:UInt32}`;
        } else {
          return sendJson(res, 404, { error: `Unknown service subroute: ${subOp}` });
        }
      } else {
        return sendJson(res, 404, { error: `Analytics endpoint not found: ${route}` });
      }

      const qStarted = performance.now();
      const result = await store.query(query, params);
      const rawData = await result.json();
      const durationMs = performance.now() - qStarted;

      if (isTraceFlow) {
        return sendJson(res, 200, { data: buildTraceTree(rawData), meta: { duration_ms: Number(durationMs.toFixed(2)) } });
      }

      if (isPaginated) {
        const hasMore = rawData.length > limit;
        const data = hasMore ? rawData.slice(0, limit) : rawData;
        return sendJson(res, 200, {
          data,
          pagination: {
            page,
            limit,
            hasMore,
          },
          meta: { duration_ms: Number(durationMs.toFixed(2)) },
        });
      }

      return sendJson(res, 200, { data: rawData, meta: { duration_ms: Number(durationMs.toFixed(2)) } });
    } catch (err) {
      log('ERROR', `Analytics query error: ${err.message}`, { route, error: err.message, organization_id: organizationId });
      return sendJson(res, 503, { error: 'Analytics storage is unavailable' });
    }
  };
}
