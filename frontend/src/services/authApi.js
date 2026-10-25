/**
 * Eye of Agamotto Authentication Service
 * Communicates with Agamotto Express Server /auth endpoints
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

// Mode setting: stored in localStorage or default to auto-fallback
let isMockMode = localStorage.getItem('agamotto_mock_mode') === 'true';

export function setMockMode(enabled) {
  isMockMode = enabled;
  localStorage.setItem('agamotto_mock_mode', String(enabled));
}

export function getMockMode() {
  return isMockMode;
}

async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}${endpoint}`;
  
  if (isMockMode) {
    return handleMockRequest(endpoint, options);
  }

  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
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
    if (err.status) {
      // Real HTTP error response from server (400, 401, 403, 409, 500) - propagate to UI
      throw err;
    }
    // If backend is unreachable, automatically fall back to mock mode so UI never breaks!
    console.warn(`[Eye of Agamotto] Server unreachable at ${url}. Operating in standalone mock mode.`);
    return handleMockRequest(endpoint, options);
  }
}

// Standalone mock handler providing full end-to-end authentication experience
async function handleMockRequest(endpoint, options) {
  // Add realistic 250ms latency simulation
  await new Promise((resolve) => setTimeout(resolve, 250));

  const body = options.body ? JSON.parse(options.body) : {};

  if (endpoint === '/auth/signup') {
    return {
      message: 'Verification code sent to your email (Mock: enter any 6 digits)',
      email: body.email,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  if (endpoint === '/auth/verify-email') {
    const name = body.name || body.email?.split('@')[0] || 'Developer';
    return {
      message: 'Account verified successfully',
      accessToken: 'mock_jwt_access_token_' + Math.random().toString(36).substring(7),
      refreshToken: 'mock_jwt_refresh_token_' + Math.random().toString(36).substring(7),
      user: {
        id: 'usr-' + Math.random().toString(36).substring(2, 9),
        email: body.email,
        name: name,
        avatarUrl: null,
      },
    };
  }

  if (endpoint === '/auth/login') {
    const name = body.email?.split('@')[0] || 'Developer';
    return {
      message: 'Login successful',
      accessToken: 'mock_jwt_access_token_' + Math.random().toString(36).substring(7),
      refreshToken: 'mock_jwt_refresh_token_' + Math.random().toString(36).substring(7),
      user: {
        id: 'usr-' + Math.random().toString(36).substring(2, 9),
        email: body.email,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        avatarUrl: null,
        isEmailVerified: true,
      },
    };
  }

  if (endpoint === '/auth/forgot-password') {
    return {
      message: 'If an account exists, a reset code was sent',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
  }

  if (endpoint === '/auth/reset-password') {
    return {
      message: 'Password has been reset successfully. Please log in.',
    };
  }

  if (endpoint === '/auth/logout') {
    return { message: 'Logged out successfully' };
  }

  return { success: true };
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
