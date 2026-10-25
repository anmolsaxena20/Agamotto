/**
 * Eye of Agamotto Authentication Service
 * Delegates to centralized authService in apiServices.js to guarantee:
 * - Proper Authorization Bearer header injection
 * - Access token stored in localStorage (agamotto_access_token)
 * - Refresh token stored in httpOnly cookies with credentials: 'include'
 * - Cross-tab BroadcastChannel logout/login synchronization
 */

import { authService } from './apiServices.js';

export const authApi = {
  /**
   * Register a new user
   * @param {{ email: string, password: string, name?: string }} payload
   */
  async signup(payload) {
    return authService.signup(payload);
  },

  /**
   * Verify email via 6-digit OTP code
   * @param {{ email: string, otp: string }} payload
   */
  async verifyEmail(payload) {
    return authService.verifyEmail(payload);
  },

  /**
   * Log into account
   * @param {{ email: string, password: string }} payload
   */
  async login(payload) {
    return authService.login(payload);
  },

  /**
   * Request password reset OTP
   * @param {{ email: string }} payload
   */
  async forgotPassword(payload) {
    return authService.forgotPassword(payload);
  },

  /**
   * Reset password with OTP
   * @param {{ email: string, otp: string, newPassword: string, confirmNewPassword: string }} payload
   */
  async resetPassword(payload) {
    return authService.resetPassword(payload);
  },

  /**
   * Fetch current authenticated user session
   */
  async getMe() {
    return authService.getMe();
  },

  /**
   * Log out and clear session tokens
   */
  async logout() {
    return authService.logout();
  },
};
