import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService.js';
import { getErrorMessage, setAccessToken } from '../services/api.js';

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

  // Initialize and verify authentication state on mount/reopen using persistent HttpOnly cookie
  useEffect(() => {
    const initializeAuth = async () => {
      setIsLoading(true);
      try {
        // Attempt to restore persistent session using HttpOnly cookie
        const data = await authService.refreshToken();
        if (data?.token && data?.user && data.user.isActive) {
          setUser(data.user);
          setToken(data.token);
          setAccessToken(data.token);
        } else {
          setUser(null);
          setToken(null);
          setAccessToken(null);
          if (data?.user && !data.user.isActive) {
            setAuthError('Your user account has been deactivated. Please contact an administrator.');
          }
        }
      } catch (err) {
        // Missing, expired, or invalid cookie
        setUser(null);
        setToken(null);
        setAccessToken(null);
        if (err.response?.status === 403) {
          setAuthError('Your user account has been deactivated. Please contact an administrator.');
        }
      } finally {
        setIsLoading(false);
        // Clean up any stale legacy tokens from localStorage to maintain strict cookie security
        localStorage.removeItem('ledgerline_token');
        localStorage.removeItem('ledgerline_user');
      }
    };

    initializeAuth();
  }, []);

  // Listen for session events dispatched by Axios interceptors
  useEffect(() => {
    const handleTokenRefreshed = (event) => {
      if (event?.detail?.token && event?.detail?.user) {
        setToken(event.detail.token);
        setUser(event.detail.user);
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
        setToken(data.token);
        setUser(data.user);
        setAccessToken(data.token);
        return { success: true, user: data.user };
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
        setToken(data.token);
        setUser(data.user);
        setAccessToken(data.token);
        return { success: true, user: data.user };
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
      if (data?.user) {
        setUser(data.user);
      }
    } catch (err) {
      console.warn('Failed to refresh user profile:', err);
    }
  };

  const value = {
    user,
    role: user?.role || null,
    token,
    isAuthenticated: !!token && !!user,
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
