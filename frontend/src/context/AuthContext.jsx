import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import authService from '../services/authService.js';
import {
  getErrorMessage,
  setAccessToken,
  classifyAuthError,
  getAuthEpoch,
  subscribeToAuthEvents,
} from '../services/api.js';
import { normalizeAuthUser } from '../utils/roleHelpers.js';

export const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Executes startup session restoration guarded by the initiating auth epoch so a newer
 * login, logout, or cross-tab transition invalidates any stale refresh or /auth/me result.
 */
export async function executeAuthInitialization({
  isMounted = () => true,
  setUser,
  setToken,
  setIsLoading,
  setAuthError,
  authServiceImpl = authService,
}) {
  const initEpoch = getAuthEpoch();
  let expectedEpoch = initEpoch;
  const isCurrentInit = () => isMounted() && expectedEpoch === getAuthEpoch();
  const isCurrentOrSelfInvalidated = (err) =>
    isMounted() &&
    (expectedEpoch === getAuthEpoch() ||
      (typeof err?._invalidatedEpoch === 'number' &&
        err._invalidatedEpoch === getAuthEpoch()));

  if (!isCurrentInit()) {
    return;
  }

  setIsLoading(true);
  try {
    // Attempt to restore persistent session using HttpOnly cookie (coordinated)
    const data = await authServiceImpl.refreshToken();

    // StrictMode / unmount / epoch transition protection
    if (!isCurrentInit()) return;

    if (data?.token) {
      setAccessToken(data.token);
      setToken(data.token);

      // Authoritative profile & role synchronization via /auth/me
      try {
        const meData = await authServiceImpl.getCurrentUser();
        if (!isCurrentInit()) return;
        const rawUser = meData?.user || meData || data.user;
        const normalized = normalizeAuthUser(rawUser);
        if (normalized && normalized.isActive === false) {
          setUser(null);
          setToken(null);
          setAccessToken(null);
          setAuthError('Your user account has been deactivated. Please contact an administrator.');
          return;
        }
        setUser(normalized);
      } catch (meErr) {
        if (!isCurrentOrSelfInvalidated(meErr)) return;
        if (typeof meErr?._invalidatedEpoch === 'number') {
          expectedEpoch = meErr._invalidatedEpoch;
        }

        const classifiedMe = classifyAuthError(meErr);
        if (classifiedMe.type === 'ACCOUNT_DEACTIVATED') {
          setUser(null);
          setToken(null);
          setAccessToken(null);
          setAuthError('Your user account has been deactivated. Please contact an administrator.');
          return;
        }
        if (classifiedMe.isSessionInvalid) {
          setUser(null);
          setToken(null);
          setAccessToken(null);
          setAuthError('Your authentication session has expired. Please log in again.');
          return;
        }
        // For transient network or non-auth errors fetching accounts, fallback to verified user from refresh
        if (data.user) {
          setUser(normalizeAuthUser(data.user));
        }
      }
    } else {
      setUser(null);
      setToken(null);
      setAccessToken(null);
      if (data?.user && !data.user.isActive) {
        setAuthError('Your user account has been deactivated. Please contact an administrator.');
      }
    }
  } catch (err) {
    if (!isCurrentOrSelfInvalidated(err)) return;
    if (typeof err?._invalidatedEpoch === 'number') {
      expectedEpoch = err._invalidatedEpoch;
    }

    const classified = classifyAuthError(err);

    if (classified.isSessionInvalid) {
      setUser(null);
      setToken(null);
      setAccessToken(null);
      if (classified.type === 'ACCOUNT_DEACTIVATED') {
        setAuthError('Your user account has been deactivated. Please contact an administrator.');
      } else if (classified.type === 'TOKEN_REUSE') {
        setAuthError('Security violation: Session token reuse detected. Please log in again.');
      }
    } else if (
      classified.type === 'NETWORK_ERROR' ||
      classified.type === 'SERVER_ERROR' ||
      classified.type === 'LOCK_COORDINATION_ERROR'
    ) {
      // Temporary network, server, or lock coordination error: do not declare persistent session dead
      setUser(null);
      setToken(null);
      setAuthError(classified.message);
    }
  } finally {
    if (isCurrentInit()) {
      setIsLoading(false);
    }
    // Clean up any stale legacy tokens from localStorage to maintain strict cookie security
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('ledgerline_token');
      localStorage.removeItem('ledgerline_user');
    }
  }
}

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const explicitlyLoggedOutRef = useRef(false);
  const lastAuthMutationEpochRef = useRef(null);

  // Initialize and verify authentication state on mount/reopen using persistent HttpOnly cookie & /auth/me
  // Fully compatible with React 19 StrictMode: concurrent or duplicate effect cycles join the single shared in-flight refresh request
  useEffect(() => {
    let isMounted = true;
    explicitlyLoggedOutRef.current = false;

    const initializeAuth = () =>
      executeAuthInitialization({
        isMounted: () => isMounted,
        setUser,
        setToken,
        setIsLoading,
        setAuthError,
      });

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  // Listen for validated session events dispatched by Axios interceptors and the centralized BroadcastChannel handler
  useEffect(() => {
    const handleTokenRefreshed = (event) => {
      if (explicitlyLoggedOutRef.current) {
        return;
      }
      if (event?.detail?.token && event?.detail?.user) {
        setToken(event.detail.token);
        setUser(normalizeAuthUser(event.detail.user));
        setAccessToken(event.detail.token);
      }
    };

    const handleSessionExpired = (event) => {
      const eventEpoch = event?.detail?.epoch;
      if (typeof eventEpoch === 'number') {
        if (eventEpoch !== getAuthEpoch()) {
          return;
        }
      } else if (
        lastAuthMutationEpochRef.current !== null &&
        lastAuthMutationEpochRef.current === getAuthEpoch()
      ) {
        return;
      }

      setUser(null);
      setToken(null);
      setAccessToken(null);
      if (event?.detail?.errorType === 'TOKEN_MISSING_OR_INVALID') {
        return;
      }
      explicitlyLoggedOutRef.current = true;
      if (event?.detail?.reason === 'deactivated') {
        setAuthError('Your user account has been deactivated. Please contact an administrator.');
      } else if (event?.detail?.reason === 'unauthorized') {
        setAuthError(event?.detail?.message || 'Your authentication session has expired. Please log in again.');
      }
      setIsLoading(false);
    };

    window.addEventListener('ledgerline:token_refreshed', handleTokenRefreshed);
    window.addEventListener('ledgerline:session_expired', handleSessionExpired);

    const unsubscribeAuthEvents = subscribeToAuthEvents(({ type, payload }) => {
      if (type === 'LOGOUT') {
        explicitlyLoggedOutRef.current = true;
        setUser(null);
        setToken(null);
        setAccessToken(null);
        setAuthError(null);
        setIsLoading(false);
      } else if (type === 'LOGIN') {
        explicitlyLoggedOutRef.current = false;
        if (payload?.user) {
          setUser(normalizeAuthUser(payload.user));
        }
        if (payload?.token) {
          setToken(payload.token);
          setAccessToken(payload.token);
        }
        setAuthError(null);
        setIsLoading(false);
      } else if (type === 'SESSION_EXPIRED') {
        setUser(null);
        setToken(null);
        setAccessToken(null);
        if (payload?.errorType === 'TOKEN_MISSING_OR_INVALID') {
          return;
        }
        explicitlyLoggedOutRef.current = true;
        if (payload?.reason === 'deactivated') {
          setAuthError('Your user account has been deactivated. Please contact an administrator.');
        } else {
          setAuthError(payload?.message || 'Your authentication session has expired. Please log in again.');
        }
        setIsLoading(false);
      } else if (type === 'TOKEN_REFRESHED') {
        if (explicitlyLoggedOutRef.current) {
          return;
        }
        if (payload?.token) {
          setToken(payload.token);
          setAccessToken(payload.token);
        }
        if (payload?.user) {
          setUser(normalizeAuthUser(payload.user));
        }
      }
    });

    return () => {
      window.removeEventListener('ledgerline:token_refreshed', handleTokenRefreshed);
      window.removeEventListener('ledgerline:session_expired', handleSessionExpired);
      unsubscribeAuthEvents();
    };
  }, []);

  const runAuthMutation = async (
    operation,
    { abortedMessage, supersededMessage, invalidMessage }
  ) => {
    explicitlyLoggedOutRef.current = false;
    setIsLoading(true);
    setAuthError(null);
    let opEpoch = getAuthEpoch();

    const isCurrentOrSelfInvalidated = (err) =>
      opEpoch === getAuthEpoch() ||
      (typeof err?._invalidatedEpoch === 'number' && err._invalidatedEpoch === getAuthEpoch());

    try {
      const pendingOperation = operation();
      opEpoch = getAuthEpoch();
      lastAuthMutationEpochRef.current = opEpoch;
      const data = await pendingOperation;

      if (explicitlyLoggedOutRef.current) {
        return { success: false, error: abortedMessage };
      }
      if (opEpoch !== getAuthEpoch()) {
        return { success: false, error: supersededMessage };
      }
      if (data?.token && data?.user) {
        const normalized = normalizeAuthUser(data.user);
        setToken(data.token);
        setUser(normalized);
        setAccessToken(data.token);
        return { success: true, user: normalized };
      }
      throw new Error(invalidMessage);
    } catch (err) {
      const msg = getErrorMessage(err);
      if (isCurrentOrSelfInvalidated(err)) {
        if (typeof err?._invalidatedEpoch === 'number') {
          opEpoch = err._invalidatedEpoch;
        }
        setAuthError(msg);
      }
      return { success: false, error: msg };
    } finally {
      if (opEpoch === getAuthEpoch()) {
        setIsLoading(false);
      }
    }
  };

  const login = (email, password) =>
    runAuthMutation(() => authService.login(email, password), {
      abortedMessage: 'Login aborted due to logout.',
      supersededMessage: 'Login aborted due to a newer authentication transition.',
      invalidMessage: 'Invalid authentication response.',
    });

  const register = (name, email, password, confirmPassword) =>
    runAuthMutation(() => authService.register(name, email, password, confirmPassword), {
      abortedMessage: 'Registration aborted due to logout.',
      supersededMessage: 'Registration aborted due to a newer authentication transition.',
      invalidMessage: 'Invalid registration response.',
    });

  const logout = async () => {
    explicitlyLoggedOutRef.current = true;
    let logoutEpoch = getAuthEpoch();
    try {
      const pendingLogout = authService.logout();
      logoutEpoch = getAuthEpoch();
      await pendingLogout;
    } catch (err) {
      console.warn('Logout request failed:', err);
    } finally {
      if (logoutEpoch === getAuthEpoch()) {
        setToken(null);
        setUser(null);
        setAccessToken(null);
        setAuthError(null);
        setIsLoading(false);
        if (typeof localStorage !== 'undefined') {
          localStorage.removeItem('ledgerline_token');
          localStorage.removeItem('ledgerline_user');
        }
      }
    }
  };

  const refreshUser = async () => {
    const refreshEpoch = getAuthEpoch();
    try {
      const data = await authService.getCurrentUser();
      if (refreshEpoch !== getAuthEpoch()) {
        return;
      }
      const rawUser = data?.user || data;
      if (rawUser) {
        setUser(normalizeAuthUser(rawUser));
      }
    } catch (err) {
      if (refreshEpoch !== getAuthEpoch()) {
        return;
      }
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
