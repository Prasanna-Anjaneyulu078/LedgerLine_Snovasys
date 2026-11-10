import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import {
  api,
  rawAuthClient,
  setAccessToken,
  getAccessToken,
  requestTokenRefresh,
  classifyAuthError,
  bumpAuthEpoch,
  getAuthEpoch,
  getAuthTabId,
  beginLoginTransition,
  initAuthBroadcastChannel,
  getErrorMessage,
} from '../src/services/api.js';
import authService from '../src/services/authService.js';

const viteNodeEntryUrl = new URL('../node_modules/vite/dist/node/index.js', import.meta.url).href;
const mockReactCode = `
const getRuntime = () => globalThis.__AUTH_TEST_REACT_RUNTIME__;
export function createContext(defaultValue) {
  const ctx = { _currentValue: defaultValue };
  ctx.Provider = ({ value, children }) => ({ type: 'Provider', ctx, value, children });
  return ctx;
}
export const useContext = (ctx) => ctx._currentValue;
export const useState = (init) => getRuntime().useState(init);
export const useEffect = (fn, deps) => getRuntime().useEffect(fn, deps);
export const useRef = (init) => getRuntime().useRef(init);
export default { createContext, useContext, useState, useEffect, useRef };
`;
const mockJsxRuntimeCode = `
export const jsx = (type, props) => ({ type, props });
export const jsxs = jsx;
export const Fragment = ({ children }) => children;
`;
const mockReactUrl = `data:text/javascript,${encodeURIComponent(mockReactCode)}`;
const mockJsxRuntimeUrl = `data:text/javascript,${encodeURIComponent(mockJsxRuntimeCode)}`;

const jsxLoaderSource = `
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from ${JSON.stringify(viteNodeEntryUrl)};
export async function resolve(specifier, context, nextResolve) {
  if (context.parentURL && context.parentURL.includes('auth-harness=1')) {
    if (specifier === 'react') {
      return { url: ${JSON.stringify(mockReactUrl)}, shortCircuit: true };
    }
    if (specifier === 'react/jsx-runtime') {
      return { url: ${JSON.stringify(mockJsxRuntimeUrl)}, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
export async function load(url, context, nextLoad) {
  if (new URL(url).pathname.endsWith('.jsx')) {
    const filePath = fileURLToPath(url);
    const source = await readFile(filePath, 'utf8');
    const result = await transformWithOxc(source, filePath, {
      lang: 'jsx',
      jsx: { runtime: 'automatic' },
    });
    return { format: 'module', shortCircuit: true, source: result.code };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(jsxLoaderSource)}`);

const { executeAuthInitialization } = await import('../src/context/AuthContext.jsx');
const { default: HarnessAuthProvider, AuthContext: HarnessAuthContext } = await import(
  '../src/context/AuthContext.jsx?auth-harness=1'
);

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMockLocalStorage(initialEntries = {}) {
  const store = new Map(Object.entries(initialEntries));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value));
    },
    removeItem: (key) => {
      store.delete(key);
    },
    has: (key) => store.has(key),
  };
}

function ensureWindowEventEnv() {
  const target = new EventTarget();
  const prevDispatch = globalThis.window?.dispatchEvent;
  class MockCustomEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.detail = init.detail;
    }
  }
  globalThis.CustomEvent = MockCustomEvent;
  globalThis.window = {
    ...(globalThis.window || {}),
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: (evt) => {
      if (typeof prevDispatch === 'function') {
        prevDispatch(evt);
      }
      return target.dispatchEvent(evt);
    },
    BroadcastChannel: globalThis.BroadcastChannel,
  };
}

function mountAuthProvider({ strictMode = true } = {}) {
  ensureWindowEventEnv();

  const hooks = [];
  const cleanups = [];
  const waiters = new Set();
  let mounted = true;
  let renderScheduled = false;
  let currentValue = null;

  const render = () => {
    let hookIndex = 0;
    const pendingEffects = [];
    globalThis.__AUTH_TEST_REACT_RUNTIME__ = {
      useState(initial) {
        const idx = hookIndex++;
        if (!(idx in hooks)) {
          hooks[idx] = typeof initial === 'function' ? initial() : initial;
        }
        const setState = (next) => {
          const prev = hooks[idx];
          const resolved = typeof next === 'function' ? next(prev) : next;
          if (!Object.is(prev, resolved)) {
            hooks[idx] = resolved;
            if (mounted && !renderScheduled) {
              renderScheduled = true;
              queueMicrotask(() => {
                renderScheduled = false;
                if (mounted) {
                  render();
                }
              });
            }
          }
        };
        return [hooks[idx], setState];
      },
      useRef(initial) {
        const idx = hookIndex++;
        if (!(idx in hooks)) {
          hooks[idx] = { current: initial };
        }
        return hooks[idx];
      },
      useEffect(fn, deps) {
        const idx = hookIndex++;
        if (!(idx in hooks)) {
          hooks[idx] = { ran: true, deps };
          pendingEffects.push(fn);
        }
      },
    };

    const vnode = HarnessAuthProvider({ children: null });
    currentValue = vnode.props.value;
    HarnessAuthContext._currentValue = currentValue;

    for (const effectFn of pendingEffects) {
      if (strictMode) {
        const cleanup1 = effectFn();
        if (typeof cleanup1 === 'function') {
          cleanup1();
        }
        const cleanup2 = effectFn();
        if (typeof cleanup2 === 'function') {
          cleanups.push(cleanup2);
        }
      } else {
        const cleanup = effectFn();
        if (typeof cleanup === 'function') {
          cleanups.push(cleanup);
        }
      }
    }

    for (const waiter of Array.from(waiters)) {
      if (waiter.predicate(currentValue)) {
        waiters.delete(waiter);
        waiter.resolve(currentValue);
      }
    }
  };

  const flush = async () => {
    await Promise.resolve();
    await Promise.resolve();
    if (renderScheduled && mounted) {
      renderScheduled = false;
      render();
    }
  };

  const getState = () => {
    if (renderScheduled && mounted) {
      renderScheduled = false;
      render();
    }
    return currentValue;
  };

  const waitForState = (predicate) => {
    const state = getState();
    if (predicate(state)) {
      return Promise.resolve(state);
    }
    return new Promise((resolve) => {
      waiters.add({ predicate, resolve });
    });
  };

  const unmount = () => {
    mounted = false;
    for (const cleanup of cleanups) {
      cleanup();
    }
    cleanups.length = 0;
    waiters.clear();
    delete globalThis.__AUTH_TEST_REACT_RUNTIME__;
  };

  render();

  return { getState, flush, waitForState, unmount };
}

function createMockBroadcastEnv() {
  const channels = new Set();
  const dispatchedEvents = [];

  class MockBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.onmessage = null;
      channels.add(this);
    }

    postMessage(data) {
      for (const ch of channels) {
        if (ch !== this && ch.name === this.name && typeof ch.onmessage === 'function') {
          ch.onmessage({ data });
        }
      }
    }

    close() {
      channels.delete(this);
    }
  }

  class MockCustomEvent {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  }

  globalThis.BroadcastChannel = MockBroadcastChannel;
  globalThis.CustomEvent = MockCustomEvent;
  globalThis.window = {
    BroadcastChannel: MockBroadcastChannel,
    dispatchEvent: (evt) => {
      dispatchedEvents.push(evt);
      return true;
    },
  };
  initAuthBroadcastChannel();

  const receivedBroadcasts = [];
  const listenerChannel = new MockBroadcastChannel('ledgerline_auth_channel');
  listenerChannel.onmessage = (event) => {
    receivedBroadcasts.push(event.data);
  };

  return {
    MockBroadcastChannel,
    receivedBroadcasts,
    dispatchedEvents,
    cleanup: () => listenerChannel.close(),
  };
}

describe('Frontend Centralized Refresh Coordination Tests', () => {
  const originalRawAdapter = rawAuthClient.defaults.adapter;
  const originalApiAdapter = api.defaults.adapter;
  const originalNavigator = globalThis.navigator;
  const originalWindow = globalThis.window;
  const originalBroadcastChannel = globalThis.BroadcastChannel;
  const originalCustomEvent = globalThis.CustomEvent;
  const originalLocalStorage = globalThis.localStorage;

  beforeEach(() => {
    setAccessToken(null);
    bumpAuthEpoch();
    rawAuthClient.defaults.adapter = originalRawAdapter;
    api.defaults.adapter = originalApiAdapter;
    if (originalNavigator) {
      globalThis.navigator = originalNavigator;
    } else {
      delete globalThis.navigator;
    }
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
    if (originalBroadcastChannel !== undefined) {
      globalThis.BroadcastChannel = originalBroadcastChannel;
    } else {
      delete globalThis.BroadcastChannel;
    }
    if (originalCustomEvent !== undefined) {
      globalThis.CustomEvent = originalCustomEvent;
    } else {
      delete globalThis.CustomEvent;
    }
    if (originalLocalStorage !== undefined) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
    initAuthBroadcastChannel();
  });

  afterEach(() => {
    rawAuthClient.defaults.adapter = originalRawAdapter;
    api.defaults.adapter = originalApiAdapter;
    if (originalNavigator) {
      globalThis.navigator = originalNavigator;
    } else {
      delete globalThis.navigator;
    }
    if (originalWindow !== undefined) {
      globalThis.window = originalWindow;
    } else {
      delete globalThis.window;
    }
    if (originalBroadcastChannel !== undefined) {
      globalThis.BroadcastChannel = originalBroadcastChannel;
    } else {
      delete globalThis.BroadcastChannel;
    }
    if (originalCustomEvent !== undefined) {
      globalThis.CustomEvent = originalCustomEvent;
    } else {
      delete globalThis.CustomEvent;
    }
    if (originalLocalStorage !== undefined) {
      globalThis.localStorage = originalLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
    initAuthBroadcastChannel();
  });

  describe('Error Classification Suite', () => {
    it('1. Correctly classifies network failures without invalidating session', () => {
      const netErr = new Error('Network Error');
      netErr.code = 'ERR_NETWORK';

      const classified = classifyAuthError(netErr);
      assert.equal(classified.type, 'NETWORK_ERROR');
      assert.equal(classified.isSessionInvalid, false);
      assert.match(classified.message, /network connection failure/i);
    });

    it('2. Correctly classifies 500 server errors without invalidating session', () => {
      const serverErr = {
        response: {
          status: 500,
          data: { message: 'Internal Ledger Error' },
        },
      };

      const classified = classifyAuthError(serverErr);
      assert.equal(classified.type, 'SERVER_ERROR');
      assert.equal(classified.isSessionInvalid, false);
      assert.match(classified.message, /internal ledger processing error/i);
    });

    it('3. Correctly classifies 403 account deactivation as session invalidating', () => {
      const deactErr = {
        response: {
          status: 403,
          data: { message: 'User account is deactivated. Contact administrator.' },
        },
      };

      const classified = classifyAuthError(deactErr);
      assert.equal(classified.type, 'ACCOUNT_DEACTIVATED');
      assert.equal(classified.isSessionInvalid, true);
      assert.match(classified.message, /deactivated/i);
    });

    it('4. Correctly classifies 401 token reuse breach', () => {
      const reuseErr = {
        response: {
          status: 401,
          data: { message: 'Security violation: Session token reuse detected. All sessions revoked.' },
        },
      };

      const classified = classifyAuthError(reuseErr);
      assert.equal(classified.type, 'TOKEN_REUSE');
      assert.equal(classified.isSessionInvalid, true);
    });

    it('5. Correctly classifies 401 expired refresh token', () => {
      const expErr = {
        response: {
          status: 401,
          data: { message: 'Refresh token has expired. Please log in again.' },
        },
      };

      const classified = classifyAuthError(expErr);
      assert.equal(classified.type, 'TOKEN_EXPIRED');
      assert.equal(classified.isSessionInvalid, true);
    });

    it('6. Correctly classifies 401 revoked refresh token', () => {
      const revErr = {
        response: {
          status: 401,
          data: { message: 'Refresh token has been revoked' },
        },
      };

      const classified = classifyAuthError(revErr);
      assert.equal(classified.type, 'TOKEN_REVOKED');
      assert.equal(classified.isSessionInvalid, true);
    });

    it('7. Correctly classifies 401 missing refresh token', () => {
      const reqErr = {
        response: {
          status: 401,
          data: { message: 'Refresh token is required' },
        },
      };

      const classified = classifyAuthError(reqErr);
      assert.equal(classified.type, 'TOKEN_MISSING_OR_INVALID');
      assert.equal(classified.isSessionInvalid, true);
    });
  });

  describe('In-Flight Refresh Promise Deduplication & Concurrency', () => {
    it('8. React StrictMode simulation: concurrent refresh calls share exact same in-flight promise instance', async () => {
      // Mock rawAuthClient to resolve cleanly
      rawAuthClient.defaults.adapter = async (config) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { data: { token: 'strict-mode-token', user: { id: 'u1' } } },
      });

      // Call requestTokenRefresh concurrently (simulating StrictMode Mount 1 and Mount 2)
      const p1 = requestTokenRefresh();
      const p2 = requestTokenRefresh();
      const p3 = authService.refreshToken().catch(() => {});

      // Verify that p1 and p2 are the exact same Promise instance reference
      assert.strictEqual(p1, p2, 'p1 and p2 must be the exact same promise instance');

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.equal(r1.token, 'strict-mode-token');
      assert.equal(r2.token, 'strict-mode-token');
      await p3;
    });

    it('9. Stale epoch detection: in-flight refresh discarded when logout occurs during pending request', async () => {
      setAccessToken('initial-access-token');
      let resolveNetworkRequest;
      const pendingNetworkPromise = new Promise((resolve) => {
        resolveNetworkRequest = resolve;
      });

      // Mock rawAuthClient to remain pending until released
      rawAuthClient.defaults.adapter = async (config) => {
        await pendingNetworkPromise;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            data: {
              token: 'stale-refreshed-token',
              user: { id: 'u1', fullName: 'Alice' },
            },
          },
        };
      };

      // 1. Refresh operation initiated and remains pending
      const refreshPromise = requestTokenRefresh();

      // 2. Logout occurs while that operation is pending
      bumpAuthEpoch();
      setAccessToken(null);
      assert.equal(getAccessToken(), null, 'Access token cleared by logout');

      // 3. The refresh response arrives after logout
      resolveNetworkRequest();
      const result = await refreshPromise;

      // 4. Stale response is discarded and returns null
      assert.equal(result, null, 'Stale refresh response must be discarded');

      // 5. Access token remains cleared (not revived by stale response)
      assert.equal(getAccessToken(), null, 'Access token must remain cleared after late refresh arrives');
    });

    it('10. Stale epoch detection: new login is not overwritten by an earlier in-flight refresh response', async () => {
      setAccessToken('user-a-old-token');
      let resolveNetworkRequest;
      const pendingNetworkPromise = new Promise((resolve) => {
        resolveNetworkRequest = resolve;
      });

      rawAuthClient.defaults.adapter = async (config) => {
        await pendingNetworkPromise;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            data: {
              token: 'user-a-refreshed-token',
              user: { id: 'user-a', fullName: 'Alice' },
            },
          },
        };
      };

      // 1. Refresh initiated for User A
      const refreshPromise = requestTokenRefresh();

      // 2. User B logs in while User A refresh is pending
      bumpAuthEpoch();
      setAccessToken('user-b-active-token');

      // 3. User A delayed refresh response arrives
      resolveNetworkRequest();
      const result = await refreshPromise;

      // 4. User A response discarded and User B active token preserved
      assert.equal(result, null, 'User A stale refresh response must be discarded');
      assert.equal(getAccessToken(), 'user-b-active-token', 'User B active token must NOT be overwritten');
    });

    it('11. Web Locks: queued refresh checks auth epoch after acquiring lock and aborts without sending request', async () => {
      let isLocked = false;
      const waitingQueue = [];
      let backendRequestSent = false;

      // Mock navigator.locks with FIFO serialization
      globalThis.navigator = {
        locks: {
          request: async (name, callback) => {
            if (isLocked) {
              await new Promise((res) => waitingQueue.push(res));
            }
            isLocked = true;
            try {
              return await callback();
            } finally {
              isLocked = false;
              if (waitingQueue.length > 0) {
                const next = waitingQueue.shift();
                next();
              }
            }
          },
        },
      };

      rawAuthClient.defaults.adapter = async (config) => {
        backendRequestSent = true;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'token-xyz', user: { id: 'u1' } } },
        };
      };

      // Tab 1 holds the lock
      let releaseTab1;
      const tab1LockHold = new Promise((res) => {
        releaseTab1 = res;
      });
      const tab1Promise = globalThis.navigator.locks.request('ledgerline_refresh_lock', async () => {
        await tab1LockHold;
        return 'tab1-done';
      });

      // Tab 2 requests refresh while Tab 1 holds lock (initiating epoch captured before waiting)
      const tab2RefreshPromise = requestTokenRefresh();

      // While Tab 2 is waiting for lock, logout occurs
      bumpAuthEpoch();
      setAccessToken(null);

      // Tab 1 releases lock
      releaseTab1();
      await tab1Promise;

      // Tab 2 acquires lock, verifies captured epoch !== current epoch, and aborts
      const tab2Result = await tab2RefreshPromise;

      assert.equal(tab2Result, null, 'Queued refresh must discard and return null after detecting epoch transition');
      assert.equal(backendRequestSent, false, 'Queued refresh must NOT send backend HTTP request if epoch changed while waiting');
      assert.equal(getAccessToken(), null, 'Access token must remain cleared');
    });

    it('12. Missing user data in refresh response: successfully extracts access token', async () => {
      rawAuthClient.defaults.adapter = async (config) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: {
          data: {
            token: 'valid-token-no-user',
            // user field omitted
          },
        },
      });

      const result = await requestTokenRefresh();
      assert.equal(result.token, 'valid-token-no-user');
      assert.equal(result.user, null);
      assert.equal(getAccessToken(), 'valid-token-no-user');
    });

    it('13. Web Locks acquisition rejection: aborts without executing an uncoordinated refresh', async () => {
      let backendRequestSent = false;
      globalThis.navigator = {
        locks: {
          request: async () => {
            throw new Error('Lock acquisition security/policy error');
          },
        },
      };

      rawAuthClient.defaults.adapter = async (config) => {
        backendRequestSent = true;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            data: {
              token: 'uncoordinated-token',
              user: { id: 'u1' },
            },
          },
        };
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err?.code === 'WEB_LOCK_ACQUISITION_FAILED'
      );

      assert.equal(backendRequestSent, false, 'Must NEVER issue an uncoordinated refresh when Web Locks rejects acquisition');
      assert.equal(getAccessToken(), null);
      const classified = classifyAuthError({ code: 'WEB_LOCK_ACQUISITION_FAILED', message: 'blocked' });
      assert.equal(classified.type, 'LOCK_COORDINATION_ERROR');
      assert.equal(classified.isSessionInvalid, false);
    });

    it('14. Transient network error during refresh: does not invalidate session or bump epoch', async () => {
      setAccessToken('active-valid-token');
      const startEpoch = getAuthEpoch();

      rawAuthClient.defaults.adapter = async () => {
        const netErr = new Error('Network Connection Error');
        netErr.code = 'ERR_NETWORK';
        throw netErr;
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err.code === 'ERR_NETWORK'
      );

      assert.equal(getAccessToken(), 'active-valid-token', 'Access token must not be cleared on network failure');
      assert.equal(getAuthEpoch(), startEpoch, 'Auth epoch must not be bumped on transient network failure');
    });

    it('15. Genuine 401 invalid refresh token: clears token and bumps auth epoch', async () => {
      setAccessToken('old-token');
      const startEpoch = getAuthEpoch();

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = {
          status: 401,
          data: { message: 'Refresh token has expired. Please log in again.' },
        };
        throw err;
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err.response?.status === 401
      );

      assert.equal(getAccessToken(), null, 'Access token must be cleared on genuine session expiration');
      assert.equal(getAuthEpoch(), startEpoch + 1, 'Auth epoch must be bumped on genuine session expiration');
    });

    it('16. authService.logout coordinates with Web Locks and bumps epoch before clearing token', async () => {
      let lockAcquired = false;
      globalThis.navigator = {
        locks: {
          request: async (name, callback) => {
            lockAcquired = true;
            return callback();
          },
        },
      };

      api.defaults.adapter = async (config) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { success: true },
      });

      setAccessToken('user-token-active');
      const startEpoch = getAuthEpoch();

      await authService.logout();

      assert.equal(lockAcquired, true, 'Logout must coordinate through Web Locks when available');
      assert.equal(getAccessToken(), null, 'Access token must be cleared');
      assert.equal(getAuthEpoch() > startEpoch, true, 'Auth epoch must be bumped');
    });
  });

  describe('Axios Interceptors & Header Injection', () => {
    it('17. Request interceptor injects Bearer token when inMemoryAccessToken is set', async () => {
      setAccessToken('test-bearer-token-abc');
      assert.equal(getAccessToken(), 'test-bearer-token-abc');

      // Test config transformation
      const config = { headers: {} };
      const handlers = api.interceptors.request.handlers;
      const requestHandler = handlers[0]?.fulfilled;

      if (requestHandler) {
        const result = requestHandler(config);
        assert.equal(result.headers.Authorization, 'Bearer test-bearer-token-abc');
      }
    });

    it('18. Request interceptor does not inject Authorization when token is null', async () => {
      setAccessToken(null);
      const config = { headers: {} };
      const handlers = api.interceptors.request.handlers;
      const requestHandler = handlers[0]?.fulfilled;

      if (requestHandler) {
        const result = requestHandler(config);
        assert.equal(result.headers.Authorization, undefined);
      }
    });
  });

  describe('Priority 4 Extended Auth Coordination & Edge Cases', () => {
    it('19. Error thrown inside Web Lock callback (500/401) propagates cleanly without fallback retry', async () => {
      let backendCalls = 0;
      globalThis.navigator = {
        locks: {
          request: async (name, callback) => callback(),
        },
      };

      rawAuthClient.defaults.adapter = async () => {
        backendCalls += 1;
        const err = new Error('Internal Server Error');
        err.response = { status: 500, data: { message: 'Temporary DB failure' } };
        throw err;
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err?.response?.status === 500
      );

      assert.equal(backendCalls, 1, 'Must never execute a duplicate fallback refresh after lock callback failure');
    });

    it('20. Concurrent 401 API responses in one tab deduplicate into one /auth/refresh call and retry', async () => {
      let refreshCount = 0;
      let retryAuthHeaders = [];
      setAccessToken('expired-jwt');

      rawAuthClient.defaults.adapter = async (config) => {
        refreshCount += 1;
        await new Promise((r) => setTimeout(r, 15));
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'fresh-jwt-123', user: { id: 'u1', role: 'ACCOUNT_HOLDER' } } },
        };
      };

      api.defaults.adapter = async (config) => {
        if (!config._retry) {
          const unauth = new Error('Unauthorized');
          unauth.config = config;
          unauth.response = { status: 401, data: { message: 'Token expired' } };
          throw unauth;
        }
        retryAuthHeaders.push(config.headers?.Authorization);
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { success: true, data: { ok: true } },
        };
      };

      const [resA, resB] = await Promise.all([api.get('/accounts'), api.get('/transactions')]);
      assert.equal(resA.status, 200);
      assert.equal(resB.status, 200);
      assert.equal(refreshCount, 1, 'Both 401 interceptors must share one refresh HTTP request');
      assert.deepEqual(retryAuthHeaders, ['Bearer fresh-jwt-123', 'Bearer fresh-jwt-123']);
    });

    it('21. Two tabs refreshing simultaneously via Web Locks + BroadcastChannel reuse first tab token', async () => {
      const channels = new Set();
      class MockBroadcastChannel {
        constructor(name) {
          this.name = name;
          this.onmessage = null;
          channels.add(this);
        }
        postMessage(data) {
          for (const ch of channels) {
            if (ch !== this && ch.name === this.name && typeof ch.onmessage === 'function') {
              ch.onmessage({ data });
            }
          }
        }
        close() {
          channels.delete(this);
        }
      }

      globalThis.BroadcastChannel = MockBroadcastChannel;
      globalThis.window = globalThis;
      globalThis.window.dispatchEvent = () => true;
      globalThis.CustomEvent = class MockCustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      };
      initAuthBroadcastChannel();

      let isLocked = false;
      const queue = [];
      let refreshCount = 0;

      globalThis.navigator = {
        locks: {
          request: async (name, callback) => {
            if (isLocked) {
              await new Promise((r) => queue.push(r));
            }
            isLocked = true;
            try {
              return await callback();
            } finally {
              isLocked = false;
              const next = queue.shift();
              if (next) next();
            }
          },
        },
      };

      rawAuthClient.defaults.adapter = async (config) => {
        refreshCount += 1;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'tab1-fresh-token', user: { id: 'u1' } } },
        };
      };

      // Simulate Tab 1 already holding Web Lock and completing refresh, broadcasting TOKEN_REFRESHED
      const externalTabChannel = new MockBroadcastChannel('ledgerline_auth_channel');
      let tab2Promise;
      await globalThis.navigator.locks.request('ledgerline_refresh_lock', async () => {
        tab2Promise = requestTokenRefresh();
        await new Promise((r) => setTimeout(r, 5));
        externalTabChannel.postMessage({
          type: 'TOKEN_REFRESHED',
          payload: { token: 'tab1-fresh-token', user: { id: 'u1', fullName: 'Alice' } },
        });
      });

      const tab2Result = await tab2Promise;
      externalTabChannel.close();

      assert.equal(tab2Result.token, 'tab1-fresh-token');
      assert.equal(refreshCount, 0, 'Queued tab must reuse broadcast token without calling /auth/refresh again');
    });

    it('22. Refresh during active logout: aborts immediately without issuing /auth/refresh', async () => {
      let releaseLogout;
      const logoutPending = new Promise((r) => {
        releaseLogout = r;
      });
      let refreshCalled = false;

      rawAuthClient.defaults.adapter = async (config) => {
        refreshCalled = true;
        return { status: 200, statusText: 'OK', headers: {}, config, data: { data: { token: 'bad' } } };
      };
      api.defaults.adapter = async (config) => {
        await logoutPending;
        return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
      };

      setAccessToken('active-token');
      const logoutPromise = authService.logout();
      const refreshDuringLogout = await requestTokenRefresh();

      assert.equal(refreshDuringLogout, null);
      assert.equal(refreshCalled, false);
      assert.equal(getAccessToken(), null);

      releaseLogout();
      await logoutPromise;
    });

    it('23. Logout during in-flight refresh: waits for refresh before /auth/logout and discards late token', async () => {
      const timeline = [];
      let releaseRefresh;
      const refreshPending = new Promise((r) => {
        releaseRefresh = r;
      });

      let locked = false;
      const waitQ = [];
      globalThis.navigator = {
        locks: {
          request: async (name, callback) => {
            if (locked) {
              await new Promise((r) => waitQ.push(r));
            }
            locked = true;
            try {
              return await callback();
            } finally {
              locked = false;
              const n = waitQ.shift();
              if (n) n();
            }
          },
        },
      };

      rawAuthClient.defaults.adapter = async (config) => {
        timeline.push('refresh-start');
        await refreshPending;
        timeline.push('refresh-resolve');
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'late-token', user: { id: 'u1' } } },
        };
      };

      api.defaults.adapter = async (config) => {
        timeline.push('logout-http');
        return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
      };

      setAccessToken('initial-token');
      const refreshPromise = requestTokenRefresh();
      await new Promise((r) => setTimeout(r, 5));

      const logoutPromise = authService.logout();
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(timeline.includes('logout-http'), false, '/auth/logout must serialize after active refresh');

      releaseRefresh();
      const [refreshRes] = await Promise.all([refreshPromise, logoutPromise]);

      assert.equal(refreshRes, null, 'Late refresh response must be discarded');
      assert.equal(getAccessToken(), null, 'Token must remain null after logout');
      assert.deepEqual(timeline, ['refresh-start', 'refresh-resolve', 'logout-http']);
    });

    it('24. Axios timeout (ECONNABORTED) or aborted request (ERR_CANCELED): preserves session state cleanly', async () => {
      setAccessToken('valid-session-token');
      const startEpoch = getAuthEpoch();

      rawAuthClient.defaults.adapter = async () => {
        const timeoutErr = new Error('timeout of 20000ms exceeded');
        timeoutErr.code = 'ECONNABORTED';
        timeoutErr.request = {};
        throw timeoutErr;
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err?.code === 'ECONNABORTED'
      );

      assert.equal(getAccessToken(), 'valid-session-token');
      assert.equal(getAuthEpoch(), startEpoch);

      rawAuthClient.defaults.adapter = async () => {
        const cancelErr = new Error('canceled');
        cancelErr.code = 'ERR_CANCELED';
        cancelErr.request = {};
        throw cancelErr;
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err?.code === 'ERR_CANCELED'
      );

      assert.equal(getAccessToken(), 'valid-session-token');
      assert.equal(getAuthEpoch(), startEpoch);
    });

    it('25. Missing cookie (TOKEN_MISSING_OR_INVALID): does not emit UI session_expired banner', async () => {
      const dispatchedEvents = [];
      globalThis.window = {
        dispatchEvent: (evt) => {
          dispatchedEvents.push(evt.type);
          return true;
        },
      };
      globalThis.CustomEvent = class MockCustomEvent {
        constructor(type, init = {}) {
          this.type = type;
          this.detail = init.detail;
        }
      };

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = {
          status: 401,
          data: { message: 'Refresh token is required' },
        };
        throw err;
      };

      await assert.rejects(
        async () => {
          await requestTokenRefresh();
        },
        (err) => err?.response?.status === 401
      );

      assert.equal(
        dispatchedEvents.includes('ledgerline:session_expired'),
        false,
        'Missing refresh cookie on unauthenticated visit must not emit session_expired error banner'
      );
    });

    it('26. Web Lock acquisition failure aborts login and register without calling backend outside the lock', async () => {
      let backendCalled = false;
      globalThis.navigator = {
        locks: {
          request: async () => {
            throw new Error('Cross-tab lock blocked by permissions policy');
          },
        },
      };

      api.defaults.adapter = async () => {
        backendCalled = true;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          data: { data: { token: 'should-not-happen', user: { id: 'u1', role: 'ACCOUNT_HOLDER' } } },
        };
      };

      await assert.rejects(
        async () => {
          await authService.login('alice@test.com', 'Test@123456');
        },
        (err) => {
          assert.equal(err?.code, 'WEB_LOCK_ACQUISITION_FAILED');
          assert.match(getErrorMessage(err), /lock|blocked|coordinate/i);
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await authService.register('Alice Test', 'alice2@test.com', 'Test@123456');
        },
        (err) => err?.code === 'WEB_LOCK_ACQUISITION_FAILED'
      );

      assert.equal(backendCalled, false, 'Login and register must never hit backend outside Web Lock');
      assert.equal(getAccessToken(), null);
    });

    it('27. Web Lock acquisition failure aborts /auth/logout outside lock, clears local state, and surfaces coordination error', async () => {
      let logoutBackendCalled = false;
      globalThis.navigator = {
        locks: {
          request: async () => {
            throw new Error('Logout lock acquisition rejected');
          },
        },
      };

      api.defaults.adapter = async () => {
        logoutBackendCalled = true;
        return { status: 200, statusText: 'OK', headers: {}, data: { success: true } };
      };

      setAccessToken('active-jwt-before-logout');
      const startEpoch = getAuthEpoch();

      await assert.rejects(
        async () => {
          await authService.logout();
        },
        (err) => err?.code === 'WEB_LOCK_ACQUISITION_FAILED'
      );

      assert.equal(logoutBackendCalled, false, 'Backend /auth/logout must NOT run outside failed Web Lock');
      assert.equal(getAccessToken(), null, 'Local access token must still be cleared when lock acquisition fails');
      assert.equal(getAuthEpoch() > startEpoch, true, 'Auth epoch must be bumped on logout even if lock fails');

      // Ensure activeLogoutCount was cleaned up in finally so subsequent refresh coordination works after login
      delete globalThis.navigator;
      rawAuthClient.defaults.adapter = async (config) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: { data: { token: 'recovered-after-relogin', user: { id: 'u1' } } },
      });
      const nextRefresh = await requestTokenRefresh();
      assert.equal(nextRefresh?.token, 'recovered-after-relogin');
    });

    it('28. Logout still clears local authentication state after backend /auth/logout network/server failure', async () => {
      api.defaults.adapter = async () => {
        const netErr = new Error('Network Error');
        netErr.code = 'ERR_NETWORK';
        throw netErr;
      };

      setAccessToken('active-jwt-offline-logout');
      const startEpoch = getAuthEpoch();

      await authService.logout();

      assert.equal(getAccessToken(), null, 'Access token must be cleared even when /auth/logout fails');
      assert.equal(getAuthEpoch() > startEpoch, true, 'Auth epoch must be bumped even when /auth/logout fails');
    });

    it('29. Same-tab in-flight refresh barrier serializes login behind active refresh without Web Locks', async () => {
      delete globalThis.navigator;
      const timeline = [];
      let releaseRefresh;
      const pendingRefresh = new Promise((r) => {
        releaseRefresh = r;
      });

      rawAuthClient.defaults.adapter = async (config) => {
        timeline.push('refresh-start');
        await pendingRefresh;
        timeline.push('refresh-end');
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'old-refresh-token', user: { id: 'u-old', role: 'ACCOUNT_HOLDER' } } },
        };
      };

      api.defaults.adapter = async (config) => {
        timeline.push('login-http');
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: {
            data: {
              token: 'new-login-token',
              user: { id: 'u-new', email: 'new@test.com', role: 'ACCOUNT_HOLDER' },
            },
          },
        };
      };

      const refreshPromise = requestTokenRefresh();
      await new Promise((r) => setTimeout(r, 5));

      const loginPromise = authService.login('new@test.com', 'Test@123456');
      await new Promise((r) => setTimeout(r, 10));

      assert.equal(timeline.includes('login-http'), false, 'Login must wait for same-tab in-flight refresh barrier');

      releaseRefresh();
      const [refreshRes, loginRes] = await Promise.all([refreshPromise, loginPromise]);

      assert.equal(refreshRes, null);
      assert.equal(loginRes.token, 'new-login-token');
      assert.equal(getAccessToken(), 'new-login-token');
      assert.deepEqual(timeline, ['refresh-start', 'refresh-end', 'login-http']);
    });
  });

  describe('Final Authentication Race-Condition Corrections', () => {
    it('30. Exactly one logical LOGOUT broadcast per logout transition (success, backend error, and lock failure)', async () => {
      const env = createMockBroadcastEnv();
      try {
        // Case A: Successful backend logout
        api.defaults.adapter = async (config) => ({
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { success: true },
        });
        setAccessToken('session-token-1');
        await authService.logout();
        assert.equal(
          env.receivedBroadcasts.filter((m) => m.type === 'LOGOUT').length,
          1,
          'Normal logout must emit exactly one LOGOUT broadcast'
        );
        assert.equal(getAccessToken(), null);

        // Case B: Backend /auth/logout fails
        env.receivedBroadcasts.length = 0;
        api.defaults.adapter = async () => {
          const err = new Error('Network Error');
          err.code = 'ERR_NETWORK';
          throw err;
        };
        setAccessToken('session-token-2');
        await authService.logout();
        assert.equal(
          env.receivedBroadcasts.filter((m) => m.type === 'LOGOUT').length,
          1,
          'Failed backend logout must still emit exactly one LOGOUT broadcast'
        );
        assert.equal(getAccessToken(), null);

        // Case C: Web Lock acquisition fails
        env.receivedBroadcasts.length = 0;
        globalThis.navigator = {
          locks: {
            request: async () => {
              throw new Error('Lock blocked');
            },
          },
        };
        setAccessToken('session-token-3');
        await assert.rejects(
          async () => {
            await authService.logout();
          },
          (err) => err?.code === 'WEB_LOCK_ACQUISITION_FAILED'
        );
        assert.equal(
          env.receivedBroadcasts.filter((m) => m.type === 'LOGOUT').length,
          1,
          'Web Lock failure during logout must emit exactly one LOGOUT broadcast'
        );
        assert.equal(getAccessToken(), null);
      } finally {
        env.cleanup();
      }
    });

    it('31. Stale 401 request during refresh followed by logout and new login must not replay under new session', async () => {
      let releaseRefresh;
      const refreshPending = new Promise((resolve) => {
        releaseRefresh = resolve;
      });
      const apiRequests = [];

      setAccessToken('user-a-token');

      rawAuthClient.defaults.adapter = async (config) => {
        await refreshPending;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'late-user-a-refresh-token', user: { id: 'user-a' } } },
        };
      };

      api.defaults.adapter = async (config) => {
        apiRequests.push({
          url: config.url,
          retry: Boolean(config._retry),
          auth: config.headers?.Authorization,
        });

        if (config.url === '/accounts' && !config._retry) {
          const unauth = new Error('Unauthorized');
          unauth.config = config;
          unauth.response = { status: 401, data: { message: 'Token expired' } };
          throw unauth;
        }
        if (config.url === '/auth/logout') {
          return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
        }
        if (config.url === '/auth/login') {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              data: {
                token: 'user-b-active-token',
                user: { id: 'user-b', email: 'b@test.com', role: 'ACCOUNT_HOLDER' },
              },
            },
          };
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: { ok: true } };
      };

      // 1. User A dispatches /accounts -> gets 401 -> starts pending /auth/refresh
      const staleRequestAssertion = assert.rejects(api.get('/accounts'));
      await new Promise((r) => setTimeout(r, 10));

      // 2. User A initiates logout while refresh is still pending
      const logoutPromise = authService.logout();
      await new Promise((r) => setTimeout(r, 10));

      // 3. Release the delayed /auth/refresh, finish logout, then User B logs in
      releaseRefresh();
      await logoutPromise;

      const loginResult = await authService.login('b@test.com', 'Test@123456');
      assert.equal(loginResult.token, 'user-b-active-token');
      assert.equal(getAccessToken(), 'user-b-active-token');

      // 4. Stale /accounts request must reject and NEVER replay with User B's token
      await staleRequestAssertion;
      assert.equal(
        apiRequests.filter((r) => r.url === '/accounts').length,
        1,
        'Stale 401 /accounts request must not be replayed after logout + new login'
      );
      assert.equal(
        apiRequests.some((r) => r.url === '/accounts' && r.retry),
        false,
        'No retry dispatch may occur for stale auth epoch'
      );
    });

    it('32. Delayed 401 arriving after logout and new login rejects without triggering refresh or replay', async () => {
      let releaseSlowRequest;
      const slowRequestGate = new Promise((resolve) => {
        releaseSlowRequest = resolve;
      });
      let refreshCalls = 0;
      const apiCalls = [];

      setAccessToken('user-a-token');

      rawAuthClient.defaults.adapter = async (config) => {
        refreshCalls += 1;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'unexpected-refresh-token', user: { id: 'user-b' } } },
        };
      };

      api.defaults.adapter = async (config) => {
        apiCalls.push({ url: config.url, retry: Boolean(config._retry), auth: config.headers?.Authorization });
        if (config.url === '/transactions') {
          await slowRequestGate;
          const unauth = new Error('Unauthorized');
          unauth.config = config;
          unauth.response = { status: 401, data: { message: 'Token expired' } };
          throw unauth;
        }
        if (config.url === '/auth/logout') {
          return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
        }
        if (config.url === '/auth/login') {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              data: {
                token: 'user-b-token',
                user: { id: 'user-b', email: 'b@test.com', role: 'ACCOUNT_HOLDER' },
              },
            },
          };
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      // 1. User A dispatches /transactions
      const staleReq = api.get('/transactions');
      await new Promise((r) => setTimeout(r, 10));

      // 2. Before 401 arrives, User A logs out and User B logs in
      await authService.logout();
      const loginRes = await authService.login('b@test.com', 'Test@123456');
      assert.equal(loginRes.token, 'user-b-token');

      // 3. Delayed 401 for User A's /transactions now arrives
      releaseSlowRequest();
      await assert.rejects(staleReq, (err) => err?.response?.status === 401);

      assert.equal(refreshCalls, 0, 'Stale 401 from prior epoch must not trigger /auth/refresh for new user');
      assert.equal(
        apiCalls.filter((c) => c.url === '/transactions').length,
        1,
        'Stale /transactions must not replay under User B token'
      );
      assert.equal(getAccessToken(), 'user-b-token');
    });

    it('33. AuthContext initialization: delayed /auth/me response must not overwrite a newer login', async () => {
      let releaseMe;
      const meGate = new Promise((resolve) => {
        releaseMe = resolve;
      });

      const state = {
        user: null,
        token: null,
        isLoading: true,
        authError: null,
      };

      const fakeAuthService = {
        refreshToken: async () => ({
          token: 'startup-user-a-token',
          user: { id: 'user-a', fullName: 'Startup Alice', role: 'ACCOUNT_HOLDER', isActive: true },
        }),
        getCurrentUser: async () => {
          await meGate;
          return {
            user: { id: 'user-a', fullName: 'Startup Alice', role: 'ACCOUNT_HOLDER', isActive: true },
            accounts: [],
          };
        },
      };

      const initPromise = executeAuthInitialization({
        isMounted: () => true,
        setUser: (u) => {
          state.user = u;
        },
        setToken: (t) => {
          state.token = t;
        },
        setIsLoading: (l) => {
          state.isLoading = l;
        },
        setAuthError: (e) => {
          state.authError = e;
        },
        authServiceImpl: fakeAuthService,
      });

      // Wait until getCurrentUser is in flight
      await new Promise((r) => setTimeout(r, 10));

      // Newer login succeeds while startup /auth/me is still pending
      api.defaults.adapter = async (config) => ({
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
        data: {
          data: {
            token: 'newer-user-b-token',
            user: { id: 'user-b', fullName: 'Active Bob', role: 'ADMIN', isActive: true },
          },
        },
      });

      const loginRes = await authService.login('bob@test.com', 'Test@123456');
      state.user = loginRes.user;
      state.token = loginRes.token;
      state.isLoading = false;
      state.authError = null;

      // Delayed /auth/me resolves with User A
      releaseMe();
      await initPromise;

      assert.equal(state.user.id, 'user-b', 'Delayed startup /auth/me must NOT overwrite newer logged-in user');
      assert.equal(state.token, 'newer-user-b-token', 'Delayed startup /auth/me must NOT overwrite token');
      assert.equal(getAccessToken(), 'newer-user-b-token', 'In-memory access token must remain User B token');
      assert.equal(state.isLoading, false);
      assert.equal(state.authError, null);
    });

    it('34. AuthContext initialization: delayed startup failure must not clear a newer authenticated session', async () => {
      // Subcase A: Delayed /auth/me 401/deactivated failure after a newer login
      {
        let rejectMe;
        const meGate = new Promise((_, reject) => {
          rejectMe = reject;
        });

        const state = {
          user: null,
          token: null,
          isLoading: true,
          authError: null,
        };

        const fakeAuthService = {
          refreshToken: async () => ({
            token: 'startup-token-a',
            user: { id: 'user-a', fullName: 'Alice', role: 'ACCOUNT_HOLDER', isActive: true },
          }),
          getCurrentUser: () => meGate,
        };

        const initPromise = executeAuthInitialization({
          isMounted: () => true,
          setUser: (u) => {
            state.user = u;
          },
          setToken: (t) => {
            state.token = t;
          },
          setIsLoading: (l) => {
            state.isLoading = l;
          },
          setAuthError: (e) => {
            state.authError = e;
          },
          authServiceImpl: fakeAuthService,
        });

        await new Promise((r) => setTimeout(r, 10));

        // Newer login completes while startup /auth/me is pending
        beginLoginTransition();
        setAccessToken('user-b-valid-token');
        state.user = { id: 'user-b', fullName: 'Bob', role: 'ADMIN' };
        state.token = 'user-b-valid-token';
        state.isLoading = false;
        state.authError = null;

        const deactErr = new Error('Forbidden');
        deactErr.response = { status: 403, data: { message: 'User account is deactivated' } };
        rejectMe(deactErr);
        await initPromise;

        assert.equal(state.user.id, 'user-b');
        assert.equal(state.token, 'user-b-valid-token');
        assert.equal(getAccessToken(), 'user-b-valid-token');
        assert.equal(state.authError, null);
        assert.equal(state.isLoading, false);
      }

      // Subcase B: Delayed refreshToken() failure after a newer login starts (loading & session preserved)
      {
        let rejectRefresh;
        const refreshGate = new Promise((_, reject) => {
          rejectRefresh = reject;
        });

        const state = {
          user: null,
          token: null,
          isLoading: true,
          authError: null,
        };

        const fakeAuthService = {
          refreshToken: () => refreshGate,
          getCurrentUser: async () => ({ user: null }),
        };

        const initPromise = executeAuthInitialization({
          isMounted: () => true,
          setUser: (u) => {
            state.user = u;
          },
          setToken: (t) => {
            state.token = t;
          },
          setIsLoading: (l) => {
            state.isLoading = l;
          },
          setAuthError: (e) => {
            state.authError = e;
          },
          authServiceImpl: fakeAuthService,
        });

        await new Promise((r) => setTimeout(r, 10));

        // Newer login starts and is in progress (isLoading = true) or finished
        beginLoginTransition();
        setAccessToken('user-b-fresh-token');
        state.user = { id: 'user-b', fullName: 'Bob', role: 'AUDITOR' };
        state.token = 'user-b-fresh-token';
        state.isLoading = true; // Simulate in-progress login check too

        const unauthErr = new Error('Unauthorized');
        unauthErr.response = { status: 401, data: { message: 'Refresh token has expired' } };
        rejectRefresh(unauthErr);
        await initPromise;

        assert.equal(state.user.id, 'user-b', 'Delayed refresh failure must not clear newer user');
        assert.equal(state.token, 'user-b-fresh-token', 'Delayed refresh failure must not clear newer token');
        assert.equal(getAccessToken(), 'user-b-fresh-token');
        assert.equal(state.authError, null, 'Delayed refresh failure must not inject stale authError');
        assert.equal(state.isLoading, true, 'Stale init finally must not overwrite active login loading state');
      }

      // Subcase C: Normal startup failure without newer transition still settles loading and reports error
      {
        rawAuthClient.defaults.adapter = async () => {
          const netErr = new Error('Network Error');
          netErr.code = 'ERR_NETWORK';
          throw netErr;
        };

        const state = {
          user: null,
          token: null,
          isLoading: true,
          authError: null,
        };

        await executeAuthInitialization({
          isMounted: () => true,
          setUser: (u) => {
            state.user = u;
          },
          setToken: (t) => {
            state.token = t;
          },
          setIsLoading: (l) => {
            state.isLoading = l;
          },
          setAuthError: (e) => {
            state.authError = e;
          },
        });

        assert.equal(state.isLoading, false);
        assert.equal(state.user, null);
        assert.equal(state.token, null);
        assert.match(state.authError, /network connection failure/i);
      }
    });

    it('35. Normal 403 permission error classifies as FORBIDDEN and does not invalidate the session', async () => {
      const roleErr = {
        response: {
          status: 403,
          data: { message: 'Access forbidden: required role [ADMIN], current role is [ACCOUNT_HOLDER]' },
        },
      };
      const emptyForbiddenErr = {
        response: {
          status: 403,
          data: {},
        },
      };

      const classifiedRole = classifyAuthError(roleErr);
      assert.equal(classifiedRole.type, 'FORBIDDEN');
      assert.equal(classifiedRole.isSessionInvalid, false);
      assert.match(classifiedRole.message, /required role/i);

      const classifiedEmpty = classifyAuthError(emptyForbiddenErr);
      assert.equal(classifiedEmpty.type, 'FORBIDDEN');
      assert.equal(classifiedEmpty.isSessionInvalid, false);

      // Verify Axios response interceptor + BroadcastChannel leave valid session intact
      const env = createMockBroadcastEnv();
      try {
        setAccessToken('valid-holder-token');
        const startEpoch = getAuthEpoch();

        api.defaults.adapter = async (config) => {
          const err = new Error('Forbidden');
          err.config = config;
          err.response = {
            status: 403,
            data: { message: 'You do not have permission to access this account' },
          };
          throw err;
        };

        await assert.rejects(
          async () => {
            await api.get('/admin/users');
          },
          (err) => err?.response?.status === 403
        );

        assert.equal(getAccessToken(), 'valid-holder-token', 'Normal 403 must not clear access token');
        assert.equal(getAuthEpoch(), startEpoch, 'Normal 403 must not bump auth epoch');
        assert.equal(env.dispatchedEvents.length, 0, 'Normal 403 must not dispatch session_expired');
        assert.equal(env.receivedBroadcasts.length, 0, 'Normal 403 must not broadcast SESSION_EXPIRED');

        // Verify AuthContext initialization fallback also preserves valid session on ordinary 403
        const state = { user: null, token: null, isLoading: true, authError: null };
        await executeAuthInitialization({
          isMounted: () => true,
          setUser: (u) => {
            state.user = u;
          },
          setToken: (t) => {
            state.token = t;
          },
          setIsLoading: (l) => {
            state.isLoading = l;
          },
          setAuthError: (e) => {
            state.authError = e;
          },
          authServiceImpl: {
            refreshToken: async () => ({
              token: 'valid-holder-token',
              user: { id: 'holder-1', fullName: 'Holder', role: 'ACCOUNT_HOLDER', isActive: true },
            }),
            getCurrentUser: async () => api.get('/auth/me'),
          },
        });

        assert.equal(state.token, 'valid-holder-token');
        assert.equal(getAccessToken(), 'valid-holder-token');
        assert.equal(state.user.id, 'holder-1');
        assert.equal(state.authError, null);
        assert.equal(state.isLoading, false);
      } finally {
        env.cleanup();
      }
    });

    it('36. Genuine deactivated-account 403 classifies as ACCOUNT_DEACTIVATED and invalidates session', async () => {
      const suspendedErr = {
        response: {
          status: 403,
          data: { message: 'User account suspended by compliance administrator.' },
        },
      };
      const classifiedSuspended = classifyAuthError(suspendedErr);
      assert.equal(classifiedSuspended.type, 'ACCOUNT_DEACTIVATED');
      assert.equal(classifiedSuspended.isSessionInvalid, true);

      const env = createMockBroadcastEnv();
      try {
        setAccessToken('active-before-deactivation');
        const startEpoch = getAuthEpoch();

        api.defaults.adapter = async (config) => {
          const err = new Error('Forbidden');
          err.config = config;
          err.response = {
            status: 403,
            data: { message: 'User account is deactivated. Contact administrator.' },
          };
          throw err;
        };

        await assert.rejects(
          async () => {
            await api.get('/accounts');
          },
          (err) => err?.response?.status === 403
        );

        assert.equal(getAccessToken(), null, 'Deactivated 403 must clear access token');
        assert.equal(getAuthEpoch() > startEpoch, true, 'Deactivated 403 must bump auth epoch');
        assert.equal(
          env.dispatchedEvents.some(
            (e) => e.type === 'ledgerline:session_expired' && e.detail?.reason === 'deactivated'
          ),
          true,
          'Deactivated 403 must dispatch deactivated session_expired event'
        );
        assert.equal(
          env.receivedBroadcasts.some(
            (m) => m.type === 'SESSION_EXPIRED' && m.payload?.reason === 'deactivated'
          ),
          true,
          'Deactivated 403 must broadcast SESSION_EXPIRED'
        );

        // Verify AuthContext initialization also invalidates session & finishes loading on genuine 403 deactivation
        const state = { user: null, token: null, isLoading: true, authError: null };
        await executeAuthInitialization({
          isMounted: () => true,
          setUser: (u) => {
            state.user = u;
          },
          setToken: (t) => {
            state.token = t;
          },
          setIsLoading: (l) => {
            state.isLoading = l;
          },
          setAuthError: (e) => {
            state.authError = e;
          },
          authServiceImpl: {
            refreshToken: async () => ({
              token: 'token-before-deactivation',
              user: { id: 'u-deact', fullName: 'Deactivated User', role: 'ACCOUNT_HOLDER', isActive: true },
            }),
            getCurrentUser: async () => api.get('/auth/me'),
          },
        });

        assert.equal(state.user, null);
        assert.equal(state.token, null);
        assert.equal(getAccessToken(), null);
        assert.match(state.authError, /deactivated/i);
        assert.equal(state.isLoading, false);
      } finally {
        env.cleanup();
      }
    });

    it('37. Response interceptor rejects stale replay even when refresh resolves with a token right before epoch transition, and enforces single retry', async () => {
      let releaseRefresh;
      const refreshGate = new Promise((resolve) => {
        releaseRefresh = resolve;
      });
      const apiCalls = [];

      setAccessToken('user-a-token');

      rawAuthClient.defaults.adapter = async (config) => {
        await refreshGate;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'user-a-refreshed-token', user: { id: 'user-a' } } },
        };
      };

      api.defaults.adapter = async (config) => {
        apiCalls.push({ url: config.url, retry: Boolean(config._retry), auth: config.headers?.Authorization });
        const unauth = new Error('Unauthorized');
        unauth.config = config;
        unauth.response = { status: 401, data: { message: 'Token expired' } };
        throw unauth;
      };

      // Pre-existing in-flight refresh in User A's epoch; simulate session transition right as it resolves
      const sharedRefresh = requestTokenRefresh();
      const transitionDone = sharedRefresh.then(() => {
        bumpAuthEpoch();
        setAccessToken('user-b-active-token');
      });

      // Request dispatched in User A's epoch receives 401 and joins sharedRefresh
      const reqAssertion = assert.rejects(
        api.get('/accounts'),
        (err) => err?.response?.status === 401
      );

      await new Promise((r) => setTimeout(r, 10));
      releaseRefresh();

      await Promise.all([transitionDone, reqAssertion]);
      assert.equal(apiCalls.filter((c) => c.url === '/accounts').length, 1, 'Must never replay after epoch changed post-refresh');
      assert.equal(getAccessToken(), 'user-b-active-token', 'User B token must remain untouched');

      // Also verify retry limit (at most 1 retry when two consecutive 401s occur in the same epoch)
      apiCalls.length = 0;
      let refreshCount = 0;
      rawAuthClient.defaults.adapter = async (config) => {
        refreshCount += 1;
        return {
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
          data: { data: { token: 'refreshed-once-token', user: { id: 'user-b' } } },
        };
      };

      await assert.rejects(
        api.get('/accounts'),
        (err) => err?.response?.status === 401
      );
      assert.equal(refreshCount, 1, 'Must only refresh once for a failing request');
      assert.equal(apiCalls.length, 2, 'Must attempt original request + at most 1 retry (no infinite loop)');
    });
  });

  describe('AuthContext Provider Transition Guards (StrictMode)', () => {
    it('38. Pending logout followed by successful login preserves the new user, token, and storage under StrictMode', async () => {
      const storage = createMockLocalStorage({
        ledgerline_token: 'legacy-token',
        ledgerline_user: '{"id":"legacy"}',
      });
      globalThis.localStorage = storage;

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      const logoutDispatched = createDeferred();
      const logoutDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/logout') {
          logoutDispatched.resolve();
          await logoutDeferred.promise;
          return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
        }
        if (config.url === '/auth/login') {
          const email = JSON.parse(config.data).email;
          if (email === 'alice@test.com') {
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config,
              data: {
                data: {
                  token: 'alice-token',
                  user: { id: 'alice-1', fullName: 'Alice', role: 'ACCOUNT_HOLDER', isActive: true },
                },
              },
            };
          }
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              data: {
                token: 'bob-token',
                user: { id: 'bob-2', fullName: 'Bob', role: 'ADMIN', isActive: true },
              },
            },
          };
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        const aliceLogin = await mounted.getState().login('alice@test.com', 'Pass@123456');
        assert.equal(aliceLogin.success, true);
        await mounted.flush();
        assert.equal(mounted.getState().user.id, 'alice-1');

        // Start logout (pending on backend) then immediately log in as Bob
        const pendingLogout = mounted.getState().logout();
        await logoutDispatched.promise;

        // Re-populate legacy keys to prove stale logout finally does not run cleanup over newer login
        storage.setItem('ledgerline_token', 'newer-marker');
        storage.setItem('ledgerline_user', 'newer-user');

        const bobLogin = await mounted.getState().login('bob@test.com', 'Pass@123456');
        assert.equal(bobLogin.success, true);
        await mounted.flush();
        assert.equal(mounted.getState().user.id, 'bob-2');
        assert.equal(mounted.getState().token, 'bob-token');
        assert.equal(getAccessToken(), 'bob-token');

        // Resolve the old pending logout; Bob's state and token must remain intact
        logoutDeferred.resolve();
        await pendingLogout;
        await mounted.flush();

        const finalState = mounted.getState();
        assert.equal(finalState.user?.id, 'bob-2', 'Stale logout must not clear newer user');
        assert.equal(finalState.token, 'bob-token', 'Stale logout must not clear newer token');
        assert.equal(finalState.isAuthenticated, true);
        assert.equal(finalState.authError, null);
        assert.equal(getAccessToken(), 'bob-token', 'Stale logout must not clear in-memory access token');
        assert.equal(storage.has('ledgerline_token'), true, 'Stale logout must not clear storage after newer login');
        assert.equal(storage.has('ledgerline_user'), true);

        // Regression: a newer login's loading state remains true if an older logout finishes afterward
        const secondLogoutDispatched = createDeferred();
        const secondLogoutDeferred = createDeferred();
        const carolLoginDispatched = createDeferred();
        const carolLoginDeferred = createDeferred();

        api.defaults.adapter = async (config) => {
          if (config.url === '/auth/logout') {
            secondLogoutDispatched.resolve();
            await secondLogoutDeferred.promise;
            return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
          }
          if (config.url === '/auth/login') {
            carolLoginDispatched.resolve();
            return await carolLoginDeferred.promise;
          }
          return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
        };

        const staleLogoutPromise = mounted.getState().logout();
        await secondLogoutDispatched.promise;

        const carolLoginPromise = mounted.getState().login('carol@test.com', 'Pass@123456');
        await carolLoginDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        secondLogoutDeferred.resolve();
        await staleLogoutPromise;
        await mounted.flush();

        assert.equal(
          mounted.getState().isLoading,
          true,
          'Older logout finishing must not clear newer login loading state'
        );

        carolLoginDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/login' },
          data: {
            data: {
              token: 'carol-token',
              user: { id: 'carol-3', fullName: 'Carol', role: 'ACCOUNT_HOLDER', isActive: true },
            },
          },
        });
        const carolResult = await carolLoginPromise;
        await mounted.flush();
        assert.equal(carolResult.success, true);
        assert.equal(mounted.getState().isLoading, false);
        assert.equal(mounted.getState().user?.id, 'carol-3');
        assert.equal(mounted.getState().token, 'carol-token');
      } finally {
        mounted.unmount();
      }
    });

    it('39. Stale login failure after a newer login must not set an old error or clear the newer loading state', async () => {
      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      const firstDispatched = createDeferred();
      const firstDeferred = createDeferred();
      const secondDispatched = createDeferred();
      const secondDeferred = createDeferred();

      let firstConfig = null;
      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/login') {
          const email = JSON.parse(config.data).email;
          if (email === 'first@test.com') {
            firstConfig = config;
            firstDispatched.resolve();
            await firstDeferred.promise;
          }
          if (email === 'second@test.com') {
            secondDispatched.resolve();
            return await secondDeferred.promise;
          }
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        const firstLoginPromise = mounted.getState().login('first@test.com', 'WrongPass@1');
        await firstDispatched.promise;

        const secondLoginPromise = mounted.getState().login('second@test.com', 'GoodPass@1');
        await secondDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        // Stale first login fails while second login is still in flight
        const staleLoginErr = new Error('Unauthorized');
        staleLoginErr.config = firstConfig;
        staleLoginErr.response = { status: 401, data: { message: 'Invalid credentials for first user' } };
        firstDeferred.reject(staleLoginErr);

        const firstResult = await firstLoginPromise;
        await mounted.flush();

        assert.deepEqual(firstResult, { success: false, error: 'Invalid credentials for first user' });
        assert.equal(mounted.getState().authError, null, 'Stale login failure must not overwrite authError');
        assert.equal(mounted.getState().isLoading, true, 'Stale login failure must not clear active login loading state');

        // Second login succeeds cleanly
        secondDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/login' },
          data: {
            data: {
              token: 'second-login-token',
              user: { id: 'user-2', fullName: 'Second User', role: 'ACCOUNT_HOLDER', isActive: true },
            },
          },
        });

        const secondResult = await secondLoginPromise;
        await mounted.flush();

        assert.equal(secondResult.success, true);
        assert.equal(mounted.getState().isLoading, false);
        assert.equal(mounted.getState().authError, null);
        assert.equal(mounted.getState().token, 'second-login-token');
        assert.equal(mounted.getState().user.id, 'user-2');
        assert.equal(getAccessToken(), 'second-login-token');
      } finally {
        mounted.unmount();
      }
    });

    it('40. Stale registration failure after logout must not overwrite logout state', async () => {
      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      const registerDispatched = createDeferred();
      const registerDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/register') {
          registerDispatched.resolve();
          await registerDeferred.promise;
        }
        if (config.url === '/auth/logout') {
          return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        const registerPromise = mounted.getState().register('Alice Test', 'alice@test.com', 'Pass@123456');
        await registerDispatched.promise;

        await mounted.getState().logout();
        await mounted.flush();
        assert.equal(mounted.getState().user, null);
        assert.equal(mounted.getState().token, null);
        assert.equal(mounted.getState().authError, null);
        assert.equal(
          mounted.getState().isLoading,
          false,
          'Logout completing while registration is pending must reset isLoading to false'
        );

        // Delayed registration failure arrives after logout
        const conflictErr = new Error('Conflict');
        conflictErr.response = { status: 409, data: { message: 'Email already registered' } };
        registerDeferred.reject(conflictErr);

        const registerResult = await registerPromise;
        await mounted.flush();

        assert.deepEqual(registerResult, { success: false, error: 'Email already registered' });
        assert.equal(mounted.getState().authError, null, 'Stale registration error must not overwrite logout state');
        assert.equal(mounted.getState().user, null);
        assert.equal(mounted.getState().token, null);
        assert.equal(getAccessToken(), null);

        // Non-stale registration failure still populates authError and clears loading
        const directFailureDeferred = createDeferred();
        api.defaults.adapter = async (config) => {
          if (config.url === '/auth/register') {
            return await directFailureDeferred.promise;
          }
          return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
        };
        const normalRegPromise = mounted.getState().register('Bob Test', 'bob@test.com', 'Pass@123456');
        directFailureDeferred.reject(conflictErr);
        const normalResult = await normalRegPromise;
        await mounted.flush();
        assert.deepEqual(normalResult, { success: false, error: 'Email already registered' });
        assert.equal(mounted.getState().authError, 'Email already registered');
        assert.equal(mounted.getState().isLoading, false);
      } finally {
        mounted.unmount();
      }
    });

    it('41. Delayed refreshUser() response after a session transition must not overwrite the current user', async () => {
      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      const meDispatched = createDeferred();
      const meDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/login') {
          const email = JSON.parse(config.data).email;
          if (email === 'alice@test.com') {
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config,
              data: {
                data: {
                  token: 'alice-token',
                  user: { id: 'alice-1', fullName: 'Alice', role: 'ACCOUNT_HOLDER', isActive: true },
                },
              },
            };
          }
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              data: {
                token: 'bob-token',
                user: { id: 'bob-2', fullName: 'Bob', role: 'ADMIN', isActive: true },
              },
            },
          };
        }
        if (config.url === '/auth/logout') {
          return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
        }
        if (config.url === '/auth/me') {
          meDispatched.resolve();
          return await meDeferred.promise;
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        await mounted.getState().login('alice@test.com', 'Pass@123456');
        await mounted.flush();
        assert.equal(mounted.getState().user.id, 'alice-1');

        // Start refreshUser() under Alice's session
        const staleRefreshUserPromise = mounted.getState().refreshUser();
        await meDispatched.promise;

        // Transition session: logout Alice, then log in as Bob
        await mounted.getState().logout();
        await mounted.getState().login('bob@test.com', 'Pass@123456');
        await mounted.flush();
        assert.equal(mounted.getState().user.id, 'bob-2');
        assert.equal(mounted.getState().user.fullName, 'Bob');

        // Delayed /auth/me for Alice resolves
        meDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/me' },
          data: {
            data: {
              user: { id: 'alice-1', fullName: 'Alice Stale Profile', role: 'ACCOUNT_HOLDER', isActive: true },
              accounts: [],
            },
          },
        });

        await staleRefreshUserPromise;
        await mounted.flush();

        assert.equal(mounted.getState().user.id, 'bob-2', 'Stale refreshUser() must not overwrite newer user');
        assert.equal(mounted.getState().user.fullName, 'Bob');

        // Same-session refreshUser() still updates current user profile
        api.defaults.adapter = async (config) => {
          if (config.url === '/auth/me') {
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              config,
              data: {
                data: {
                  user: { id: 'bob-2', fullName: 'Bob Updated', role: 'ADMIN', isActive: true },
                  accounts: [],
                },
              },
            };
          }
          return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
        };

        await mounted.getState().refreshUser();
        await mounted.flush();
        assert.equal(mounted.getState().user.fullName, 'Bob Updated');
      } finally {
        mounted.unmount();
      }
    });

    it('42. Cross-tab LOGOUT and SESSION_EXPIRED clear obsolete loading state while stale events preserve newer loading state', async () => {
      const env = createMockBroadcastEnv();
      const externalTab = new env.MockBroadcastChannel('ledgerline_auth_channel');

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      let loginDispatched = createDeferred();
      let loginDeferred = createDeferred();
      let registerDispatched = createDeferred();
      let registerDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/login') {
          loginDispatched.resolve();
          return await loginDeferred.promise;
        }
        if (config.url === '/auth/register') {
          registerDispatched.resolve();
          return await registerDeferred.promise;
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        // 1. Current cross-tab LOGOUT while login() is pending clears obsolete isLoading
        const obsoleteLoginPromise = mounted.getState().login('obsolete@test.com', 'Pass@123456');
        await loginDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        externalTab.postMessage({ type: 'LOGOUT', payload: {} });
        await mounted.flush();
        assert.equal(
          mounted.getState().isLoading,
          false,
          'Current cross-tab LOGOUT must clear obsolete login loading state'
        );

        loginDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/login' },
          data: {
            data: {
              token: 'obsolete-token',
              user: { id: 'obs-1', fullName: 'Obsolete', role: 'ACCOUNT_HOLDER', isActive: true },
            },
          },
        });
        const obsRes = await obsoleteLoginPromise;
        await mounted.flush();
        assert.equal(obsRes.success, false);
        assert.equal(mounted.getState().user, null);
        assert.equal(mounted.getState().isLoading, false);

        // 2. Current cross-tab SESSION_EXPIRED while register() is pending clears obsolete isLoading
        const obsoleteRegisterPromise = mounted.getState().register('Obs User', 'obs2@test.com', 'Pass@123456');
        await registerDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        externalTab.postMessage({
          type: 'SESSION_EXPIRED',
          payload: { reason: 'unauthorized', message: 'Session expired in another tab.' },
        });
        await mounted.flush();
        assert.equal(
          mounted.getState().isLoading,
          false,
          'Current cross-tab SESSION_EXPIRED must clear obsolete register loading state'
        );
        assert.equal(mounted.getState().authError, 'Session expired in another tab.');

        const regErr = new Error('Server Error');
        regErr.config = { url: '/auth/register' };
        regErr.response = { status: 500, data: { message: 'Boom' } };
        registerDeferred.reject(regErr);
        await obsoleteRegisterPromise;
        await mounted.flush();
        assert.equal(mounted.getState().authError, 'Session expired in another tab.');

        // 3. Stale LOGOUT / SESSION_EXPIRED events must NOT clear a newer login's loading state
        // Simulate asynchronous same-tab BroadcastChannel delivery: logout broadcasts LOGOUT at t=0,
        // login starts at t=1, then the delayed LOGOUT message arrives on AuthContext's channel at t=2.
        const delayedDeliveries = [];
        const originalPostMessage = env.MockBroadcastChannel.prototype.postMessage;
        let holdBroadcasts = true;
        env.MockBroadcastChannel.prototype.postMessage = function (data) {
          if (holdBroadcasts && data?.type === 'LOGOUT') {
            delayedDeliveries.push(() => originalPostMessage.call(this, data));
            return;
          }
          return originalPostMessage.call(this, data);
        };

        const priorLogoutPromise = mounted.getState().logout();
        await priorLogoutPromise;
        holdBroadcasts = false;
        env.MockBroadcastChannel.prototype.postMessage = originalPostMessage;
        assert.equal(delayedDeliveries.length, 1);

        loginDispatched = createDeferred();
        loginDeferred = createDeferred();
        const newerLoginPromise = mounted.getState().login('newer@test.com', 'Pass@123456');
        await loginDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        // Deliver the delayed same-tab LOGOUT from t=0 + stale window session_expired with older epoch
        delayedDeliveries[0]();
        globalThis.window.dispatchEvent(
          new globalThis.CustomEvent('ledgerline:session_expired', {
            detail: {
              epoch: getAuthEpoch() - 1,
              reason: 'unauthorized',
              message: 'Stale expired error',
            },
          })
        );
        await mounted.flush();

        assert.equal(
          mounted.getState().isLoading,
          true,
          'Stale LOGOUT/SESSION_EXPIRED events must not clear newer login loading state'
        );
        assert.equal(mounted.getState().authError, null);

        loginDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/login' },
          data: {
            data: {
              token: 'newer-token',
              user: { id: 'new-1', fullName: 'Newer User', role: 'ACCOUNT_HOLDER', isActive: true },
            },
          },
        });
        const newerRes = await newerLoginPromise;
        await mounted.flush();
        assert.equal(newerRes.success, true);
        assert.equal(mounted.getState().user?.id, 'new-1');
        assert.equal(mounted.getState().token, 'newer-token');
        assert.equal(mounted.getState().isLoading, false);
      } finally {
        externalTab.close();
        mounted.unmount();
        env.cleanup();
      }
    });
  });

  describe('Cross-Tab Event Identity & Ordering Protocol', () => {
    function createSimulatedExternalTab(
      env,
      senderId = `external-tab-${Math.random().toString(36).slice(2, 10)}`
    ) {
      const channel = new env.MockBroadcastChannel('ledgerline_auth_channel');
      let seq = 0;
      let tabClock = 0;

      const createEnvelope = (type, payload = {}, { epoch = 1, issuedAt = Date.now() } = {}) => {
        seq += 1;
        let clockScope = 'tab';
        if (typeof globalThis.localStorage !== 'undefined') {
          const prev =
            Number.parseInt(
              globalThis.localStorage.getItem('ledgerline_auth_causal_clock') || '0',
              10
            ) || 0;
          tabClock = Math.max(tabClock, prev) + 1;
          globalThis.localStorage.setItem('ledgerline_auth_causal_clock', String(tabClock));
          clockScope = 'shared';
        } else {
          tabClock += 1;
        }
        return {
          type,
          payload,
          meta: {
            eventId: `${senderId}:${seq}:evt`,
            senderId,
            senderSeq: seq,
            causalClock: tabClock,
            clockScope,
            issuedAt,
            epoch,
          },
        };
      };

      return {
        createEnvelope,
        emit: (type, payload = {}, opts = {}) => {
          const envelope = createEnvelope(type, payload, opts);
          channel.postMessage(envelope);
          return envelope;
        },
        postEnvelope: (envelope) => {
          channel.postMessage(envelope);
        },
        close: () => channel.close(),
      };
    }

    it('43. External LOGOUT clears pending login loading state regardless of sender tab-local epoch', async () => {
      const env = createMockBroadcastEnv();
      const externalTab = createSimulatedExternalTab(env, 'external-tab-logout');

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      // Advance local authEpoch so it diverges completely from the external tab's local epoch
      bumpAuthEpoch();
      bumpAuthEpoch();
      bumpAuthEpoch();

      const loginDispatched = createDeferred();
      const loginDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/login') {
          loginDispatched.resolve();
          return await loginDeferred.promise;
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        const pendingLogin = mounted.getState().login('pending@test.com', 'Pass@123456');
        await loginDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        // External tab has tab-local epoch: 1 (different from local epoch), must still take effect
        externalTab.emit('LOGOUT', {}, { epoch: 1 });
        await mounted.flush();

        assert.equal(mounted.getState().isLoading, false, 'External LOGOUT must clear pending login loading state');
        assert.equal(mounted.getState().user, null);
        assert.equal(mounted.getState().token, null);
        assert.equal(getAccessToken(), null);

        loginDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/login' },
          data: {
            data: {
              token: 'obsolete-login-token',
              user: { id: 'u-obs', fullName: 'Obsolete User', role: 'ACCOUNT_HOLDER', isActive: true },
            },
          },
        });

        const loginResult = await pendingLogin;
        await mounted.flush();
        assert.equal(loginResult.success, false);
        assert.equal(mounted.getState().user, null);
        assert.equal(mounted.getState().token, null);
        assert.equal(getAccessToken(), null);
        assert.equal(mounted.getState().isLoading, false);
      } finally {
        externalTab.close();
        mounted.unmount();
        env.cleanup();
      }
    });

    it('44. External SESSION_EXPIRED clears pending registration loading state regardless of sender tab-local epoch', async () => {
      const env = createMockBroadcastEnv();
      const externalTab = createSimulatedExternalTab(env, 'external-tab-expired');

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      const registerDispatched = createDeferred();
      const registerDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/register') {
          registerDispatched.resolve();
          return await registerDeferred.promise;
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        const pendingRegister = mounted.getState().register('Reg User', 'reg@test.com', 'Pass@123456');
        await registerDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        externalTab.emit(
          'SESSION_EXPIRED',
          { reason: 'deactivated', message: 'Account deactivated by administrator.' },
          { epoch: 99 }
        );
        await mounted.flush();

        assert.equal(
          mounted.getState().isLoading,
          false,
          'External SESSION_EXPIRED must clear pending registration loading state'
        );
        assert.equal(mounted.getState().user, null);
        assert.equal(mounted.getState().token, null);
        assert.equal(getAccessToken(), null);
        assert.match(mounted.getState().authError, /deactivated/i);

        const regErr = new Error('Conflict');
        regErr.config = { url: '/auth/register' };
        regErr.response = { status: 409, data: { message: 'Email already in use' } };
        registerDeferred.reject(regErr);

        const regResult = await pendingRegister;
        await mounted.flush();
        assert.equal(regResult.success, false);
        assert.match(mounted.getState().authError, /deactivated/i);
        assert.equal(mounted.getState().isLoading, false);
      } finally {
        externalTab.close();
        mounted.unmount();
        env.cleanup();
      }
    });

    it('45. Delayed same-tab LOGOUT broadcast cannot overwrite a newer login in progress or completed', async () => {
      const env = createMockBroadcastEnv();
      const relayChannel = new env.MockBroadcastChannel('ledgerline_auth_channel');
      const capturedSameTabLogouts = [];

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      let loginDispatched = createDeferred();
      let loginDeferred = createDeferred();

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/logout') {
          return { status: 200, statusText: 'OK', headers: {}, config, data: { success: true } };
        }
        if (config.url === '/auth/login') {
          loginDispatched.resolve();
          return await loginDeferred.promise;
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const originalPostMessage = env.MockBroadcastChannel.prototype.postMessage;
      let interceptLogout = true;
      env.MockBroadcastChannel.prototype.postMessage = function (data) {
        if (interceptLogout && data?.type === 'LOGOUT') {
          capturedSameTabLogouts.push(data);
          return;
        }
        return originalPostMessage.call(this, data);
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        await mounted.getState().logout();
        interceptLogout = false;
        env.MockBroadcastChannel.prototype.postMessage = originalPostMessage;

        assert.equal(capturedSameTabLogouts.length, 1);
        const sameTabEnvelope = capturedSameTabLogouts[0];
        assert.equal(sameTabEnvelope.meta?.senderId, getAuthTabId());
        assert.ok(sameTabEnvelope.meta?.eventId);
        assert.equal(typeof sameTabEnvelope.meta?.senderSeq, 'number');
        assert.equal(typeof sameTabEnvelope.meta?.epoch, 'number');

        const loginPromise = mounted.getState().login('bob@test.com', 'Pass@123456');
        await loginDispatched.promise;
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true);

        // Even if the delayed same-tab LOGOUT arrives asynchronously on the channel while login is pending...
        relayChannel.postMessage(sameTabEnvelope);
        await mounted.flush();
        assert.equal(mounted.getState().isLoading, true, 'Delayed same-tab LOGOUT must not abort newer pending login');

        loginDeferred.resolve({
          status: 200,
          statusText: 'OK',
          headers: {},
          config: { url: '/auth/login' },
          data: {
            data: {
              token: 'bob-fresh-token',
              user: { id: 'bob-1', fullName: 'Bob', role: 'ADMIN', isActive: true },
            },
          },
        });
        const loginRes = await loginPromise;
        await mounted.flush();
        assert.equal(loginRes.success, true);

        // ...and if re-delivered after login completed, it still must not overwrite the newer session
        relayChannel.postMessage(sameTabEnvelope);
        await mounted.flush();

        assert.equal(mounted.getState().user?.id, 'bob-1');
        assert.equal(mounted.getState().token, 'bob-fresh-token');
        assert.equal(mounted.getState().isAuthenticated, true);
        assert.equal(getAccessToken(), 'bob-fresh-token');
      } finally {
        env.MockBroadcastChannel.prototype.postMessage = originalPostMessage;
        relayChannel.close();
        mounted.unmount();
        env.cleanup();
      }
    });

    it('46. Delayed external events cannot overwrite a newer local login', async () => {
      globalThis.localStorage = createMockLocalStorage();
      const env = createMockBroadcastEnv();
      const externalTab = createSimulatedExternalTab(env, 'external-tab-delayed');

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      api.defaults.adapter = async (config) => {
        if (config.url === '/auth/login') {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            config,
            data: {
              data: {
                token: 'local-bob-token',
                user: { id: 'bob-local', fullName: 'Local Bob', role: 'ADMIN', isActive: true },
              },
            },
          };
        }
        return { status: 200, statusText: 'OK', headers: {}, config, data: {} };
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        // 1. External tab emits LOGOUT before the local login happens, but delivery is delayed
        const delayedExternalLogout = externalTab.createEnvelope('LOGOUT', {}, { epoch: 500 });

        // 2. Local tab completes a newer login
        const loginRes = await mounted.getState().login('bob@test.com', 'Pass@123456');
        assert.equal(loginRes.success, true);
        await mounted.flush();
        assert.equal(mounted.getState().user?.id, 'bob-local');

        // 3. Delayed external LOGOUT now arrives (strictly older shared causal clock)
        externalTab.postEnvelope(delayedExternalLogout);
        await mounted.flush();

        assert.equal(mounted.getState().user?.id, 'bob-local', 'Delayed external LOGOUT must not clear newer local login');
        assert.equal(mounted.getState().token, 'local-bob-token');
        assert.equal(mounted.getState().isAuthenticated, true);
        assert.equal(getAccessToken(), 'local-bob-token');

        // 4. Also verify delayed external SESSION_EXPIRED without shared storage (earlier issuedAt) is ignored
        delete globalThis.localStorage;
        const staleTimestampExpired = externalTab.createEnvelope(
          'SESSION_EXPIRED',
          { reason: 'unauthorized', message: 'Stale external expiration' },
          { issuedAt: Date.now() - 5000 }
        );
        externalTab.postEnvelope(staleTimestampExpired);
        await mounted.flush();

        assert.equal(mounted.getState().user?.id, 'bob-local');
        assert.equal(mounted.getState().token, 'local-bob-token');
        assert.equal(mounted.getState().authError, null);
        assert.equal(getAccessToken(), 'local-bob-token');
      } finally {
        externalTab.close();
        mounted.unmount();
        env.cleanup();
      }
    });

    it('47. Two genuine cross-tab transitions are processed cleanly in causal order', async () => {
      globalThis.localStorage = createMockLocalStorage();
      const env = createMockBroadcastEnv();
      const externalTabA = createSimulatedExternalTab(env, 'external-tab-a');
      const externalTabB = createSimulatedExternalTab(env, 'external-tab-b');

      rawAuthClient.defaults.adapter = async () => {
        const err = new Error('Unauthorized');
        err.response = { status: 401, data: { message: 'Refresh token is required' } };
        throw err;
      };

      const mounted = mountAuthProvider({ strictMode: true });
      try {
        await mounted.waitForState((s) => s.isLoading === false);

        // Transition 1: External Tab A (with high local epoch) logs in as Alice
        const loginEnvelope = externalTabA.emit(
          'LOGIN',
          {
            token: 'cross-tab-alice-token',
            user: { id: 'alice-ext', fullName: 'External Alice', role: 'ACCOUNT_HOLDER', isActive: true },
          },
          { epoch: 42 }
        );
        await mounted.flush();

        assert.equal(mounted.getState().user?.id, 'alice-ext');
        assert.equal(mounted.getState().token, 'cross-tab-alice-token');
        assert.equal(mounted.getState().isAuthenticated, true);
        assert.equal(getAccessToken(), 'cross-tab-alice-token');

        // Duplicate delivery of Transition 1 (same eventId) is ignored idempotently
        externalTabA.postEnvelope(loginEnvelope);
        await mounted.flush();
        assert.equal(mounted.getState().user?.id, 'alice-ext');

        // Transition 2: External Tab B (with smaller tab-local epoch: 1 < 42) performs genuine LOGOUT
        externalTabB.emit('LOGOUT', {}, { epoch: 1 });
        await mounted.flush();

        assert.equal(mounted.getState().user, null, 'Second genuine cross-tab transition must log out the session');
        assert.equal(mounted.getState().token, null);
        assert.equal(mounted.getState().isAuthenticated, false);
        assert.equal(mounted.getState().isLoading, false);
        assert.equal(getAccessToken(), null);

        // Subsequent genuine transition from External Tab A (seq: 2): SESSION_EXPIRED followed by newer LOGIN
        externalTabA.emit('SESSION_EXPIRED', { reason: 'unauthorized', message: 'Expired elsewhere' }, { epoch: 43 });
        await mounted.flush();
        assert.equal(mounted.getState().authError, 'Expired elsewhere');

        externalTabA.emit(
          'LOGIN',
          {
            token: 'cross-tab-bob-token',
            user: { id: 'bob-ext', fullName: 'External Bob', role: 'ADMIN', isActive: true },
          },
          { epoch: 44 }
        );
        await mounted.flush();
        assert.equal(mounted.getState().user?.id, 'bob-ext');
        assert.equal(mounted.getState().token, 'cross-tab-bob-token');
        assert.equal(mounted.getState().authError, null);
        assert.equal(mounted.getState().isAuthenticated, true);
        assert.equal(getAccessToken(), 'cross-tab-bob-token');
      } finally {
        externalTabA.close();
        externalTabB.close();
        mounted.unmount();
        env.cleanup();
      }
    });
  });
});
