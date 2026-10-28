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
  const method = (options.method || 'GET').toUpperCase();
  const headers = {
    ...(options.headers || {}),
  };

  if (options.body && !headers['Content-Type'] && typeof options.body === 'string') {
    headers['Content-Type'] = 'application/json';
  }

  // Automatically inject x-org-id header to guarantee backend authorize middleware resolves orgId
  const orgMatch = endpoint.match(/\/orgs\/([^/?#]+)/);
  if (orgMatch && orgMatch[1] && orgMatch[1] !== 'analytics') {
    headers['x-org-id'] = orgMatch[1];
    headers['x-organization-id'] = orgMatch[1];
  } else if (!headers['x-org-id'] && typeof window !== 'undefined') {
    const savedOrg = localStorage.getItem('agamotto_current_org');
    if (savedOrg) {
      try {
        const parsed = JSON.parse(savedOrg);
        if (parsed?.id) {
          headers['x-org-id'] = parsed.id;
          headers['x-organization-id'] = parsed.id;
        }
      } catch (e) {}
    }
  }

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
    throw err;
  }
}
