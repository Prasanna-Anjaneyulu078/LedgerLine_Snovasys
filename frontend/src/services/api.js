import axios from 'axios';

const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) || '/api/v1';

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// Interceptor to inject bearer token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('ledgerline_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle responses and session expiration
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const { status, data, config } = error.response;
      const isAuthEndpoint = config?.url?.includes('/auth/login') || config?.url?.includes('/auth/register');

      // 401 Unauthorized handling (token expired, revoked, or invalid)
      if (status === 401 && !isAuthEndpoint) {
        const requestToken = config?.headers?.Authorization?.replace(/^Bearer\s+/i, '');
        const currentToken = localStorage.getItem('ledgerline_token');

        // Only clear session if the failed request actually used the currently stored token.
        // This prevents accidental removal of a newly established session due to a stale in-flight request.
        if (!requestToken || requestToken === currentToken) {
          localStorage.removeItem('ledgerline_token');
          localStorage.removeItem('ledgerline_user');
          window.dispatchEvent(
            new CustomEvent('ledgerline:session_expired', {
              detail: { reason: 'unauthorized', message: data?.message || 'Authentication session has expired.' },
            })
          );
        }
      }

      // 403 Forbidden handling - specifically for deactivated/suspended accounts
      if (status === 403) {
        const msg = String(data?.message || '').toLowerCase();
        if (msg.includes('deactivated') || msg.includes('suspended')) {
          const requestToken = config?.headers?.Authorization?.replace(/^Bearer\s+/i, '');
          const currentToken = localStorage.getItem('ledgerline_token');
          if (!requestToken || requestToken === currentToken) {
            localStorage.removeItem('ledgerline_token');
            localStorage.removeItem('ledgerline_user');
            window.dispatchEvent(
              new CustomEvent('ledgerline:session_expired', {
                detail: { reason: 'deactivated', message: data?.message || 'User account is deactivated.' },
              })
            );
          }
        }
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
  return `IDEM-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default api;
