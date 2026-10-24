import { apiRequest, setAccessToken, clearAccessToken, broadcastLogout, broadcastLogin } from './apiClient.js';

export const authService = {
  async signup({ email, password, name }) {
    return apiRequest('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name }),
    });
  },

  async verifyEmail({ email, otp }) {
    const data = await apiRequest('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ email, otp }),
    });
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      broadcastLogin(data.user);
    }
    return data;
  },

  async login({ email, password }) {
    const data = await apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.accessToken) {
      setAccessToken(data.accessToken);
      broadcastLogin(data.user);
    }
    return data;
  },

  async refresh() {
    const data = await apiRequest('/auth/refresh', {
      method: 'POST',
    });
    if (data.accessToken) {
      setAccessToken(data.accessToken);
    }
    return data;
  },

  async forgotPassword({ email }) {
    return apiRequest('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  },

  async resetPassword({ email, otp, newPassword, confirmNewPassword }) {
    return apiRequest('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, otp, newPassword, confirmNewPassword }),
    });
  },

  async getMe() {
    return apiRequest('/auth/me', {
      method: 'GET',
    });
  },

  async logout() {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } finally {
      clearAccessToken();
      broadcastLogout();
    }
  },
};

export const orgService = {
  async listOrgs() {
    return apiRequest('/orgs', { method: 'GET' });
  },

  async createOrg({ name, slug }) {
    return apiRequest('/orgs', {
      method: 'POST',
      body: JSON.stringify({ name, slug }),
    });
  },

  async getOrg(orgId) {
    return apiRequest(`/orgs/${orgId}`, { method: 'GET' });
  },

  async updateOrg(orgId, { name, slug }) {
    return apiRequest(`/orgs/${orgId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, slug }),
    });
  },

  async deleteOrg(orgId) {
    return apiRequest(`/orgs/${orgId}`, { method: 'DELETE' });
  },
};

export const memberService = {
  async listMembers(orgId) {
    return apiRequest(`/orgs/${orgId}/members`, { method: 'GET' });
  },

  async addMember(orgId, { email, role }) {
    return apiRequest(`/orgs/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role }),
    });
  },

  async removeMember(orgId, memberId) {
    return apiRequest(`/orgs/${orgId}/members/${memberId}`, { method: 'DELETE' });
  },
};

export const rbacService = {
  async listPermissions() {
    return apiRequest('/permissions', { method: 'GET' });
  },

  async listGroups(orgId) {
    return apiRequest(`/orgs/${orgId}/groups`, { method: 'GET' });
  },

  async createGroup(orgId, { name, description }) {
    return apiRequest(`/orgs/${orgId}/groups`, {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    });
  },

  async getGroup(orgId, groupId) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}`, { method: 'GET' });
  },

  async updateGroup(orgId, groupId, { name, description }) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}`, {
      method: 'PATCH',
      body: JSON.stringify({ name, description }),
    });
  },

  async deleteGroup(orgId, groupId) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}`, { method: 'DELETE' });
  },

  async assignPermission(orgId, groupId, permissionId) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}/permissions`, {
      method: 'POST',
      body: JSON.stringify({ permissionId }),
    });
  },

  async removePermission(orgId, groupId, permissionId) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}/permissions/${permissionId}`, {
      method: 'DELETE',
    });
  },

  async assignMember(orgId, groupId, memberId) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}/members`, {
      method: 'POST',
      body: JSON.stringify({ memberId }),
    });
  },

  async removeMember(orgId, groupId, memberId) {
    return apiRequest(`/orgs/${orgId}/groups/${groupId}/members/${memberId}`, {
      method: 'DELETE',
    });
  },
};

export const keyService = {
  async listKeys(orgId) {
    return apiRequest(`/orgs/${orgId}/keys`, { method: 'GET' });
  },

  async createKey(orgId, { name }) {
    return apiRequest(`/orgs/${orgId}/keys`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  async toggleKey(orgId, keyId, { isActive }) {
    return apiRequest(`/orgs/${orgId}/keys/${keyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive }),
    });
  },

  async revokeKey(orgId, keyId) {
    return apiRequest(`/orgs/${orgId}/keys/${keyId}`, { method: 'DELETE' });
  },
};

export const analyticsService = {
  async getOverview(orgId) {
    return apiRequest(`/orgs/${orgId}/analytics/overview`);
  },

  async getLatency(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/latency${query ? `?${query}` : ''}`);
  },

  async getLatencyTimeseries(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/latency/timeseries${query ? `?${query}` : ''}`);
  },

  async getThroughput(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/throughput${query ? `?${query}` : ''}`);
  },

  async getEndpoints(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/endpoints${query ? `?${query}` : ''}`);
  },

  async getServices(orgId) {
    return apiRequest(`/orgs/${orgId}/analytics/services`);
  },

  async getDependencyGraph(orgId) {
    return apiRequest(`/orgs/${orgId}/analytics/dependency-graph`);
  },

  async getErrors(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/errors${query ? `?${query}` : ''}`);
  },

  async getLogs(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/logs${query ? `?${query}` : ''}`);
  },

  async getMetrics(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/metrics${query ? `?${query}` : ''}`);
  },

  async getResourceOverview(orgId) {
    return apiRequest(`/orgs/${orgId}/analytics/resources/overview`);
  },

  async getResourceCpu(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/resources/cpu${query ? `?${query}` : ''}`);
  },

  async getResourceMemory(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/resources/memory${query ? `?${query}` : ''}`);
  },

  async getEmailMetrics(orgId) {
    return apiRequest(`/orgs/${orgId}/analytics/email-metrics`);
  },

  async searchTraces(orgId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/traces${query ? `?${query}` : ''}`);
  },

  async getTrace(orgId, traceId) {
    return apiRequest(`/orgs/${orgId}/analytics/traces/${traceId}`);
  },

  async getTraceFlow(orgId, traceId) {
    return apiRequest(`/orgs/${orgId}/analytics/trace-flow/${traceId}`);
  },

  async getServiceDetail(orgId, serviceName) {
    return apiRequest(`/orgs/${orgId}/analytics/services/${serviceName}/overview`);
  },

  async getServiceTraces(orgId, serviceName, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/services/${serviceName}/traces${query ? `?${query}` : ''}`);
  },

  async getServiceLogs(orgId, serviceName, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/services/${serviceName}/logs${query ? `?${query}` : ''}`);
  },

  async getServiceMetrics(orgId, serviceName, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/services/${serviceName}/metrics${query ? `?${query}` : ''}`);
  },

  async getServiceEndpoints(orgId, serviceName, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/services/${serviceName}/endpoints${query ? `?${query}` : ''}`);
  },

  async getServiceErrors(orgId, serviceName, params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/orgs/${orgId}/analytics/services/${serviceName}/errors${query ? `?${query}` : ''}`);
  },
};
