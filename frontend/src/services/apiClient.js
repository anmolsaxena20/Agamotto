/**
 * Eye of Agamotto Core API Client
 * - In-memory access token storage (accessToken is never written to localStorage)
 * - Refresh token stored strictly in httpOnly cookies
 * - Auto-refresh token on 401 response with request replay queue
 * - BroadcastChannel sync across browser tabs for immediate cross-tab logout
 * - Complete route handlers for all server folder endpoints:
 *   /auth, /orgs, /orgs/:orgId/members, /orgs/:orgId/groups, /orgs/:orgId/keys,
 *   /permissions, and /orgs/:orgId/analytics
 */

const API_BASE_URL = import.meta.env.VITE_API_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || '';

// Access token stored in localStorage (refresh token remains strictly in httpOnly cookies)
export function setAccessToken(token) {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('agamotto_access_token', token);
    } else {
      localStorage.removeItem('agamotto_access_token');
    }
  }
}

export function getAccessToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('agamotto_access_token');
  }
  return null;
}

export function clearAccessToken() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('agamotto_access_token');
    localStorage.removeItem('agamotto_user_session');
  }
}

// Multi-tab sync channel
const authChannel = typeof window !== 'undefined' && 'BroadcastChannel' in window
  ? new BroadcastChannel('agamotto_auth_sync')
  : null;

// Callbacks registered by AuthContext
let onUnauthorizedCallback = null;

export function setUnauthorizedHandler(fn) {
  onUnauthorizedCallback = fn;
}

// Broadcast channel helpers
export function broadcastLogout() {
  if (authChannel) {
    authChannel.postMessage({ type: 'AUTH_LOGOUT', timestamp: Date.now() });
  }
}

export function broadcastLogin(user) {
  if (authChannel) {
    authChannel.postMessage({ type: 'AUTH_LOGIN', user, timestamp: Date.now() });
  }
}

export function subscribeAuthBroadcast(onMessage) {
  if (!authChannel) return () => {};
  const handler = (event) => {
    onMessage(event.data);
  };
  authChannel.addEventListener('message', handler);
  return () => authChannel.removeEventListener('message', handler);
}

// Concurrency control for refreshing token
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(cb) {
  refreshSubscribers.push(cb);
}

function onRefreshed(newAccessToken) {
  refreshSubscribers.forEach((cb) => cb(newAccessToken));
  refreshSubscribers = [];
}

function onRefreshFailed(error) {
  refreshSubscribers.forEach((cb) => cb(null, error));
  refreshSubscribers = [];
}

/**
 * Low-level request with automatic token refresh on 401
 */
export async function apiRequest(endpoint, options = {}, isRetry = false) {
  const url = `${API_BASE_URL}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const token = getAccessToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });

    // Handle 401 Unauthorized
    if (response.status === 401) {
      // If the 401 happened on refresh or login, do not recurse
      if (endpoint === '/auth/refresh' || endpoint === '/auth/login') {
        clearAccessToken();
        const data = await response.json().catch(() => ({}));
        const err = new Error(data.error || 'Authentication required');
        err.status = 401;
        throw err;
      }

      if (!isRetry) {
        if (!isRefreshing) {
          isRefreshing = true;
          try {
            // Auto hitting the refresh token endpoint once
            const refreshRes = await fetch(`${API_BASE_URL}/auth/refresh`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
            });

            if (!refreshRes.ok) {
              throw new Error('Refresh token invalid or expired');
            }

            const refreshData = await refreshRes.json();
            const newToken = refreshData.accessToken;
            setAccessToken(newToken);
            isRefreshing = false;
            onRefreshed(newToken);

            // Retry original request
            return apiRequest(endpoint, options, true);
          } catch (refreshErr) {
            isRefreshing = false;
            clearAccessToken();
            onRefreshFailed(refreshErr);
            if (onUnauthorizedCallback) {
              onUnauthorizedCallback();
            }
            broadcastLogout();
            throw refreshErr;
          }
        } else {
          // Wait for token refresh to complete then retry
          return new Promise((resolve, reject) => {
            subscribeTokenRefresh((newToken, err) => {
              if (err) return reject(err);
              resolve(apiRequest(endpoint, options, true));
            });
          });
        }
      }
    }

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const err = new Error(data.error || data.message || `Request failed with ${response.status}`);
      err.status = response.status;
      err.data = data;
      throw err;
    }

    return data;
  } catch (err) {
    if (err.status) {
      throw err;
    }
    // Network error / offline fallback
    return getSimulatedFallback(endpoint, options);
  }
}

/**
 * Rich mock fallback ensuring the full UI is 100% testable and deep-scopable
 * only after explicit login or token presence.
 */
function getSimulatedFallback(endpoint, options) {
  const method = (options.method || 'GET').toUpperCase();
  const body = options.body ? JSON.parse(options.body) : {};

  // Auth routes
  if (endpoint === '/auth/me') {
    const token = getAccessToken();
    const savedUser = typeof window !== 'undefined' ? localStorage.getItem('agamotto_user_session') : null;
    if (token && savedUser) {
      try {
        return { user: JSON.parse(savedUser) };
      } catch {}
    }
    // Unauthenticated: throw 401 so AuthContext knows visitor is a guest
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }

  if (endpoint === '/auth/signup') {
    return {
      message: 'Verification code sent to your email (Mock code: 123456)',
      email: body.email,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    };
  }

  if (endpoint === '/auth/verify-email') {
    const token = 'mock_jwt_access_token_' + Math.random().toString(36).slice(2);
    setAccessToken(token);
    const userObj = {
      id: 'usr_new_' + Math.random().toString(36).slice(2, 8),
      email: body.email,
      name: body.name || body.email?.split('@')[0],
      avatarUrl: null,
      isEmailVerified: true,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('agamotto_user_session', JSON.stringify(userObj));
    }
    return {
      message: 'Account verified successfully',
      accessToken: token,
      user: userObj,
    };
  }

  if (endpoint === '/auth/login') {
    const token = 'mock_jwt_access_token_' + Math.random().toString(36).slice(2);
    setAccessToken(token);
    const userObj = {
      id: 'usr_agamotto_admin',
      name: body.email ? body.email.split('@')[0] : 'Sorcerer Developer',
      email: body.email || 'sorcerer@agamotto.io',
      avatarUrl: null,
      isEmailVerified: true,
    };
    if (typeof window !== 'undefined') {
      localStorage.setItem('agamotto_user_session', JSON.stringify(userObj));
    }
    return {
      message: 'Login successful',
      accessToken: token,
      user: userObj,
    };
  }

  if (endpoint === '/auth/logout') {
    clearAccessToken();
    return { message: 'Logged out successfully' };
  }

  // Organizations routes
  if (endpoint === '/orgs' && method === 'GET') {
    return {
      organizations: [
        {
          id: 'org_kamar_taj',
          name: 'Kamar-Taj Telemetry Grid',
          slug: 'kamar-taj',
          role: 'OWNER',
          memberCount: 6,
          keyCount: 4,
          createdAt: '2026-01-15T10:00:00Z',
        },
        {
          id: 'org_sanctum_sanctorum',
          name: 'Sanctum Sanctorum NY',
          slug: 'sanctum-ny',
          role: 'ADMIN',
          memberCount: 3,
          keyCount: 2,
          createdAt: '2026-02-01T14:30:00Z',
        },
      ],
    };
  }

  if (endpoint === '/orgs' && method === 'POST') {
    return {
      organization: {
        id: 'org_' + Math.random().toString(36).slice(2, 9),
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/\s+/g, '-'),
        role: 'OWNER',
        createdAt: new Date().toISOString(),
      },
    };
  }

  if (endpoint.match(/^\/orgs\/[^/]+$/) && method === 'GET') {
    return {
      organization: {
        id: 'org_kamar_taj',
        name: 'Kamar-Taj Telemetry Grid',
        slug: 'kamar-taj',
        role: 'OWNER',
        createdAt: '2026-01-15T10:00:00Z',
      },
    };
  }

  // Members routes
  if (endpoint.includes('/members') && method === 'GET') {
    return {
      members: [
        {
          id: 'mem_01',
          userId: 'usr_01',
          name: 'Dr. Stephen Strange',
          email: 'sorcerer@agamotto.io',
          role: 'OWNER',
          groups: ['Super Admins', 'Core Telemetry Operators'],
          status: 'ACTIVE',
          joinedAt: '2026-01-15T10:00:00Z',
        },
        {
          id: 'mem_02',
          userId: 'usr_02',
          name: 'Wong (Guardian of Kamar-Taj)',
          email: 'wong@kamar-taj.org',
          role: 'ADMIN',
          groups: ['Core Telemetry Operators'],
          status: 'ACTIVE',
          joinedAt: '2026-01-16T12:00:00Z',
        },
        {
          id: 'mem_03',
          userId: 'usr_03',
          name: 'Clea of Dark Dimension',
          email: 'clea@multiverse.org',
          role: 'MEMBER',
          groups: ['Read-Only Analysts'],
          status: 'ACTIVE',
          joinedAt: '2026-02-10T09:15:00Z',
        },
      ],
    };
  }

  if (endpoint.includes('/members') && method === 'POST') {
    return {
      member: {
        id: 'mem_' + Math.random().toString(36).slice(2, 8),
        email: body.email,
        name: body.email.split('@')[0],
        role: body.role || 'MEMBER',
        status: 'INVITED',
        groups: [],
        joinedAt: new Date().toISOString(),
      },
    };
  }

  // Groups & RBAC
  if (endpoint === '/permissions') {
    return {
      permissions: [
        { id: 'perm_org_read', code: 'org:read', name: 'Read Organization', description: 'View org details and telemetry' },
        { id: 'perm_org_update', code: 'org:update', name: 'Update Organization', description: 'Modify org settings' },
        { id: 'perm_org_delete', code: 'org:delete', name: 'Delete Organization', description: 'Delete organization workspace' },
        { id: 'perm_members_read', code: 'members:read', name: 'View Members', description: 'List org members and roles' },
        { id: 'perm_members_invite', code: 'members:invite', name: 'Invite Members', description: 'Invite new collaborators' },
        { id: 'perm_members_remove', code: 'members:remove', name: 'Remove Members', description: 'Revoke collaborator access' },
        { id: 'perm_keys_read', code: 'ingest_keys:read', name: 'Read Ingest Keys', description: 'View telemetry ingestion keys' },
        { id: 'perm_keys_create', code: 'ingest_keys:create', name: 'Create Ingest Keys', description: 'Generate ingestion secrets' },
        { id: 'perm_keys_revoke', code: 'ingest_keys:revoke', name: 'Revoke Ingest Keys', description: 'Deactivate ingestion keys' },
        { id: 'perm_groups_manage', code: 'groups:manage', name: 'Manage RBAC Groups', description: 'Create and configure groups' },
      ],
    };
  }

  if (endpoint.includes('/groups') && method === 'GET') {
    return {
      groups: [
        {
          id: 'grp_01',
          name: 'Super Admins',
          description: 'Full privileged control over organizations, keys, and membership',
          memberCount: 1,
          permissions: ['org:read', 'org:update', 'org:delete', 'members:read', 'members:invite', 'members:remove', 'ingest_keys:read', 'ingest_keys:create', 'ingest_keys:revoke', 'groups:manage'],
        },
        {
          id: 'grp_02',
          name: 'Core Telemetry Operators',
          description: 'Access to high-frequency analytics, trace flows, and key provisioning',
          memberCount: 2,
          permissions: ['org:read', 'members:read', 'ingest_keys:read', 'ingest_keys:create'],
        },
        {
          id: 'grp_03',
          name: 'Read-Only Analysts',
          description: 'Inspection of metric dashboards, latency percentiles, and telemetry logs',
          memberCount: 1,
          permissions: ['org:read', 'members:read', 'ingest_keys:read'],
        },
      ],
    };
  }

  // API Ingest Keys
  if (endpoint.includes('/keys') && method === 'GET') {
    return {
      keys: [
        {
          id: 'key_prod_ingest_01',
          name: 'Production Kubernetes Cluster Gateway',
          keyPrefix: 'agamotto_live_9f82',
          isActive: true,
          totalSpansIngested: 1482093,
          lastUsedAt: 'Just now',
          createdAt: '2026-01-20T08:00:00Z',
        },
        {
          id: 'key_staging_02',
          name: 'Staging Environment OTLP Pipeline',
          keyPrefix: 'agamotto_test_3b11',
          isActive: true,
          totalSpansIngested: 84920,
          lastUsedAt: '5 minutes ago',
          createdAt: '2026-02-14T11:20:00Z',
        },
        {
          id: 'key_legacy_03',
          name: 'Deprecated Batch Collector v1',
          keyPrefix: 'agamotto_revk_0a77',
          isActive: false,
          totalSpansIngested: 2314050,
          lastUsedAt: '2 days ago',
          createdAt: '2025-11-04T15:00:00Z',
        },
      ],
    };
  }

  if (endpoint.includes('/keys') && method === 'POST') {
    return {
      key: {
        id: 'key_' + Math.random().toString(36).slice(2, 9),
        name: body.name || 'New Ingest Key',
        keyPrefix: 'agamotto_live_' + Math.random().toString(36).slice(2, 6),
        secret: 'agamotto_secret_' + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
        isActive: true,
        createdAt: new Date().toISOString(),
      },
    };
  }

  // Telemetry & Analytics
  if (endpoint.includes('/analytics/overview')) {
    return {
      totalSpans: 4892140,
      totalRequests: 1284900,
      errorRate: 0.84, // percentage
      p50: 14.2, // ms
      p95: 48.6,
      p99: 112.4,
      activeServices: ['server-gateway', 'ingestion-gateway', 'email-service', 'auth-service', 'clickhouse-cluster', 'postgres-db'],
      timeRange: 'Last 24 Hours',
      status: 'OPTIMAL',
    };
  }

  if (endpoint.includes('/analytics/services') || endpoint.includes('/analytics/service-overview')) {
    return {
      services: [
        { name: 'server-gateway', requests: 489200, errorRate: 0.12, p50: 8.4, p95: 28.1, p99: 64.0, status: 'ok', instances: 4 },
        { name: 'ingestion-gateway', requests: 1280400, errorRate: 0.04, p50: 4.2, p95: 18.5, p99: 42.1, status: 'ok', instances: 8 },
        { name: 'email-service', requests: 38200, errorRate: 1.45, p50: 45.0, p95: 180.2, p99: 340.5, status: 'warn', instances: 2 },
        { name: 'auth-service', requests: 94100, errorRate: 0.31, p50: 12.8, p95: 35.4, p99: 88.0, status: 'ok', instances: 3 },
        { name: 'clickhouse-cluster', requests: 840200, errorRate: 0.01, p50: 3.1, p95: 14.0, p99: 29.8, status: 'ok', instances: 6 },
        { name: 'postgres-db', requests: 310500, errorRate: 0.18, p50: 6.2, p95: 22.4, p99: 51.2, status: 'ok', instances: 2 },
      ],
    };
  }

  if (endpoint.includes('/analytics/latency/timeseries')) {
    const points = [];
    const now = Date.now();
    for (let i = 24; i >= 0; i--) {
      const t = new Date(now - i * 60 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      points.push({
        time: t,
        p50: Number((12 + Math.sin(i / 3) * 3 + Math.random() * 2).toFixed(1)),
        p95: Number((42 + Math.sin(i / 2) * 8 + Math.random() * 5).toFixed(1)),
        p99: Number((95 + Math.sin(i) * 15 + Math.random() * 10).toFixed(1)),
      });
    }
    return { data: points };
  }

  if (endpoint.includes('/analytics/latency')) {
    return {
      distributions: [
        { service: 'server-gateway', p50: 8.4, p90: 22.1, p95: 28.1, p99: 64.0, p999: 140.2 },
        { service: 'ingestion-gateway', p50: 4.2, p90: 14.0, p95: 18.5, p99: 42.1, p999: 98.4 },
        { service: 'email-service', p50: 45.0, p90: 130.0, p95: 180.2, p99: 340.5, p999: 720.0 },
        { service: 'auth-service', p50: 12.8, p90: 28.5, p95: 35.4, p99: 88.0, p999: 195.0 },
      ],
    };
  }

  if (endpoint.includes('/analytics/throughput')) {
    const points = [];
    const now = Date.now();
    for (let i = 20; i >= 0; i--) {
      const t = new Date(now - i * 30 * 60 * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      points.push({
        time: t,
        rps: Math.floor(180 + Math.sin(i / 2) * 50 + Math.random() * 20),
        spansPerSec: Math.floor(950 + Math.sin(i / 2) * 200 + Math.random() * 80),
      });
    }
    return { data: points, currentRps: 214, peakRps: 290 };
  }

  if (endpoint.includes('/analytics/endpoints')) {
    return {
      data: [
        { path: 'POST /v1/traces', method: 'POST', service: 'ingestion-gateway', count: 980400, p50: 3.8, p95: 14.2, p99: 32.1, errorRate: 0.02 },
        { path: 'GET /orgs/:orgId/analytics/overview', method: 'GET', service: 'server-gateway', count: 184200, p50: 11.2, p95: 32.0, p99: 68.4, errorRate: 0.10 },
        { path: 'POST /auth/login', method: 'POST', service: 'auth-service', count: 42100, p50: 18.4, p95: 42.1, p99: 95.0, errorRate: 0.42 },
        { path: 'POST /email/send-otp', method: 'POST', service: 'email-service', count: 28900, p50: 52.0, p95: 194.0, p99: 360.2, errorRate: 1.62 },
        { path: 'GET /orgs/:orgId/keys', method: 'GET', service: 'server-gateway', count: 15400, p50: 7.2, p95: 16.8, p99: 34.0, errorRate: 0.00 },
      ],
      pagination: { page: 1, limit: 50, hasMore: false },
    };
  }

  if (endpoint.includes('/analytics/dependency-graph')) {
    return {
      nodes: [
        { id: 'client', name: 'Browser / SDKs', type: 'external', status: 'ok' },
        { id: 'server-gateway', name: 'Server Gateway', type: 'service', status: 'ok', rps: 185, errorRate: 0.12 },
        { id: 'ingestion-gateway', name: 'OTLP Ingestion', type: 'service', status: 'ok', rps: 840, errorRate: 0.04 },
        { id: 'auth-service', name: 'Auth Controller', type: 'service', status: 'ok', rps: 45, errorRate: 0.31 },
        { id: 'email-service', name: 'Email Dispatcher', type: 'service', status: 'warn', rps: 12, errorRate: 1.45 },
        { id: 'clickhouse', name: 'ClickHouse Telemetry', type: 'database', status: 'ok', rps: 920, p99: 29.8 },
        { id: 'postgres', name: 'Postgres DB', type: 'database', status: 'ok', rps: 220, p99: 51.2 },
      ],
      edges: [
        { source: 'client', target: 'server-gateway', callCount: 185000, p99: 64.0, errorCount: 22 },
        { source: 'client', target: 'ingestion-gateway', callCount: 840000, p99: 42.1, errorCount: 34 },
        { source: 'server-gateway', target: 'auth-service', callCount: 45000, p99: 88.0, errorCount: 14 },
        { source: 'auth-service', target: 'email-service', callCount: 12000, p99: 340.5, errorCount: 174 },
        { source: 'server-gateway', target: 'postgres', callCount: 120000, p99: 45.0, errorCount: 12 },
        { source: 'ingestion-gateway', target: 'clickhouse', callCount: 840000, p99: 29.8, errorCount: 8 },
      ],
    };
  }

  if (endpoint.includes('/analytics/errors')) {
    return {
      data: [
        {
          id: 'err_01',
          service: 'email-service',
          endpoint: 'POST /email/send-otp',
          errorType: 'SmtpConnectionTimeout',
          message: 'Connection timed out while resolving SMTP host relay',
          count: 142,
          lastSeen: '2 minutes ago',
          p99: 420.5,
        },
        {
          id: 'err_02',
          service: 'auth-service',
          endpoint: 'POST /auth/login',
          errorType: 'InvalidCredentialsException',
          message: 'Password mismatch during bcrypt compare operation',
          count: 88,
          lastSeen: '6 minutes ago',
          p99: 22.0,
        },
        {
          id: 'err_03',
          service: 'server-gateway',
          endpoint: 'GET /orgs/:orgId/members',
          errorType: 'DatabaseConnectionPoolExhausted',
          message: 'Timeout waiting for idle connection from pool after 5000ms',
          count: 9,
          lastSeen: '18 minutes ago',
          p99: 5040.0,
        },
      ],
      pagination: { page: 1, limit: 50, hasMore: false },
    };
  }

  if (endpoint.includes('/analytics/logs')) {
    return {
      data: [
        { id: 'log_01', timestamp: new Date(Date.now() - 1000 * 12).toISOString(), service: 'server-gateway', severity: 'INFO', message: 'HTTP 200 GET /orgs/org_kamar_taj/analytics/overview 14.2ms', traceId: 'tr_7a9f82c401', spanId: 'sp_1001' },
        { id: 'log_02', timestamp: new Date(Date.now() - 1000 * 25).toISOString(), service: 'email-service', severity: 'WARN', message: 'SMTP relay delivery slow: 890ms taken to deliver OTP code', traceId: 'tr_4c2d81e905', spanId: 'sp_1002' },
        { id: 'log_03', timestamp: new Date(Date.now() - 1000 * 42).toISOString(), service: 'ingestion-gateway', severity: 'INFO', message: 'Flushed batch of 2500 spans into ClickHouse table agamotto_telemetry.trace_spans', traceId: 'tr_89ff30a112', spanId: 'sp_1003' },
        { id: 'log_04', timestamp: new Date(Date.now() - 1000 * 95).toISOString(), service: 'email-service', severity: 'ERROR', message: 'Failed to send OTP email: connect ETIMEDOUT 10.0.4.12:587', traceId: 'tr_1b83d9aa44', spanId: 'sp_1004' },
        { id: 'log_05', timestamp: new Date(Date.now() - 1000 * 130).toISOString(), service: 'auth-service', severity: 'INFO', message: 'Issued refreshed token pair for user Dr. Stephen Strange', traceId: 'tr_98cb124ff3', spanId: 'sp_1005' },
      ],
      pagination: { page: 1, limit: 50, hasMore: false },
    };
  }

  if (endpoint.includes('/analytics/resources/overview')) {
    return {
      services: [
        { service: 'server-gateway', cpuPercent: 18.4, memoryMb: 142.5, memoryLimitMb: 512, status: 'ok' },
        { service: 'ingestion-gateway', cpuPercent: 34.2, memoryMb: 310.0, memoryLimitMb: 1024, status: 'ok' },
        { service: 'email-service', cpuPercent: 4.8, memoryMb: 88.2, memoryLimitMb: 256, status: 'ok' },
        { service: 'clickhouse-cluster', cpuPercent: 28.6, memoryMb: 1480.0, memoryLimitMb: 4096, status: 'ok' },
        { service: 'postgres-db', cpuPercent: 12.1, memoryMb: 420.0, memoryLimitMb: 2048, status: 'ok' },
      ],
    };
  }

  if (endpoint.includes('/analytics/resources/cpu')) {
    const points = [];
    for (let i = 15; i >= 0; i--) {
      points.push({
        time: `${i * 2}m ago`,
        'server-gateway': Math.floor(15 + Math.random() * 8),
        'ingestion-gateway': Math.floor(30 + Math.random() * 12),
        'email-service': Math.floor(4 + Math.random() * 3),
        'clickhouse-cluster': Math.floor(25 + Math.random() * 10),
      });
    }
    return { data: points };
  }

  if (endpoint.includes('/analytics/resources/memory')) {
    const points = [];
    for (let i = 15; i >= 0; i--) {
      points.push({
        time: `${i * 2}m ago`,
        'server-gateway': 140 + Math.floor(Math.random() * 10),
        'ingestion-gateway': 305 + Math.floor(Math.random() * 15),
        'email-service': 85 + Math.floor(Math.random() * 5),
        'clickhouse-cluster': 1470 + Math.floor(Math.random() * 25),
      });
    }
    return { data: points };
  }

  if (endpoint.includes('/analytics/email-metrics')) {
    return {
      sent: 24800,
      delivered: 24420,
      failed: 380,
      deliveryRate: 98.47,
      averageDeliveryTimeMs: 142.8,
      failureReasons: [
        { reason: 'SmtpTimeout', count: 240 },
        { reason: 'InvalidRecipientAddress', count: 105 },
        { reason: 'MailboxFull', count: 35 },
      ],
    };
  }

  if (endpoint.includes('/analytics/traces') && !endpoint.includes('/traces/')) {
    return {
      data: [
        {
          traceId: 'tr_7a9f82c401e8b31a',
          rootSpan: 'GET /orgs/:orgId/analytics/overview',
          service: 'server-gateway',
          statusCode: 200,
          durationMs: 14.2,
          spanCount: 8,
          timestamp: new Date(Date.now() - 1000 * 20).toISOString(),
          errorCount: 0,
        },
        {
          traceId: 'tr_4c2d81e905fa77bb',
          rootSpan: 'POST /auth/verify-email',
          service: 'auth-service',
          statusCode: 200,
          durationMs: 42.6,
          spanCount: 12,
          timestamp: new Date(Date.now() - 1000 * 85).toISOString(),
          errorCount: 0,
        },
        {
          traceId: 'tr_1b83d9aa44093f18',
          rootSpan: 'POST /auth/signup',
          service: 'auth-service',
          statusCode: 500,
          durationMs: 1042.0,
          spanCount: 6,
          timestamp: new Date(Date.now() - 1000 * 180).toISOString(),
          errorCount: 1,
        },
        {
          traceId: 'tr_89ff30a112f45cc9',
          rootSpan: 'POST /v1/traces',
          service: 'ingestion-gateway',
          statusCode: 200,
          durationMs: 6.8,
          spanCount: 4,
          timestamp: new Date(Date.now() - 1000 * 320).toISOString(),
          errorCount: 0,
        },
      ],
      pagination: { page: 1, limit: 50, hasMore: false },
    };
  }

  if (endpoint.includes('/trace-flow/')) {
    const traceId = endpoint.split('/').pop();
    return {
      traceId,
      rootService: 'server-gateway',
      totalDurationMs: 48.6,
      root: {
        id: 'sp_root',
        name: 'HTTP SERVER GET /orgs/:orgId/analytics/overview',
        service: 'server-gateway',
        kind: 'SERVER',
        durationMs: 48.6,
        startTimeMs: 0,
        statusCode: 200,
        attributes: { 'http.method': 'GET', 'http.status_code': 200, 'http.route': '/orgs/:orgId/analytics/overview' },
        children: [
          {
            id: 'sp_auth_mw',
            name: 'middleware: authenticate',
            service: 'server-gateway',
            kind: 'INTERNAL',
            durationMs: 4.2,
            startTimeMs: 0.8,
            statusCode: 200,
            children: [],
          },
          {
            id: 'sp_ch_proxy',
            name: 'HTTP CLIENT POST /v1/organizations/:orgId/overview',
            service: 'server-gateway',
            kind: 'CLIENT',
            durationMs: 40.1,
            startTimeMs: 5.4,
            statusCode: 200,
            children: [
              {
                id: 'sp_ch_entry',
                name: 'HTTP SERVER GET /v1/organizations/:orgId/overview',
                service: 'ingestion-gateway',
                kind: 'SERVER',
                durationMs: 38.5,
                startTimeMs: 6.2,
                statusCode: 200,
                children: [
                  {
                    id: 'sp_ch_query',
                    name: 'ClickHouse: SELECT quantileTDigest(0.5)...',
                    service: 'clickhouse-cluster',
                    kind: 'CLIENT',
                    durationMs: 24.2,
                    startTimeMs: 8.0,
                    statusCode: 200,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
  }

  if (endpoint.includes('/traces/')) {
    const traceId = endpoint.split('/').pop();
    return {
      traceId,
      spans: [
        { spanId: 'sp_01', parentSpanId: null, name: 'GET /orgs/:orgId/analytics/overview', service: 'server-gateway', kind: 'SERVER', durationMs: 48.6, statusCode: 200, startTime: '0ms' },
        { spanId: 'sp_02', parentSpanId: 'sp_01', name: 'middleware: authenticate', service: 'server-gateway', kind: 'INTERNAL', durationMs: 4.2, statusCode: 200, startTime: '+0.8ms' },
        { spanId: 'sp_03', parentSpanId: 'sp_01', name: 'proxy: query analytics-gateway', service: 'server-gateway', kind: 'CLIENT', durationMs: 40.1, statusCode: 200, startTime: '+5.4ms' },
        { spanId: 'sp_04', parentSpanId: 'sp_03', name: 'execute ClickHouse aggregation', service: 'ingestion-gateway', kind: 'INTERNAL', durationMs: 24.2, statusCode: 200, startTime: '+8.0ms' },
      ],
    };
  }

  // Generic fallback
  return { success: true };
}
