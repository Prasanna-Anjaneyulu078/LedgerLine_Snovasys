import { authService } from './auth.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';
import {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  getClearCookieOptions,
} from '../../utils/cookie.js';

export class AuthController {
  register = asyncHandler(async (req, res) => {
    const context = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'] || null,
    };
    const { fullName, email, password } = req.body;
    const result = await authService.register({ fullName, email, password }, context);

    // Set persistent HttpOnly refresh token cookie
    if (result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());
    }

    // Strip refreshToken from response body so it is never exposed to JavaScript
    const { refreshToken, ...data } = result;
    res.status(201).json(ApiResponse.created(data, 'User registered successfully'));
  });

  login = asyncHandler(async (req, res) => {
    const context = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'] || null,
    };
    const result = await authService.login(req.body, context);

    // Set persistent HttpOnly refresh token cookie
    if (result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());
    }

    // Strip refreshToken from response body so it is never exposed to JavaScript
    const { refreshToken, ...data } = result;
    res.status(200).json(ApiResponse.success(data, 'Login successful'));
  });

  refreshToken = asyncHandler(async (req, res) => {
    const context = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'] || null,
    };
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    const result = await authService.rotateRefreshToken(rawToken, context);

    // Set new rotated HttpOnly refresh token cookie
    if (result.refreshToken) {
      res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, getRefreshCookieOptions());
    }

    const { refreshToken, ...data } = result;
    res.status(200).json(ApiResponse.success(data, 'Token refreshed successfully'));
  });

  logout = asyncHandler(async (req, res) => {
    const context = {
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers['user-agent'] || null,
    };
    const rawToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;

    if (rawToken) {
      await authService.logout(rawToken, context);
    }

    // Clear persistent HttpOnly cookie with identical attributes
    res.clearCookie(REFRESH_COOKIE_NAME, getClearCookieOptions());
    res.status(200).json(ApiResponse.success(null, 'Logged out successfully'));
  });

  getMe = asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user.id);
    res.status(200).json(ApiResponse.success(user, 'User profile retrieved successfully'));
  });
}

export const authController = new AuthController();

