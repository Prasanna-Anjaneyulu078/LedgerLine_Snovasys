import axios from 'axios';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api/v1';

// In-memory access token storage (short-lived access token, never in localStorage/cookies)
let inMemoryAccessToken = null;

export const setAccessToken = (token) => {
  inMemoryAccessToken = token || null;
};

export const getAccessToken = () => inMemoryAccessToken;

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // Secure cross-origin/same-site cookie transport
  timeout: 15000,
});

// Interceptor to inject in-memory bearer access token
api.interceptors.request.use(
  (config) => {
    if (inMemoryAccessToken) {
      config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Concurrency control for token refreshing
let isRefreshing = false;
let refreshSubscribers = [];

function subscribeTokenRefresh(callback) {
  refreshSubscribers.push(callback);
}

function onRefreshed(error, newToken) {
  refreshSubscribers.forEach((callback) => callback(error, newToken));
  refreshSubscribers = [];
}

// Interceptor to handle responses, centralized token refresh, and session expiration
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!error.response) {
      return Promise.reject(error);
    }

    const { status, data } = error.response;
    const isAuthEndpoint =
      originalRequest?.url?.includes('/auth/login') ||
      originalRequest?.url?.includes('/auth/register') ||
      originalRequest?.url?.includes('/auth/refresh') ||
      originalRequest?.url?.includes('/auth/logout');

    // 401 Unauthorized handling: attempt silent token refresh via HttpOnly cookie
    if (status === 401 && !isAuthEndpoint && !originalRequest?._retry) {
      originalRequest._retry = true;

      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((refreshErr, newToken) => {
            if (refreshErr) {
              return reject(refreshErr);
            }
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalRequest));
          });
        });
      }

      isRefreshing = true;

      try {
        // Direct call to refresh endpoint using credentials (HttpOnly cookie)
        const refreshResponse = await axios.post(
          `${API_BASE_URL}/auth/refresh`,
          {},
          { withCredentials: true, timeout: 10000 }
        );

        const newPayload = refreshResponse.data?.data || refreshResponse.data;
        const newAccessToken = newPayload?.token;

        if (!newAccessToken) {
          throw new Error('Refresh endpoint did not return a valid access token');
        }

        setAccessToken(newAccessToken);
        onRefreshed(null, newAccessToken);

        // Notify AuthContext of session renewal
        window.dispatchEvent(
          new CustomEvent('ledgerline:token_refreshed', {
            detail: { token: newAccessToken, user: newPayload?.user },
          })
        );

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        setAccessToken(null);
        onRefreshed(refreshErr, null);

        window.dispatchEvent(
          new CustomEvent('ledgerline:session_expired', {
            detail: {
              reason: 'unauthorized',
              message: 'Your authentication session has expired. Please log in again.',
            },
          })
        );
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // 403 Forbidden handling - specifically for deactivated/suspended accounts
    if (status === 403) {
      const msg = String(data?.message || '').toLowerCase();
      if (msg.includes('deactivated') || msg.includes('suspended')) {
        setAccessToken(null);
        window.dispatchEvent(
          new CustomEvent('ledgerline:session_expired', {
            detail: {
              reason: 'deactivated',
              message: data?.message || 'Your user account is deactivated.',
            },
          })
        );
      }
    }

    return Promise.reject(error);
  }
);

/**
 * Extracts and sanitizes human-readable error messages across all HTTP status codes:
 * - 400 Validation errors
 * - 401 Unauthorized
 * - 403 Forbidden
 * - 404 Not Found
 * - 409 Conflict
 * - 429 Rate Limiting
 * - 500 Server Errors
 * - Network Failures
 */
export function getErrorMessage(error) {
  // Network failures / connection refused
  if (error?.code === 'ERR_NETWORK' || !error?.response) {
    return 'Network connection failure: Unable to reach the LedgerLine backend server. Please verify your connection.';
  }

  const { status, data } = error.response;

  // 1. Zod / Application structured validation errors array
  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    return data.errors.map((e) => e.message || `${e.field}: ${e.rule}`).join('; ');
  }

  // 2. Specific status code messages
  if (status === 429) {
    return 'Rate limit exceeded: Too many requests. Please wait a few moments before retrying.';
  }

  if (status === 409) {
    return data?.message || 'Operation conflict detected: An identical request is processing or resource already exists.';
  }

  if (status === 403) {
    return data?.message || 'Access forbidden: You do not have permission to execute this operation.';
  }

  if (status === 401) {
    return data?.message || 'Authentication required: Invalid or expired session credentials.';
  }

  if (status === 404) {
    return data?.message || 'Requested financial record or account was not found.';
  }

  if (status >= 500) {
    return 'An internal ledger processing error occurred. The operation was safely aborted.';
  }

  if (data?.message) {
    return data.message;
  }

  if (data?.error) {
    return typeof data.error === 'string' ? data.error : JSON.stringify(data.error);
  }

  if (error?.message) {
    return error.message;
  }

  return 'An unexpected error occurred while communicating with the ledger.';
}

export function generateIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export default api;
