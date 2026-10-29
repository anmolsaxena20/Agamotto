import { context, metrics, propagation, trace, SpanKind } from '@opentelemetry/api';
import { logger } from '../observability/index.js';

const log = logger('server.ai');
const meter = metrics.getMeter('server.ai');
const aiProxyCounter = meter.createCounter('ai.proxy.request.count');
const aiProxyDuration = meter.createHistogram('ai.proxy.request.duration', { unit: 'ms' });

function getAiServiceConfig() {
  const baseUrl = process.env.AI_SERVICE_URL || 'http://localhost:8000';
  const internalKey = process.env.AI_SERVICE_INTERNAL_KEY || 'ak_internal_ai_d8f7e2a1b94c3e5a';
  return { baseUrl, internalKey };
}

function resolveOrgId(req) {
  return req.orgId || req.params.orgId || req.query.orgId || req.headers['x-org-id'] || req.headers['x-organization-id'];
}

function buildHeaders(req, orgId) {
  const { internalKey } = getAiServiceConfig();
  const headers = {
    'content-type': 'application/json',
    'x-ai-service-key': internalKey,
    'x-org-id': orgId,
    'x-user-id': req.user?.id || 'anonymous',
  };

  // Trace context propagation
  propagation.inject(context.active(), headers, {
    set: (carrier, key, value) => (carrier[key] = String(value)),
  });

  return headers;
}

const tracer = trace.getTracer('server.ai');

/**
 * Streaming Server-Sent Events (SSE) Proxy for AI Chat Assistant
 * POST /api/orgs/:orgId/ai/ask
 */
export async function askAssistantStream(req, res, next) {
  const started = performance.now();
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID is required' });

  const { baseUrl } = getAiServiceConfig();
  const targetUrl = `${baseUrl.replace(/\/$/, '')}/ask`;

  return tracer.startActiveSpan(
    'HTTP POST /ask -> ai-service',
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'peer.service': 'ai-service',
        'http.url': targetUrl,
        'http.method': 'POST',
        'organization.id': orgId,
      },
    },
    async (span) => {
      try {
        const headers = buildHeaders(req, orgId);
        headers['accept'] = 'text/event-stream';

        const payload = { ...(req.body || {}) };
        if (payload.query && !payload.question) {
          payload.question = payload.query;
        }
        if (payload.question && !payload.query) {
          payload.query = payload.question;
        }

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
          signal: req.signal,
        });

        if (!response.ok) {
          const errorText = await response.text();
          const elapsed = performance.now() - started;
          aiProxyCounter.add(1, { endpoint: 'ask_stream', status_code: response.status });
          aiProxyDuration.record(elapsed, { endpoint: 'ask_stream', status_code: response.status });
          span.setAttribute('http.status_code', response.status);
          span.setStatus({ code: 2, message: `AI service returned HTTP ${response.status}` });
          return res.status(response.status).json({
            error: `AI service returned error ${response.status}: ${errorText}`,
          });
        }

        span.setAttribute('http.status_code', 200);
        span.setStatus({ code: 1 });

        // Set SSE Headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders?.();

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }

        const elapsed = performance.now() - started;
        aiProxyCounter.add(1, { endpoint: 'ask_stream', status_code: 200 });
        aiProxyDuration.record(elapsed, { endpoint: 'ask_stream', status_code: 200 });
        res.end();
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        if (req.aborted) {
          log('INFO', 'AI SSE client aborted connection');
          return;
        }
        const elapsed = performance.now() - started;
        aiProxyCounter.add(1, { endpoint: 'ask_stream', status_code: 500 });
        aiProxyDuration.record(elapsed, { endpoint: 'ask_stream', status_code: 500 });
        log('ERROR', `AI SSE streaming failed: ${error.message}`);
        if (!res.headersSent) {
          return res.status(500).json({ error: error.message });
        }
        res.end();
      } finally {
        span.end();
      }
    }
  );
}

/**
 * Generic JSON Forwarding Proxy to AI Service
 */
async function forwardJson(req, res, next, endpointPath, method = 'POST') {
  const started = performance.now();
  const orgId = resolveOrgId(req);
  if (!orgId) return res.status(400).json({ error: 'Organization ID is required' });

  const { baseUrl } = getAiServiceConfig();
  const targetUrl = new URL(`${baseUrl.replace(/\/$/, '')}/${endpointPath.replace(/^\//, '')}`);

  // Forward query parameters
  for (const [key, value] of Object.entries(req.query || {})) {
    if (typeof value === 'string' && key !== 'orgId') {
      targetUrl.searchParams.set(key, value);
    }
  }

  return tracer.startActiveSpan(
    `HTTP ${method} /${endpointPath} -> ai-service`,
    {
      kind: SpanKind.CLIENT,
      attributes: {
        'peer.service': 'ai-service',
        'http.url': targetUrl.toString(),
        'http.method': method,
        'organization.id': orgId,
      },
    },
    async (span) => {
      try {
        const headers = buildHeaders(req, orgId);
        const options = {
          method,
          headers,
          signal: AbortSignal.timeout(60000),
        };

        if (method !== 'GET' && method !== 'HEAD') {
          const payload = { ...(req.body || {}) };
          if (payload.query && !payload.question) {
            payload.question = payload.query;
          }
          if (payload.question && !payload.query) {
            payload.query = payload.question;
          }
          if (payload.query && !payload.sentence) {
            payload.sentence = payload.query;
          }
          if (payload.sentence && !payload.query) {
            payload.query = payload.sentence;
          }
          if (payload.domain && !payload.target) {
            payload.target = payload.domain;
          }
          options.body = JSON.stringify(payload);
        }

        const response = await fetch(targetUrl.toString(), options);
        const elapsed = performance.now() - started;
        aiProxyCounter.add(1, { endpoint: endpointPath, status_code: response.status });
        aiProxyDuration.record(elapsed, { endpoint: endpointPath, status_code: response.status });
        span.setAttribute('http.status_code', response.status);

        if (!response.ok) {
          span.setStatus({ code: 2, message: `HTTP ${response.status}` });
        } else {
          span.setStatus({ code: 1 });
        }

        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await response.json();
          return res.status(response.status).json(data);
        }

        const text = await response.text();
        return res.status(response.status).send(text);
      } catch (error) {
        span.recordException(error);
        span.setStatus({ code: 2, message: error.message });
        const elapsed = performance.now() - started;
        aiProxyCounter.add(1, { endpoint: endpointPath, status_code: 500 });
        aiProxyDuration.record(elapsed, { endpoint: endpointPath, status_code: 500 });
        log('ERROR', `AI Proxy request to ${endpointPath} failed: ${error.message}`);
        return res.status(502).json({ error: `AI service unavailable: ${error.message}` });
      } finally {
        span.end();
      }
    }
  );
}

export const askAssistantSync = (req, res, next) => forwardJson(req, res, next, 'ask/sync', 'POST');
export const parseFilter = (req, res, next) => forwardJson(req, res, next, 'parse-filter', 'POST');
export const executeFilter = (req, res, next) => forwardJson(req, res, next, 'search/execute', 'POST');
export const getAnomalies = (req, res, next) => forwardJson(req, res, next, 'anomalies', 'GET');
export const validateEvidence = (req, res, next) => forwardJson(req, res, next, 'evidence/validate', 'POST');
export const checkEvidenceItem = (req, res, next) =>
  forwardJson(req, res, next, `evidence/check/${req.params.kind}/${req.params.itemId}`, 'GET');
export const listMcpTools = (req, res, next) => forwardJson(req, res, next, 'mcp/tools', 'GET');
export const toggleMcpTool = (req, res, next) => forwardJson(req, res, next, 'mcp/tools/toggle', 'POST');
export const checkAiHealth = (req, res, next) => forwardJson(req, res, next, 'healthz', 'GET');
