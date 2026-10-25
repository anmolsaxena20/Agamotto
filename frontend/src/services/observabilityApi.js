/**
 * Eye of Agamotto - Observability API Client
 * Interfaces with Agamotto server /observability endpoints
 */

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function fetchJson(endpoint, options = {}) {
  const url = `${BASE_URL}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      credentials: 'include',
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP error ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    console.warn(`[Observability API] Error fetching ${url}:`, err.message);
    throw err;
  }
}

export const observabilityApi = {
  /**
   * System KPI Overview
   */
  async getOverview(params = {}) {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/observability/overview${q ? `?${q}` : ''}`);
  },

  /**
   * Distributed Traces Search
   */
  async getTraces(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );
    const q = new URLSearchParams(cleanParams).toString();
    return fetchJson(`/observability/traces${q ? `?${q}` : ''}`);
  },

  /**
   * Single Trace Spans
   */
  async getTraceById(traceId) {
    return fetchJson(`/observability/traces/${traceId}`);
  },

  /**
   * Hierarchical Waterfall Tree
   */
  async getTraceFlow(traceId) {
    return fetchJson(`/observability/trace-flow/${traceId}`);
  },

  /**
   * Granular Spans Explorer
   */
  async getSpans(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );
    const q = new URLSearchParams(cleanParams).toString();
    return fetchJson(`/observability/spans${q ? `?${q}` : ''}`);
  },

  /**
   * Span Details with Correlated Logs
   */
  async getSpanById(spanId) {
    return fetchJson(`/observability/spans/${spanId}`);
  },

  /**
   * Correlated Telemetry Logs
   */
  async getLogs(params = {}) {
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );
    const q = new URLSearchParams(cleanParams).toString();
    return fetchJson(`/observability/logs${q ? `?${q}` : ''}`);
  },

  /**
   * System & Application Metrics
   */
  async getMetrics(params = {}) {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/observability/metrics${q ? `?${q}` : ''}`);
  },

  /**
   * Latency percentiles & timeseries
   */
  async getLatency(params = {}) {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/observability/latency${q ? `?${q}` : ''}`);
  },

  async getLatencyTimeseries(params = {}) {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/observability/latency/timeseries${q ? `?${q}` : ''}`);
  },

  /**
   * Throughput & RPS
   */
  async getThroughput(params = {}) {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/observability/throughput${q ? `?${q}` : ''}`);
  },

  /**
   * Service Dependency Topology
   */
  async getTopology() {
    return fetchJson('/observability/dependency-graph');
  },

  /**
   * Services Health Summary
   */
  async getServices() {
    return fetchJson('/observability/services');
  },

  /**
   * Error Groups
   */
  async getErrors(params = {}) {
    const q = new URLSearchParams(params).toString();
    return fetchJson(`/observability/errors${q ? `?${q}` : ''}`);
  },

  /**
   * Simulate telemetry traffic or error spike
   */
  async simulateTelemetry(payload = {}) {
    return fetchJson('/observability/simulate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
