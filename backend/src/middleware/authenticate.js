import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { userRepository } from '../repositories/user.repository.js';
import { AppError } from '../utils/appError.js';

export async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw AppError.unauthorized('Missing or malformed Authorization header');
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
      throw AppError.unauthorized('Bearer token required');
    }

    let decoded;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw AppError.unauthorized('Authentication token has expired');
      }
      throw AppError.unauthorized('Invalid authentication token');
    }

    if (!decoded.id) {
      throw AppError.unauthorized('Malformed authentication token payload');
    }

    const user = await userRepository.findById(decoded.id);

    if (!user) {
      throw AppError.unauthorized('User associated with token no longer exists');
    }

    if (!user.is_active) {
      throw AppError.forbidden('User account is deactivated');
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

