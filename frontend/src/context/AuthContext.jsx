import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService.js';
import { getErrorMessage, setAccessToken } from '../services/api.js';
import { normalizeAuthUser } from '../utils/roleHelpers.js';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Initialize and verify authentication state on mount/reopen using persistent HttpOnly cookie & /auth/me
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        // Attempt to restore persistent session using HttpOnly cookie
        const data = await authService.refreshToken();
        if (data?.token && data?.user && data.user.isActive) {
          setAccessToken(data.token);
          if (isMounted) {
            setToken(data.token);
          }

          // Authoritative profile & role synchronization via /auth/me
          try {
            const meData = await authService.getCurrentUser();
            const rawUser = meData?.user || meData || data.user;
            if (isMounted) {
              setUser(normalizeAuthUser(rawUser));
            }
          } catch (meErr) {
            if (isMounted) {
              setUser(normalizeAuthUser(data.user));
            }
          }
        } else {
          if (isMounted) {
            setUser(null);
            setToken(null);
          }
          setAccessToken(null);
          if (data?.user && !data.user.isActive && isMounted) {
            setAuthError('Your user account has been deactivated. Please contact an administrator.');
          }
        }
      } catch (err) {
        // Missing, expired, or invalid cookie
        if (isMounted) {
          setUser(null);
          setToken(null);
        }
        setAccessToken(null);
        if (err.response?.status === 403 && isMounted) {
          setAuthError('Your user account has been deactivated. Please contact an administrator.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
        // Clean up any stale legacy tokens from localStorage to maintain strict cookie security
        localStorage.removeItem('ledgerline_token');
        localStorage.removeItem('ledgerline_user');
      }
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for session events dispatched by Axios interceptors
  useEffect(() => {
    const handleTokenRefreshed = (event) => {
      if (event?.detail?.token && event?.detail?.user) {
        setToken(event.detail.token);
        setUser(normalizeAuthUser(event.detail.user));
        setAccessToken(event.detail.token);
      }
    };

    const handleSessionExpired = (event) => {
      setUser(null);
      setToken(null);
      setAccessToken(null);
      if (event?.detail?.reason === 'deactivated') {
        setAuthError('Your user account has been deactivated. Please contact an administrator.');
      } else if (event?.detail?.reason === 'unauthorized') {
        setAuthError('Your authentication session has expired. Please log in again.');
      }
    };

    window.addEventListener('ledgerline:token_refreshed', handleTokenRefreshed);
    window.addEventListener('ledgerline:session_expired', handleSessionExpired);

    return () => {
      window.removeEventListener('ledgerline:token_refreshed', handleTokenRefreshed);
      window.removeEventListener('ledgerline:session_expired', handleSessionExpired);
    };
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await authService.login(email, password);
      if (data?.token && data?.user) {
        const normalized = normalizeAuthUser(data.user);
        setToken(data.token);
        setUser(normalized);
        setAccessToken(data.token);
        return { success: true, user: normalized };
      }
      throw new Error('Invalid authentication response.');
    } catch (err) {
      const msg = getErrorMessage(err);
      setAuthError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name, email, password, confirmPassword) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await authService.register(name, email, password, confirmPassword);
      if (data?.token && data?.user) {
        const normalized = normalizeAuthUser(data.user);
        setToken(data.token);
        setUser(normalized);
        setAccessToken(data.token);
        return { success: true, user: normalized };
      }
      throw new Error('Invalid registration response.');
    } catch (err) {
      const msg = getErrorMessage(err);
      setAuthError(msg);
      return { success: false, error: msg };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (err) {
      console.warn('Logout request failed:', err);
    } finally {
      setToken(null);
      setUser(null);
      setAccessToken(null);
      setAuthError(null);
      localStorage.removeItem('ledgerline_token');
      localStorage.removeItem('ledgerline_user');
    }
  };

  const refreshUser = async () => {
    try {
      const data = await authService.getCurrentUser();
      const rawUser = data?.user || data;
      if (rawUser) {
        setUser(normalizeAuthUser(rawUser));
      }
    } catch (err) {
      console.warn('Failed to refresh user profile:', err);
    }
  };

  const normalizedRole = user?.role ? String(user.role).trim().toUpperCase() : null;

  const value = {
    user,
    role: normalizedRole,
    token,
    isAuthenticated: !!token && !!user && !!normalizedRole,
    isLoading,
    authError,
    login,
    register,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export default AuthProvider;
