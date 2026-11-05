import { AppError } from '../utils/appError.js';
import { accountRepository } from '../repositories/account.repository.js';

/**
 * Restricts access to specified user roles (e.g. ADMIN, AUDITOR, ACCOUNT_HOLDER)
 * @param {...string} allowedRoles
 */
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(AppError.unauthorized('Authentication required'));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          `Access forbidden: required role [${allowedRoles.join(', ')}], current role is [${req.user.role}]`
        )
      );
    }

    next();
  };
}

/**
 * Enforces account-level authorization:
 * - ADMIN and AUDITOR can access for administrative / audit purposes.
 * - ACCOUNT_HOLDER can ONLY access accounts they own.
 * @param {string} accountIdParamKey - name of request parameter containing accountId (default 'accountId')
 */
export function authorizeAccountAccess(accountIdParamKey = 'accountId') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized('Authentication required'));
      }

      const accountId = req.params[accountIdParamKey];
      if (!accountId) {
        return next(AppError.badRequest(`Missing account parameter: ${accountIdParamKey}`));
      }

      const account = await accountRepository.findById(accountId);
      if (!account) {
        return next(AppError.notFound('Account not found'));
      }

      // Admins and auditors have broad inspection privileges
      if (req.user.role === 'ADMIN' || req.user.role === 'AUDITOR') {
        req.targetAccount = account;
        return next();
      }

      // Account holders must be the owner of the account
      if (account.owner_id !== req.user.id) {
        return next(AppError.forbidden('You do not have permission to access this account'));
      }

      req.targetAccount = account;
      next();
    } catch (error) {
      next(error);
    }
  };
}

