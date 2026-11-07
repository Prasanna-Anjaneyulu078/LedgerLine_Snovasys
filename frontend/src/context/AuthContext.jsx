import React, { createContext, useContext, useState, useEffect } from 'react';
import authService from '../services/authService.js';
import { getErrorMessage } from '../services/api.js';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('ledgerline_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('ledgerline_token') || null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  // Initialize and verify authentication state on mount/refresh
  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('ledgerline_token');
      if (!storedToken) {
        setUser(null);
        setToken(null);
        setIsLoading(false);
        return;
      }

      try {
        const data = await authService.getCurrentUser();
        if (data?.user && data.user.isActive) {
          setUser(data.user);
          setToken(storedToken);
          localStorage.setItem('ledgerline_user', JSON.stringify(data.user));
        } else {
          logout();
          if (data?.user && !data.user.isActive) {
            setAuthError('Your user account has been deactivated. Please contact an administrator.');
          }
        }
      } catch (err) {
        // Token expired, malformed, or user deactivated
        logout();
        if (err.response?.status === 403) {
          setAuthError('Your user account has been deactivated. Please contact an administrator.');
        } else if (err.response?.status === 401) {
          setAuthError('Your authentication session has expired. Please log in again.');
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
  }, []);

  // Listen for session expiration events dispatched by Axios interceptors
  useEffect(() => {
    const handleSessionExpired = (event) => {
      logout();
      if (event?.detail?.reason === 'deactivated') {
        setAuthError('Your user account has been deactivated. Please contact an administrator.');
      } else if (event?.detail?.reason === 'unauthorized') {
        setAuthError('Your authentication session has expired. Please log in again.');
      }
    };

    const handleStorageChange = (event) => {
      if (event.key === 'ledgerline_token' && !event.newValue) {
        setUser(null);
        setToken(null);
      }
    };

    window.addEventListener('ledgerline:session_expired', handleSessionExpired);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('ledgerline:session_expired', handleSessionExpired);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  const login = async (email, password) => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const data = await authService.login(email, password);
      if (data?.token && data?.user) {
        localStorage.setItem('ledgerline_token', data.token);
        localStorage.setItem('ledgerline_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
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
        localStorage.setItem('ledgerline_token', data.token);
        localStorage.setItem('ledgerline_user', JSON.stringify(data.user));
        setToken(data.token);
        setUser(data.user);
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

  const logout = () => {
    localStorage.removeItem('ledgerline_token');
    localStorage.removeItem('ledgerline_user');
    setToken(null);
    setUser(null);
    setAuthError(null);
  };

  const refreshUser = async () => {
    try {
      const data = await authService.getCurrentUser();
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem('ledgerline_user', JSON.stringify(data.user));
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
