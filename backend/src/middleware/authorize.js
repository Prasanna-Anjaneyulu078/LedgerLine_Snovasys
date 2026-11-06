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
 * Resolves both public account numbers (e.g. LL-ACC-1001) and internal account UUIDs.
 * Sets req.targetAccount, req.params.accountId, and req.params.accountNumber.
 * @param {string} accountIdParamKey - name of request parameter containing identifier
 */
export function authorizeAccountAccess(accountIdParamKey = 'accountNumber') {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return next(AppError.unauthorized('Authentication required'));
      }

      const identifier =
        req.params[accountIdParamKey] ||
        req.params.accountNumber ||
        req.params.accountId ||
        req.params.id;

      if (!identifier) {
        return next(AppError.badRequest(`Missing account parameter: ${accountIdParamKey}`));
      }

      const account = await accountRepository.findByIdOrAccountNumber(identifier);
      if (!account) {
        return next(AppError.notFound('Account not found'));
      }

      req.targetAccount = account;
      req.params.accountId = account.id;
      req.params.accountNumber = account.account_number;

      // Admins and auditors have broad inspection privileges
      if (req.user.role === 'ADMIN' || req.user.role === 'AUDITOR') {
        return next();
      }

      // Account holders must be the owner of the account
      if (account.owner_id !== req.user.id) {
        return next(AppError.forbidden('You do not have permission to access this account'));
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

