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
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(() => localStorage.getItem('ledgerline_token') || null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('ledgerline_token');
      if (!storedToken) {
        setIsLoading(false);
        return;
      }

      try {
        const data = await authService.getCurrentUser();
        if (data?.user) {
          setUser(data.user);
          localStorage.setItem('ledgerline_user', JSON.stringify(data.user));
        } else {
          logout();
        }
      } catch (err) {
        // Token expired or invalid
        logout();
      } finally {
        setIsLoading(false);
      }
    };

    initializeAuth();
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
