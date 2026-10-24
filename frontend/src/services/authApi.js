/**
 * Eye of Agamotto Authentication Service
 * Communicates with Agamotto Express Server /auth endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // sends httpOnly cookies (access_token, refresh_token)
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const errorMsg = data.error || data.message || `Request failed with status ${response.status}`;
      const error = new Error(errorMsg);
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (err) {
    // If backend server is not running, provide an informative error
    if (err.name === 'TypeError' && err.message.includes('fetch')) {
      const offlineError = new Error(
        'Unable to connect to Agamotto backend server on http://localhost:3000. Ensure the server is running.'
      );
      offlineError.isOffline = true;
      throw offlineError;
    }
    throw err;
  }
}

export const authApi = {
  /**
   * Register a new user
   * @param {{ email: string, password: string, name?: string }} payload
   */
  async signup(payload) {
    return request('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Verify email via 6-digit OTP code
   * @param {{ email: string, otp: string }} payload
   */
  async verifyEmail(payload) {
    return request('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Log into account
   * @param {{ email: string, password: string }} payload
   */
  async login(payload) {
    return request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Request password reset OTP
   * @param {{ email: string }} payload
   */
  async forgotPassword(payload) {
    return request('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Reset password with OTP
   * @param {{ email: string, otp: string, newPassword: string, confirmNewPassword: string }} payload
   */
  async resetPassword(payload) {
    return request('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Fetch current authenticated user session
   */
  async getMe() {
    return request('/auth/me', {
      method: 'GET',
    });
  },

  /**
   * Log out and clear session cookies
   */
  async logout() {
    return request('/auth/logout', {
      method: 'POST',
    });
  },
};
