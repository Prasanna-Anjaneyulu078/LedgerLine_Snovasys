import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { userRepository } from '../../repositories/user.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { refreshTokenRepository } from '../../repositories/refresh-token.repository.js';
import { AppError } from '../../utils/appError.js';

export class AuthService {
  /**
   * Register a new user
   * Public registration always assigns the ACCOUNT_HOLDER role.
   * Client-supplied role values are never accepted or used.
   */
  async register({ fullName, email, password }, context = {}) {
    const existingUser = await userRepository.findByEmail(email);
    if (existingUser) {
      await auditRepository.create({
        action: 'AUTH_REGISTER_FAILURE',
        resourceType: 'USER',
        metadata: { email, reason: 'Email already registered' },
        ipAddress: context.ipAddress,
      });
      throw AppError.conflict('A user with this email address already exists');
    }

    const passwordHash = await bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

    // Enforce server-side role assignment: public registration ALWAYS creates an ACCOUNT_HOLDER
    const role = 'ACCOUNT_HOLDER';

    const newUser = await userRepository.create({
      fullName,
      email,
      passwordHash,
      role,
    });

    await auditRepository.create({
      actorId: newUser.id,
      action: 'AUTH_REGISTER_SUCCESS',
      resourceType: 'USER',
      resourceId: newUser.id,
      metadata: { email: newUser.email, role: newUser.role },
      ipAddress: context.ipAddress,
    });

    const token = this.generateToken(newUser);
    const { refreshToken } = await this.generateRefreshToken(newUser.id, context);

    return {
      user: {
        id: newUser.id,
        fullName: newUser.full_name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.is_active,
        createdAt: newUser.created_at,
      },
      token,
      refreshToken,
    };
  }

  /**
   * Authenticate user with credentials
   */
  async login({ email, password }, context = {}) {
    const user = await userRepository.findByEmail(email);

    if (!user) {
      await auditRepository.create({
        action: 'AUTH_LOGIN_FAILURE',
        resourceType: 'USER',
        metadata: { email, reason: 'User not found' },
        ipAddress: context.ipAddress,
      });
      throw AppError.unauthorized('Invalid email or password');
    }

    if (!user.is_active) {
      await auditRepository.create({
        actorId: user.id,
        action: 'AUTH_LOGIN_REFUSED',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: { reason: 'User account is deactivated' },
        ipAddress: context.ipAddress,
      });
      throw AppError.forbidden('User account is deactivated. Contact administrator.');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await auditRepository.create({
        actorId: user.id,
        action: 'AUTH_LOGIN_FAILURE',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: { reason: 'Invalid password' },
        ipAddress: context.ipAddress,
      });
      throw AppError.unauthorized('Invalid email or password');
    }

    await auditRepository.create({
      actorId: user.id,
      action: 'AUTH_LOGIN_SUCCESS',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: context.ipAddress,
    });

    const sanitizedUser = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
    };

    const token = this.generateToken(sanitizedUser);
    const { refreshToken } = await this.generateRefreshToken(sanitizedUser.id, context);

    return {
      user: sanitizedUser,
      token,
      refreshToken,
    };
  }

  /**
   * Rotate refresh token and issue new access token
   * Detects reuse of previously rotated tokens for automated breach mitigation
   */
  async rotateRefreshToken(rawToken, context = {}) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw AppError.unauthorized('Refresh token is required');
    }

    const tokenHash = this.hashToken(rawToken);
    const record = await refreshTokenRepository.findByTokenHash(tokenHash);

    if (!record) {
      await auditRepository.create({
        action: 'AUTH_REFRESH_TOKEN_INVALID',
        resourceType: 'USER',
        metadata: { reason: 'Refresh token not recognized in system' },
        ipAddress: context.ipAddress,
      });
      throw AppError.unauthorized('Invalid or unrecognised refresh token');
    }

    // Reuse detection: If token is already revoked and was replaced by another, flag security breach
    if (record.revoked_at) {
      if (record.replaced_by_token_hash) {
        // Suspected token compromise: Revoke ALL active sessions for this user
        await refreshTokenRepository.revokeAllForUser(record.user_id);
        await auditRepository.create({
          actorId: record.user_id,
          action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
          resourceType: 'USER',
          resourceId: record.user_id,
          metadata: {
            compromisedTokenId: record.id,
            warning: 'Reused previously rotated refresh token. All active sessions terminated.',
          },
          ipAddress: context.ipAddress,
        });
        throw AppError.unauthorized('Security violation: Session token reuse detected. All sessions revoked.');
      }
      throw AppError.unauthorized('Refresh token has been revoked');
    }

    // Check expiration
    if (new Date(record.expires_at) <= new Date()) {
      throw AppError.unauthorized('Refresh token has expired. Please log in again.');
    }

    // Verify user status
    const user = await userRepository.findById(record.user_id);
    if (!user) {
      throw AppError.unauthorized('User associated with session no longer exists');
    }

    if (!user.is_active) {
      await auditRepository.create({
        actorId: user.id,
        action: 'AUTH_REFRESH_REFUSED',
        resourceType: 'USER',
        resourceId: user.id,
        metadata: { reason: 'User account deactivated' },
        ipAddress: context.ipAddress,
      });
      throw AppError.forbidden('User account is deactivated. Contact administrator.');
    }

    // Generate new rotated refresh token
    const newRawToken = crypto.randomBytes(40).toString('hex');
    const newTokenHash = this.hashToken(newRawToken);
    const maxAgeDays = Number(env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7;
    const newExpiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000);

    // Revoke old token and link to replacement token
    await refreshTokenRepository.revokeById(record.id, newTokenHash);

    // Persist new token record
    await refreshTokenRepository.create({
      userId: user.id,
      tokenHash: newTokenHash,
      expiresAt: newExpiresAt,
      userAgent: context.userAgent || null,
      ipAddress: context.ipAddress || null,
    });

    await auditRepository.create({
      actorId: user.id,
      action: 'AUTH_REFRESH_SUCCESS',
      resourceType: 'USER',
      resourceId: user.id,
      ipAddress: context.ipAddress,
    });

    const sanitizedUser = {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
    };

    const newAccessToken = this.generateToken(sanitizedUser);

    return {
      user: sanitizedUser,
      token: newAccessToken,
      refreshToken: newRawToken,
    };
  }

  /**
   * Invalidate refresh token session on user logout
   */
  async logout(rawToken, context = {}) {
    if (rawToken && typeof rawToken === 'string') {
      const tokenHash = this.hashToken(rawToken);
      const revoked = await refreshTokenRepository.revokeByTokenHash(tokenHash);

      if (revoked) {
        await auditRepository.create({
          actorId: revoked.user_id,
          action: 'AUTH_LOGOUT_SUCCESS',
          resourceType: 'USER',
          resourceId: revoked.user_id,
          ipAddress: context.ipAddress,
        });
      }
    }
    return true;
  }

  /**
   * Generate and persist a cryptographically secure refresh token
   */
  async generateRefreshToken(userId, context = {}) {
    const rawToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const maxAgeDays = Number(env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7;
    const expiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000);

    await refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      userAgent: context.userAgent || null,
      ipAddress: context.ipAddress || null,
    });

    return { refreshToken: rawToken, expiresAt };
  }

  /**
   * SHA-256 hash helper for refresh tokens
   */
  hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Get user profile with accounts
   */
  async getMe(userId) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    const accounts = await accountRepository.findByOwnerId(userId);

    return {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.role,
      isActive: user.is_active,
      createdAt: user.created_at,
      accounts: accounts.map((acc) => ({
        id: acc.id,
        accountNumber: acc.account_number,
        accountType: acc.account_type,
        currency: acc.currency,
        balance: acc.balance.toString(),
        status: acc.status,
      })),
    };
  }

  generateToken(user) {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: env.JWT_EXPIRES_IN }
    );
  }
}

export const authService = new AuthService();

