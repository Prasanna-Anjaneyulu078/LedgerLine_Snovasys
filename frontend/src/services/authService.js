import api, {
  setAccessToken,
  requestTokenRefresh,
  broadcastAuthEvent,
  getAuthEpoch,
  serializeWithAuthLock,
  beginLoginTransition,
  beginLogoutTransition,
  endLogoutTransition,
} from './api.js';
import { normalizeAuthUser } from '../utils/roleHelpers.js';

export const authService = {
  /**
   * Authenticate user with credentials
   * Returns { user, token }
   */
  async login(email, password) {
    const loginEpoch = beginLoginTransition();
    return serializeWithAuthLock(async () => {
      if (loginEpoch !== getAuthEpoch()) {
        return null;
      }
      const response = await api.post('/auth/login', { email, password });
      if (loginEpoch !== getAuthEpoch()) {
        return null;
      }
      const payload = response.data?.data || response.data;
      if (payload?.token) {
        setAccessToken(payload.token);
      }
      broadcastAuthEvent('LOGIN', { user: payload?.user, token: payload?.token });
      return {
        user: normalizeAuthUser(payload.user || payload),
        token: payload.token,
      };
    });
  },

  /**
   * Register a new ACCOUNT_HOLDER
   * Strictly submits { fullName, email, password } matching backend schema
   */
  async register(nameOrFullName, email, password) {
    const registerEpoch = beginLoginTransition();
    const fullName = typeof nameOrFullName === 'object' && nameOrFullName !== null
      ? (nameOrFullName.fullName || nameOrFullName.name)
      : nameOrFullName;

    const userEmail = typeof nameOrFullName === 'object' && nameOrFullName !== null
      ? nameOrFullName.email
      : email;

    const userPassword = typeof nameOrFullName === 'object' && nameOrFullName !== null
      ? nameOrFullName.password
      : password;

    return serializeWithAuthLock(async () => {
      if (registerEpoch !== getAuthEpoch()) {
        return null;
      }
      const response = await api.post('/auth/register', {
        fullName,
        email: userEmail,
        password: userPassword,
      });
      if (registerEpoch !== getAuthEpoch()) {
        return null;
      }

      const payload = response.data?.data || response.data;
      if (payload?.token) {
        setAccessToken(payload.token);
      }
      broadcastAuthEvent('LOGIN', { user: payload?.user, token: payload?.token });
      return {
        user: normalizeAuthUser(payload.user || payload),
        token: payload.token,
      };
    });
  },

  /**
   * Restore/refresh session via HttpOnly cookie using centralized coordination
   * Returns { user, token } or null if discarded due to state transition
   */
  async refreshToken() {
    const result = await requestTokenRefresh();
    if (!result?.token) {
      return null;
    }
    return {
      user: result.user ? normalizeAuthUser(result.user) : null,
      token: result.token,
    };
  },

  /**
   * Terminate active session and clear server-side refresh token & cookie
   * Coordinates with in-flight refresh and Web Locks to serialize behind any in-flight refresh and prevent revived sessions.
   */
  async logout() {
    const logoutEpoch = beginLogoutTransition();

    try {
      await serializeWithAuthLock(async () => {
        if (logoutEpoch !== getAuthEpoch()) {
          return;
        }
        try {
          await api.post('/auth/logout');
        } catch (err) {
          // In case network or token already invalid, continue cleaning client state
          console.warn('Backend logout encountered error:', err);
        } finally {
          if (logoutEpoch === getAuthEpoch()) {
            setAccessToken(null);
          }
        }
      });
    } finally {
      if (logoutEpoch === getAuthEpoch()) {
        setAccessToken(null);
      }
      endLogoutTransition();
    }

    return true;
  },

  /**
   * Retrieve current authenticated user profile and associated accounts
   */
  async getCurrentUser() {
    const response = await api.get('/auth/me');
    const payload = response.data?.data || response.data;

    const userData = payload.user || payload;
    return {
      user: normalizeAuthUser(userData),
      accounts: payload.accounts || userData.accounts || [],
    };
  },
};

export default authService;
