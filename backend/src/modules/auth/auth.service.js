import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { getClient } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { userRepository } from '../../repositories/user.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { refreshTokenRepository } from '../../repositories/refresh-token.repository.js';
import { AppError } from '../../utils/appError.js';

const LOST_RESPONSE_RECOVERY_WINDOW_SECONDS = 30;
const pendingLostResponseWrites = new Map();

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
   * Rotate refresh token and issue new access token inside an atomic row-locked transaction.
   * Detects reuse of previously rotated tokens for automated breach mitigation while supporting
   * single-use recovery strictly for server-observed premature response closures.
   */
  async rotateRefreshToken(rawToken, context = {}) {
    if (!rawToken || typeof rawToken !== 'string') {
      throw AppError.unauthorized('Refresh token is required');
    }

    const tokenHash = this.hashToken(rawToken);

    // Ensure any in-flight lost-response audit write for this exact token completes before checking recovery state
    const pendingWrite = pendingLostResponseWrites.get(tokenHash);
    if (pendingWrite) {
      await pendingWrite.catch(() => {});
    }

    const client = await getClient();
    let inTransaction = false;

    try {
      await client.query('BEGIN;');
      inTransaction = true;

      const record = await refreshTokenRepository.findByTokenHashForUpdate(tokenHash, client);

      if (!record) {
        await client.query('ROLLBACK;');
        inTransaction = false;
        await auditRepository.create({
          action: 'AUTH_REFRESH_TOKEN_INVALID',
          resourceType: 'USER',
          metadata: { reason: 'Refresh token not recognized in system' },
          ipAddress: context.ipAddress,
        });
        throw AppError.unauthorized('Invalid or unrecognised refresh token');
      }

      const buildSanitizedUser = (u) => ({
        id: u.id,
        fullName: u.full_name,
        email: u.email,
        role: u.role,
        isActive: u.is_active,
        createdAt: u.created_at,
      });

      const issueRotatedToken = async ({ targetRecord, auditAction, auditResourceType = 'USER', auditResourceId, auditMetadata = null }) => {
        const user = await userRepository.findById(targetRecord.user_id, client);
        if (!user) {
          await client.query('ROLLBACK;');
          inTransaction = false;
          throw AppError.unauthorized('User associated with session no longer exists');
        }

        if (!user.is_active) {
          await auditRepository.create(
            {
              actorId: user.id,
              action: 'AUTH_REFRESH_REFUSED',
              resourceType: 'USER',
              resourceId: user.id,
              metadata: { reason: 'User account deactivated' },
              ipAddress: context.ipAddress,
            },
            client
          );
          await client.query('COMMIT;');
          inTransaction = false;
          throw AppError.forbidden('User account is deactivated. Contact administrator.');
        }

        if (context.isClientAborted?.()) {
          await client.query('ROLLBACK;');
          inTransaction = false;
          return { aborted: true };
        }

        const newRawToken = crypto.randomBytes(40).toString('hex');
        const newTokenHash = this.hashToken(newRawToken);
        const maxAgeDays = Number(env.REFRESH_TOKEN_EXPIRES_IN_DAYS) || 7;
        const newExpiresAt = new Date(Date.now() + maxAgeDays * 24 * 60 * 60 * 1000);

        const revoked = await refreshTokenRepository.revokeById(targetRecord.id, newTokenHash, client);
        if (!revoked) {
          await client.query('ROLLBACK;');
          inTransaction = false;
          throw AppError.unauthorized('Refresh token has been revoked');
        }

        await refreshTokenRepository.create(
          {
            userId: user.id,
            tokenHash: newTokenHash,
            expiresAt: newExpiresAt,
            userAgent: context.userAgent || null,
            ipAddress: context.ipAddress || null,
          },
          client
        );

        await auditRepository.create(
          {
            actorId: user.id,
            action: auditAction,
            resourceType: auditResourceType,
            resourceId: auditResourceId,
            metadata: auditMetadata,
            ipAddress: context.ipAddress,
          },
          client
        );

        const sanitizedUser = buildSanitizedUser(user);
        const newAccessToken = this.generateToken(sanitizedUser);

        if (context.isClientAborted?.()) {
          await client.query('ROLLBACK;');
          inTransaction = false;
          return { aborted: true };
        }

        await client.query('COMMIT;');
        inTransaction = false;

        return {
          user: sanitizedUser,
          token: newAccessToken,
          refreshToken: newRawToken,
          rotatedFromTokenId: targetRecord.id,
          rotatedFromTokenHash: targetRecord.token_hash,
          newTokenHash,
        };
      };

      // Handle already-revoked tokens: single-use server-observed lost-response recovery vs genuine reuse detection
      if (record.revoked_at) {
        if (record.replaced_by_token_hash) {
          const lostState = await auditRepository.findRefreshResponseLostState(
            record.id,
            LOST_RESPONSE_RECOVERY_WINDOW_SECONDS,
            client
          );
          const hasOriginalUserAgent =
            typeof record.user_agent === 'string' && record.user_agent.trim().length > 0;
          const hasRetryUserAgent =
            typeof context.userAgent === 'string' && context.userAgent.trim().length > 0;
          const userAgentMatches =
            hasOriginalUserAgent && hasRetryUserAgent && record.user_agent === context.userAgent;

          if (lostState.hasRecentLostResponse && !lostState.alreadyRecovered && userAgentMatches) {
            const successor = await refreshTokenRepository.findByTokenHashForUpdate(
              record.replaced_by_token_hash,
              client
            );

            if (
              successor &&
              !successor.revoked_at &&
              !successor.replaced_by_token_hash &&
              new Date(successor.expires_at) > new Date()
            ) {
              const recoveredResult = await issueRotatedToken({
                targetRecord: successor,
                auditAction: 'AUTH_REFRESH_RECOVERY_SUCCESS',
                auditResourceType: 'REFRESH_TOKEN',
                auditResourceId: record.id,
                auditMetadata: {
                  recoveredSuccessorId: successor.id,
                  reason: 'Recovered rotation after server-observed premature response close',
                },
              });
              return { ...recoveredResult, recovered: true };
            }
          }

          // Genuine or ineligible token reuse: revoke ALL active sessions for this user and commit breach audit
          await refreshTokenRepository.revokeAllForUser(record.user_id, client);
          await auditRepository.create(
            {
              actorId: record.user_id,
              action: 'AUTH_REFRESH_TOKEN_REUSE_DETECTED',
              resourceType: 'USER',
              resourceId: record.user_id,
              metadata: {
                compromisedTokenId: record.id,
                warning: 'Reused previously rotated refresh token. All active sessions terminated.',
              },
              ipAddress: context.ipAddress,
            },
            client
          );
          await client.query('COMMIT;');
          inTransaction = false;
          throw AppError.unauthorized('Security violation: Session token reuse detected. All sessions revoked.');
        }

        await client.query('ROLLBACK;');
        inTransaction = false;
        throw AppError.unauthorized('Refresh token has been revoked');
      }

      if (new Date(record.expires_at) <= new Date()) {
        await client.query('ROLLBACK;');
        inTransaction = false;
        throw AppError.unauthorized('Refresh token has expired. Please log in again.');
      }

      return await issueRotatedToken({
        targetRecord: record,
        auditAction: 'AUTH_REFRESH_SUCCESS',
        auditResourceType: 'USER',
        auditResourceId: record.user_id,
      });
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK;').catch(() => {});
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record that a committed refresh rotation response failed to complete socket delivery.
   * Never stores raw tokens or hashes in audit metadata.
   */
  markRefreshResponseLost({ tokenId, userId, replacedTokenHash, ipAddress = null }) {
    if (!tokenId || !replacedTokenHash) {
      return Promise.resolve();
    }

    const writePromise = auditRepository
      .create({
        actorId: userId || null,
        action: 'AUTH_REFRESH_RESPONSE_LOST',
        resourceType: 'REFRESH_TOKEN',
        resourceId: String(tokenId),
        metadata: {
          reason: 'Client closed connection before refresh response completion',
        },
        ipAddress,
      })
      .catch((err) => {
        logger.error(
          {
            action: 'AUTH_REFRESH_RESPONSE_LOST',
            tokenId: String(tokenId),
            userId: userId || null,
            errorCode: err?.code || null,
            errorMessage: err?.message || 'Unknown audit persistence error',
          },
          'Failed to persist AUTH_REFRESH_RESPONSE_LOST audit event; lost-response recovery remains disabled (fail-closed)'
        );
        return null;
      })
      .finally(() => {
        if (pendingLostResponseWrites.get(replacedTokenHash) === writePromise) {
          pendingLostResponseWrites.delete(replacedTokenHash);
        }
      });

    pendingLostResponseWrites.set(replacedTokenHash, writePromise);
    return writePromise;
  }

  /**
   * Invalidate refresh token session on user logout inside an atomic row-locked transaction.
   * Follows replacement chain if the token was concurrently rotated before logout acquired the lock.
   */
  async logout(rawToken, context = {}) {
    if (!rawToken || typeof rawToken !== 'string') {
      return true;
    }

    const tokenHash = this.hashToken(rawToken);
    const client = await getClient();
    let inTransaction = false;

    try {
      await client.query('BEGIN;');
      inTransaction = true;

      let current = await refreshTokenRepository.findByTokenHashForUpdate(tokenHash, client);
      let revokedUserId = null;
      const visited = new Set();

      while (current && !visited.has(current.id)) {
        visited.add(current.id);
        if (!current.revoked_at) {
          const revoked = await refreshTokenRepository.revokeById(current.id, null, client);
          if (revoked) {
            revokedUserId = revoked.user_id;
          }
          break;
        }
        if (current.replaced_by_token_hash) {
          current = await refreshTokenRepository.findByTokenHashForUpdate(current.replaced_by_token_hash, client);
        } else {
          break;
        }
      }

      if (revokedUserId) {
        await auditRepository.create(
          {
            actorId: revokedUserId,
            action: 'AUTH_LOGOUT_SUCCESS',
            resourceType: 'USER',
            resourceId: revokedUserId,
            ipAddress: context.ipAddress,
          },
          client
        );
      }

      await client.query('COMMIT;');
      inTransaction = false;
      return true;
    } catch (error) {
      if (inTransaction) {
        await client.query('ROLLBACK;').catch(() => {});
      }
      throw error;
    } finally {
      client.release();
    }
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

