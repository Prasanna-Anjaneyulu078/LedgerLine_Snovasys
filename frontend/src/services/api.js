import axios from 'axios';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE_URL) ||
  (typeof window === 'undefined' ? 'https://ledgerline-jt4s.onrender.com/api/v1' : '/api/v1');

// In-memory access token storage (short-lived access token, never in localStorage/cookies)
let inMemoryAccessToken = null;

// Auth epoch / sequence tracking to prevent stale in-flight refresh responses from overwriting newer state
let authEpoch = 0;
let activeLogoutCount = 0;
let explicitlyLoggedOut = false;
let crossTabRefreshCounter = 0;

// Cross-tab sender identity & causal transition metadata (never compared as tab-local authEpoch across tabs)
const AUTH_CAUSAL_CLOCK_KEY = 'ledgerline_auth_causal_clock';
const MAX_TRACKED_EVENT_IDS = 200;

function createUniqueIdentifier() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ll-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const LOCAL_TAB_ID = createUniqueIdentifier();
let outgoingEventSeq = 0;
let causalClock = 0;
let lastLocalAuthSharedClock = null;
let lastAcceptedSharedClock = null;
let lastLocalAuthIssuedAt = 0;
const seenEventIdsQueue = [];
const seenEventIdsSet = new Set();
const lastSeqBySender = new Map();
const authEventListeners = new Set();

export const getAuthTabId = () => LOCAL_TAB_ID;

export const getAuthEpoch = () => authEpoch;

export const bumpAuthEpoch = () => {
  authEpoch += 1;
  return authEpoch;
};

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

// Dedicated un-intercepted client for refresh requests to guarantee no recursive interceptor loops
export const rawAuthClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 20000,
});

// Interceptor to inject in-memory bearer access token and bind auth epoch to original requests
api.interceptors.request.use(
  (config) => {
    if (!config._retry) {
      config._authEpoch = authEpoch;
    } else if (typeof config._authEpoch === 'number' && config._authEpoch !== authEpoch) {
      const staleError = new Error('Authentication session changed before request retry.');
      staleError.code = 'STALE_AUTH_EPOCH';
      return Promise.reject(staleError);
    }

    if (inMemoryAccessToken) {
      if (config.headers) {
        if (typeof config.headers.set === 'function') {
          config.headers.set('Authorization', `Bearer ${inMemoryAccessToken}`);
        } else {
          config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
        }
      } else {
        config.headers = { Authorization: `Bearer ${inMemoryAccessToken}` };
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

function isAccountDeactivatedResponse(data) {
  const code = typeof data?.code === 'string' ? data.code.toUpperCase() : '';
  if (code === 'ACCOUNT_DEACTIVATED' || code === 'ACCOUNT_SUSPENDED') {
    return true;
  }
  const text = [data?.message, data?.error]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return text.includes('deactivated') || text.includes('suspended');
}

/**
 * Classifies authentication and network errors into distinct diagnostic categories:
 * - NETWORK_ERROR: Temporary connection refused, DNS, timeout (not session invalidation)
 * - SERVER_ERROR: 5xx internal server errors (not session invalidation)
 * - ACCOUNT_DEACTIVATED: 403 Forbidden with account suspended/deactivated
 * - FORBIDDEN: 403 Forbidden due to insufficient permissions (not session invalidation)
 * - TOKEN_REUSE: 401 Unauthorized indicating session breach / token reuse detected
 * - TOKEN_EXPIRED: 401 Unauthorized indicating refresh token expired
 * - TOKEN_REVOKED: 401 Unauthorized indicating token revoked
 * - TOKEN_MISSING_OR_INVALID: 401 Unauthorized missing or unrecognized token
 * - UNAUTHORIZED: Generic 401 Unauthorized
 */
export function classifyAuthError(error) {
  if (error?.code === 'WEB_LOCK_ACQUISITION_FAILED') {
    return {
      type: 'LOCK_COORDINATION_ERROR',
      isSessionInvalid: false,
      message:
        error?.message ||
        'Unable to coordinate authentication session across browser tabs. Please retry.',
    };
  }

  if (
    error?.code === 'ERR_NETWORK' ||
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    error?.message === 'Network Error' ||
    (!error?.response && error?.request)
  ) {
    return {
      type: 'NETWORK_ERROR',
      isSessionInvalid: false,
      message: 'Network connection failure: Unable to reach the LedgerLine backend server. Please verify your connection.',
    };
  }

  const status = error?.response?.status;
  const data = error?.response?.data;
  const message = typeof data?.message === 'string' ? data.message : '';

  if (status === 403) {
    if (isAccountDeactivatedResponse(data)) {
      return {
        type: 'ACCOUNT_DEACTIVATED',
        isSessionInvalid: true,
        message: message || 'Your user account has been deactivated. Please contact an administrator.',
      };
    }

    return {
      type: 'FORBIDDEN',
      isSessionInvalid: false,
      message: message || 'Access forbidden: You do not have permission to execute this operation.',
    };
  }

  if (status === 401) {
    const lower = message.toLowerCase();
    let type = 'UNAUTHORIZED';
    if (lower.includes('reuse')) {
      type = 'TOKEN_REUSE';
    } else if (lower.includes('expired')) {
      type = 'TOKEN_EXPIRED';
    } else if (lower.includes('revoked')) {
      type = 'TOKEN_REVOKED';
    } else if (lower.includes('required') || lower.includes('unrecognised') || lower.includes('unrecognized')) {
      type = 'TOKEN_MISSING_OR_INVALID';
    }
    return {
      type,
      isSessionInvalid: true,
      message: message || 'Your authentication session has expired. Please log in again.',
    };
  }

  if (status >= 500) {
    return {
      type: 'SERVER_ERROR',
      isSessionInvalid: false,
      message: 'An internal ledger processing error occurred. The operation was safely aborted.',
    };
  }

  return {
    type: 'UNKNOWN',
    isSessionInvalid: false,
    message: message || error?.message || 'An unexpected authentication error occurred.',
  };
}

// Multi-tab cross-tab broadcast coordination via single BroadcastChannel processor
let authBroadcastChannel = null;
let lastRefreshedUser = null;

export const getLastRefreshedUser = () => lastRefreshedUser;

function readSharedClockValue() {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = localStorage.getItem(AUTH_CAUSAL_CLOCK_KEY);
    if (raw === null || raw === '') {
      return 0;
    }
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return null;
  }
}

function advanceCausalTransition({ updateLocalWatermark = false } = {}) {
  const issuedAt = Date.now();
  const shared = readSharedClockValue();
  let clockScope = 'tab';

  if (shared !== null) {
    causalClock = Math.max(causalClock, shared) + 1;
    clockScope = 'shared';
    try {
      localStorage.setItem(AUTH_CAUSAL_CLOCK_KEY, String(causalClock));
    } catch {
      clockScope = 'tab';
    }
  } else {
    causalClock += 1;
  }

  if (updateLocalWatermark) {
    lastLocalAuthIssuedAt = Math.max(lastLocalAuthIssuedAt, issuedAt);
    if (clockScope === 'shared') {
      lastLocalAuthSharedClock = Math.max(lastLocalAuthSharedClock ?? 0, causalClock);
    }
  }

  return {
    causalClock,
    clockScope,
    issuedAt,
  };
}

function trackSeenEventId(eventId) {
  if (!eventId || seenEventIdsSet.has(eventId)) {
    return;
  }
  seenEventIdsSet.add(eventId);
  seenEventIdsQueue.push(eventId);
  if (seenEventIdsQueue.length > MAX_TRACKED_EVENT_IDS) {
    const oldest = seenEventIdsQueue.shift();
    if (oldest) {
      seenEventIdsSet.delete(oldest);
    }
  }
}

function notifyAuthEventListeners(eventData) {
  for (const listener of Array.from(authEventListeners)) {
    try {
      listener(eventData);
    } catch {
      // Isolate listener failures from auth coordination pipeline
    }
  }
}

export const subscribeToAuthEvents = (listener) => {
  if (typeof listener !== 'function') {
    return () => {};
  }
  authEventListeners.add(listener);
  return () => {
    authEventListeners.delete(listener);
  };
};

function processIncomingBroadcastMessage(rawData) {
  const { type, payload, meta } = rawData || {};
  if (!type || typeof type !== 'string') {
    return false;
  }

  const senderId = typeof meta?.senderId === 'string' && meta.senderId ? meta.senderId : null;
  const eventId = typeof meta?.eventId === 'string' && meta.eventId ? meta.eventId : null;
  const senderSeq =
    typeof meta?.senderSeq === 'number' && Number.isFinite(meta.senderSeq) ? meta.senderSeq : null;
  const remoteClock =
    typeof meta?.causalClock === 'number' && Number.isFinite(meta.causalClock)
      ? meta.causalClock
      : null;
  const clockScope = meta?.clockScope === 'shared' ? 'shared' : 'tab';
  const issuedAt =
    typeof meta?.issuedAt === 'number' && Number.isFinite(meta.issuedAt) ? meta.issuedAt : null;

  // 1. Suppress same-tab echoes (including delayed same-tab broadcasts)
  if (senderId && senderId === LOCAL_TAB_ID) {
    return false;
  }

  // 2. Drop duplicate/replayed event IDs
  if (eventId && seenEventIdsSet.has(eventId)) {
    return false;
  }

  // 3. Enforce per-sender monotonic sequence ordering
  if (senderId && senderSeq !== null) {
    const prevSeq = lastSeqBySender.get(senderId) ?? 0;
    if (senderSeq <= prevSeq) {
      return false;
    }
  }

  // 4. Enforce global causal ordering without comparing tab-local authEpoch across tabs
  const localSharedNow = readSharedClockValue();
  const hasSharedWatermark =
    localSharedNow !== null &&
    (lastLocalAuthSharedClock !== null || lastAcceptedSharedClock !== null);

  if (clockScope === 'shared' && remoteClock !== null && hasSharedWatermark) {
    const sharedWatermark = Math.max(
      lastLocalAuthSharedClock ?? 0,
      lastAcceptedSharedClock ?? 0
    );
    if (remoteClock < sharedWatermark) {
      return false;
    }
    if (
      remoteClock === sharedWatermark &&
      issuedAt !== null &&
      lastLocalAuthIssuedAt > 0 &&
      issuedAt < lastLocalAuthIssuedAt
    ) {
      return false;
    }
  } else if (issuedAt !== null && lastLocalAuthIssuedAt > 0 && issuedAt < lastLocalAuthIssuedAt) {
    return false;
  }

  if (eventId) {
    trackSeenEventId(eventId);
  }
  if (senderId && senderSeq !== null) {
    lastSeqBySender.set(senderId, senderSeq);
  }
  if (clockScope === 'shared' && remoteClock !== null) {
    causalClock = Math.max(causalClock, remoteClock);
    lastAcceptedSharedClock = Math.max(lastAcceptedSharedClock ?? 0, remoteClock);
  }

  const normalizedPayload = payload || {};
  const eventMeta = meta || null;

  if (type === 'LOGOUT' || type === 'SESSION_EXPIRED') {
    explicitlyLoggedOut = true;
    const localEpoch = bumpAuthEpoch();
    setAccessToken(null);
    lastRefreshedUser = null;
    notifyAuthEventListeners({ type, payload: normalizedPayload, meta: eventMeta, localEpoch });
    return true;
  }

  if (type === 'LOGIN') {
    explicitlyLoggedOut = false;
    const localEpoch = bumpAuthEpoch();
    if (normalizedPayload.token) {
      setAccessToken(normalizedPayload.token);
    }
    if (normalizedPayload.user) {
      lastRefreshedUser = normalizedPayload.user;
    }
    notifyAuthEventListeners({ type, payload: normalizedPayload, meta: eventMeta, localEpoch });
    return true;
  }

  if (type === 'TOKEN_REFRESHED') {
    if (explicitlyLoggedOut) {
      return false;
    }
    crossTabRefreshCounter += 1;
    if (normalizedPayload.token) {
      setAccessToken(normalizedPayload.token);
    }
    if (normalizedPayload.user) {
      lastRefreshedUser = normalizedPayload.user;
    }
    notifyAuthEventListeners({
      type,
      payload: normalizedPayload,
      meta: eventMeta,
      localEpoch: getAuthEpoch(),
    });
    return true;
  }

  return false;
}

export const broadcastAuthEvent = (type, payload = {}) => {
  const updateLocalWatermark =
    type === 'LOGIN' || type === 'LOGOUT' || type === 'SESSION_EXPIRED';
  const { causalClock: nextClock, clockScope, issuedAt } = advanceCausalTransition({
    updateLocalWatermark,
  });
  outgoingEventSeq += 1;
  const senderSeq = outgoingEventSeq;
  const meta = {
    eventId: `${LOCAL_TAB_ID}:${senderSeq}:${createUniqueIdentifier()}`,
    senderId: LOCAL_TAB_ID,
    senderSeq,
    causalClock: nextClock,
    clockScope,
    issuedAt,
    epoch: authEpoch,
  };

  if (authBroadcastChannel) {
    try {
      authBroadcastChannel.postMessage({ type, payload, meta });
    } catch {
      // Ignore broadcast errors
    }
  }

  return meta;
};

export const initAuthBroadcastChannel = () => {
  seenEventIdsQueue.length = 0;
  seenEventIdsSet.clear();
  lastSeqBySender.clear();
  lastLocalAuthSharedClock = null;
  lastAcceptedSharedClock = null;
  lastLocalAuthIssuedAt = 0;

  if (typeof window !== 'undefined' && typeof window.BroadcastChannel !== 'undefined') {
    try {
      if (
        authBroadcastChannel &&
        typeof window.BroadcastChannel === 'function' &&
        !(authBroadcastChannel instanceof window.BroadcastChannel)
      ) {
        try {
          authBroadcastChannel.close();
        } catch {
          // Ignore close errors on stale channel instances
        }
        authBroadcastChannel = null;
      }
      if (!authBroadcastChannel) {
        authBroadcastChannel = new BroadcastChannel('ledgerline_auth_channel');
      }
      authBroadcastChannel.onmessage = (event) => {
        processIncomingBroadcastMessage(event?.data);
      };
    } catch {
      authBroadcastChannel = null;
    }
  } else {
    if (authBroadcastChannel) {
      try {
        authBroadcastChannel.close();
      } catch {
        // Ignore close errors
      }
    }
    authBroadcastChannel = null;
  }
};

initAuthBroadcastChannel();

// Centralized in-flight refresh promise coordination
let inFlightRefreshPromise = null;

function buildLockAcquisitionError(lockErr) {
  const coordError = new Error(
    lockErr?.message || 'Unable to acquire cross-tab authentication lock.'
  );
  coordError.code = 'WEB_LOCK_ACQUISITION_FAILED';
  coordError.cause = lockErr;
  return coordError;
}

async function runWithWebLockIfAvailable(fn) {
  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    let enteredLock = false;
    try {
      return await navigator.locks.request('ledgerline_refresh_lock', async () => {
        enteredLock = true;
        return await fn();
      });
    } catch (err) {
      if (enteredLock) {
        throw err;
      }
      // Web Locks is available, but lock acquisition failed before entering callback:
      // never execute an uncoordinated auth operation outside the lock.
      console.warn('Web Locks acquisition failed; aborting uncoordinated auth operation:', err);
      throw buildLockAcquisitionError(err);
    }
  }

  return fn();
}

/**
 * Coordinates auth state transitions (login/register/logout) with any active refresh
 * and cross-tab Web Locks so mutations cannot race with refresh rotation.
 */
export async function serializeWithAuthLock(action) {
  while (inFlightRefreshPromise) {
    try {
      await inFlightRefreshPromise;
    } catch {
      // Ignore refresh failure when serializing auth transition
    }
  }

  return runWithWebLockIfAvailable(action);
}

export const beginLoginTransition = () => {
  explicitlyLoggedOut = false;
  advanceCausalTransition({ updateLocalWatermark: true });
  return bumpAuthEpoch();
};

export const beginLogoutTransition = () => {
  activeLogoutCount += 1;
  explicitlyLoggedOut = true;
  const logoutEpoch = bumpAuthEpoch();
  setAccessToken(null);
  lastRefreshedUser = null;
  broadcastAuthEvent('LOGOUT');
  return logoutEpoch;
};

export const endLogoutTransition = () => {
  activeLogoutCount = Math.max(0, activeLogoutCount - 1);
};

/**
 * Executes a single atomic token refresh request against backend /auth/refresh
 * Validates initiating auth epoch before request and after response to discard stale results.
 */
async function executeTokenRefresh(initiatingEpoch = authEpoch) {
  // Step 2: Check captured epoch and active logout state before sending the refresh request
  if (initiatingEpoch !== authEpoch || activeLogoutCount > 0) {
    return null;
  }

  try {
    const refreshResponse = await rawAuthClient.post('/auth/refresh', {});

    // Step 3: Check epoch and active logout state again after receiving the refresh response
    if (initiatingEpoch !== authEpoch || activeLogoutCount > 0) {
      return null;
    }

    const payload = refreshResponse.data?.data || refreshResponse.data;
    const newAccessToken = payload?.token;

    if (!newAccessToken) {
      throw new Error('Refresh endpoint did not return a valid access token');
    }

    explicitlyLoggedOut = false;
    setAccessToken(newAccessToken);
    const refreshedUser = payload?.user || null;
    lastRefreshedUser = refreshedUser;

    // Notify local context listeners of session renewal
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('ledgerline:token_refreshed', {
          detail: { token: newAccessToken, user: refreshedUser },
        })
      );
    }

    // Broadcast session renewal across other open browser tabs
    broadcastAuthEvent('TOKEN_REFRESHED', {
      token: newAccessToken,
      user: refreshedUser,
    });

    return {
      token: newAccessToken,
      user: refreshedUser,
    };
  } catch (refreshErr) {
    // If epoch changed while refresh was in-flight (e.g. logout), discard any error side-effects
    if (initiatingEpoch !== authEpoch || activeLogoutCount > 0) {
      return null;
    }

    const classified = classifyAuthError(refreshErr);

    // Only clear token and dispatch session expired for genuine session invalidation
    // Temporary network errors or 5xx server errors do NOT invalidate session credentials
    if (classified.isSessionInvalid) {
      setAccessToken(null);
      const invalidatedEpoch = bumpAuthEpoch();
      if (refreshErr && typeof refreshErr === 'object' && Object.isExtensible(refreshErr)) {
        refreshErr._invalidatedEpoch = invalidatedEpoch;
      }
      lastRefreshedUser = null;

      // Do not surface UI expiration banners or broadcast when unauthenticated (missing cookie)
      if (classified.type !== 'TOKEN_MISSING_OR_INVALID') {
        explicitlyLoggedOut = true;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ledgerline:session_expired', {
              detail: {
                reason: classified.type === 'ACCOUNT_DEACTIVATED' ? 'deactivated' : 'unauthorized',
                message: classified.message,
                errorType: classified.type,
                epoch: invalidatedEpoch,
              },
            })
          );
        }

        broadcastAuthEvent('SESSION_EXPIRED', {
          reason: classified.type === 'ACCOUNT_DEACTIVATED' ? 'deactivated' : 'unauthorized',
          message: classified.message,
          errorType: classified.type,
        });
      }
    }

    throw refreshErr;
  }
}

/**
 * Coordinated token refresh function ensuring only a single in-flight refresh request
 * can ever occur concurrently across application startup, concurrent API calls, and multiple tabs.
 *
 * Cross-tab coordination:
 * - Uses Web Locks API (`navigator.locks`) when available in modern browsers (Chrome 69+, Firefox 96+, Safari 15.4+).
 * - If Web Locks is available but lock acquisition itself fails, aborts without issuing an uncoordinated refresh.
 * - Fallback: Only when Web Locks API is unavailable (e.g. legacy browsers or non-browser environments),
 *   coordination falls back to tab-local in-memory promise deduplication and auth epoch tracking.
 */
export function requestTokenRefresh() {
  // Never start a new refresh while logout is actively tearing down the session
  if (activeLogoutCount > 0) {
    return Promise.resolve(null);
  }

  // If a refresh is already in-flight in this window/tab, reuse the exact same promise instance
  if (inFlightRefreshPromise) {
    return inFlightRefreshPromise;
  }

  // Step 1: Capture the initiating auth epoch and cross-tab sequence before waiting for Web Locks
  const initiatingEpoch = authEpoch;
  const tokenAtStart = inMemoryAccessToken;
  const refreshSeqAtStart = crossTabRefreshCounter;

  const runRefreshWithEpochChecks = async () => {
    // Step 2: Check captured epoch after acquiring the lock, before sending the refresh request
    if (initiatingEpoch !== authEpoch || activeLogoutCount > 0) {
      return null;
    }

    // If another tab acquired the lock and successfully refreshed while we waited,
    // reuse the newly received access token without sending a duplicate backend request
    if (
      inMemoryAccessToken &&
      (inMemoryAccessToken !== tokenAtStart || crossTabRefreshCounter !== refreshSeqAtStart)
    ) {
      return {
        token: inMemoryAccessToken,
        user: lastRefreshedUser,
      };
    }

    return executeTokenRefresh(initiatingEpoch);
  };

  // If Web Locks API is supported, coordinate across browser tabs to avoid cross-tab refresh races
  if (
    typeof navigator !== 'undefined' &&
    navigator.locks &&
    typeof navigator.locks.request === 'function'
  ) {
    inFlightRefreshPromise = runWithWebLockIfAvailable(runRefreshWithEpochChecks).finally(() => {
      inFlightRefreshPromise = null;
    });

    return inFlightRefreshPromise;
  }

  // Fallback for environments without Web Locks (e.g. Node.js tests or legacy browsers)
  inFlightRefreshPromise = runRefreshWithEpochChecks().finally(() => {
    inFlightRefreshPromise = null;
  });

  return inFlightRefreshPromise;
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

    // 401 Unauthorized handling: coordinated silent token refresh via HttpOnly cookie
    if (status === 401 && !isAuthEndpoint && !originalRequest?._retry) {
      const requestEpoch =
        typeof originalRequest._authEpoch === 'number' ? originalRequest._authEpoch : getAuthEpoch();

      if (requestEpoch !== getAuthEpoch()) {
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      try {
        const refreshResult = await requestTokenRefresh();
        if (!refreshResult?.token || requestEpoch !== getAuthEpoch()) {
          return Promise.reject(error);
        }

        originalRequest.headers = originalRequest.headers || {};
        if (typeof originalRequest.headers.set === 'function') {
          originalRequest.headers.set('Authorization', `Bearer ${refreshResult.token}`);
        } else {
          originalRequest.headers.Authorization = `Bearer ${refreshResult.token}`;
        }
        return api(originalRequest);
      } catch (refreshErr) {
        return Promise.reject(refreshErr);
      }
    }

    // 403 Forbidden handling - specifically for deactivated/suspended accounts
    if (status === 403 && isAccountDeactivatedResponse(data)) {
      const requestEpoch = originalRequest?._authEpoch;
      if (typeof requestEpoch !== 'number' || requestEpoch === getAuthEpoch()) {
        setAccessToken(null);
        const invalidatedEpoch = bumpAuthEpoch();
        if (error && typeof error === 'object' && Object.isExtensible(error)) {
          error._invalidatedEpoch = invalidatedEpoch;
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('ledgerline:session_expired', {
              detail: {
                reason: 'deactivated',
                message: data?.message || 'Your user account is deactivated.',
                epoch: invalidatedEpoch,
              },
            })
          );
        }
        broadcastAuthEvent('SESSION_EXPIRED', {
          reason: 'deactivated',
          message: data?.message || 'Your user account is deactivated.',
        });
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
  if (error?.code === 'WEB_LOCK_ACQUISITION_FAILED') {
    return (
      error.message ||
      'Unable to coordinate authentication session across browser tabs. Please retry.'
    );
  }

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
