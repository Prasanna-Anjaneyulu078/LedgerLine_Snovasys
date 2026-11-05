import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { userRepository } from '../../repositories/user.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { AppError } from '../../utils/appError.js';

export class AuthService {
  /**
   * Register a new user
   */
  async register({ fullName, email, password, role = 'ACCOUNT_HOLDER' }, context = {}) {
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

    return {
      user: sanitizedUser,
      token,
    };
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

