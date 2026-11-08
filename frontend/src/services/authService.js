import api, { setAccessToken } from './api.js';
import { normalizeAuthUser } from '../utils/roleHelpers.js';

export const authService = {
  /**
   * Authenticate user with credentials
   * Returns { user, token }
   */
  async login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    const payload = response.data?.data || response.data;
    if (payload?.token) {
      setAccessToken(payload.token);
    }
    return {
      user: normalizeAuthUser(payload.user || payload),
      token: payload.token,
    };
  },

  /**
   * Register a new ACCOUNT_HOLDER
   * Strictly submits { fullName, email, password } matching backend schema
   */
  async register(nameOrFullName, email, password) {
    const fullName = typeof nameOrFullName === 'object' && nameOrFullName !== null
      ? (nameOrFullName.fullName || nameOrFullName.name)
      : nameOrFullName;

    const userEmail = typeof nameOrFullName === 'object' && nameOrFullName !== null
      ? nameOrFullName.email
      : email;

    const userPassword = typeof nameOrFullName === 'object' && nameOrFullName !== null
      ? nameOrFullName.password
      : password;

    const response = await api.post('/auth/register', {
      fullName,
      email: userEmail,
      password: userPassword,
    });

    const payload = response.data?.data || response.data;
    if (payload?.token) {
      setAccessToken(payload.token);
    }
    return {
      user: normalizeAuthUser(payload.user || payload),
      token: payload.token,
    };
  },

  /**
   * Restore/refresh session via HttpOnly cookie
   * Returns { user, token }
   */
  async refreshToken() {
    const response = await api.post('/auth/refresh');
    const payload = response.data?.data || response.data;
    if (payload?.token) {
      setAccessToken(payload.token);
    }
    return {
      user: normalizeAuthUser(payload.user || payload),
      token: payload.token,
    };
  },

  /**
   * Terminate active session and clear server-side refresh token & cookie
   */
  async logout() {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // In case network or token already invalid, continue cleaning client state
      console.warn('Backend logout encountered error:', err);
    } finally {
      setAccessToken(null);
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
