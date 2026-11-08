import { env } from '../config/env.js';

export const REFRESH_COOKIE_NAME = 'ledgerline_refresh_token';

/**
 * Generates secure, environment-aware cookie options for the persistent refresh token
 */
export function getRefreshCookieOptions() {
  const isProd = env.NODE_ENV === 'production';
  const maxAgeDays = Number(env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7;

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: maxAgeDays * 24 * 60 * 60 * 1000,
  };
}

/**
 * Options used to clear the refresh token cookie upon logout or revocation
 */
export function getClearCookieOptions() {
  const isProd = env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
  };
}

