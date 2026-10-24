import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/apiServices.js';
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
  setUnauthorizedHandler,
  subscribeAuthBroadcast,
  broadcastLogout,
} from '../services/apiClient.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const handleLogout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      clearAccessToken();
      broadcastLogout();
    } finally {
      setUser(null);
    }
  }, []);

  // Initialize session on startup
  useEffect(() => {
    let isMounted = true;

    // Register callback for when refresh token expires permanently
    setUnauthorizedHandler(() => {
      if (isMounted) {
        setUser(null);
      }
    });

    // Listen on BroadcastChannel for multi-tab logout/login
    const unsubscribeBroadcast = subscribeAuthBroadcast((message) => {
      if (message.type === 'AUTH_LOGOUT') {
        clearAccessToken();
        if (isMounted) {
          setUser(null);
        }
      } else if (message.type === 'AUTH_LOGIN') {
        if (isMounted) {
          setUser(message.user);
        }
      }
    });

    async function initSession() {
      try {
        // Try to get active user if access token or refresh cookie exists
        const meRes = await authService.getMe();
        if (isMounted && meRes?.user) {
          setUser(meRes.user);
        }
      } catch {
        // Fall back to attempting refresh if refresh cookie is present
        try {
          const refreshRes = await authService.refresh();
          if (refreshRes?.accessToken) {
            const meRes = await authService.getMe();
            if (isMounted && meRes?.user) {
              setUser(meRes.user);
            }
          }
        } catch {
          if (isMounted) setUser(null);
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    initSession();

    return () => {
      isMounted = false;
      unsubscribeBroadcast();
    };
  }, []);

  const login = async (credentials) => {
    const res = await authService.login(credentials);
    setUser(res.user);
    return res;
  };

  const verifyEmail = async (payload) => {
    const res = await authService.verifyEmail(payload);
    setUser(res.user);
    return res;
  };

  const signup = async (payload) => {
    return authService.signup(payload);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        signup,
        verifyEmail,
        logout: handleLogout,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
