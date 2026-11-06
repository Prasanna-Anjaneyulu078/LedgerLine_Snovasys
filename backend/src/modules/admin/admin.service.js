import { userRepository } from '../../repositories/user.repository.js';
import { accountRepository } from '../../repositories/account.repository.js';
import { auditRepository } from '../../repositories/audit.repository.js';
import { AppError } from '../../utils/appError.js';
import { formatRupees } from '../../utils/money.js';

export class AdminService {
  async getAllUsers(query = {}) {
    return userRepository.findAll(query);
  }

  async getAllAccounts(query = {}) {
    const result = await accountRepository.findAll(query);
    return {
      ...result,
      accounts: result.accounts.map((acc) => ({
        ...acc,
        balancePaise: acc.balance.toString(),
        balanceFormatted: formatRupees(acc.balance),
      })),
    };
  }

  async updateUserStatus(userId, isActive, adminUser, context = {}) {
    const user = await userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found');
    }

    if (user.id === adminUser.id && !isActive) {
      throw AppError.badRequest('Administrators cannot deactivate their own account');
    }

    const updated = await userRepository.updateStatus(userId, isActive);

    await auditRepository.create({
      actorId: adminUser.id,
      action: 'ADMIN_USER_STATUS_UPDATED',
      resourceType: 'USER',
      resourceId: userId,
      metadata: { previousStatus: user.is_active, newStatus: isActive },
      ipAddress: context.ipAddress,
    });

    return updated;
  }

  async updateAccountStatus(accountId, status, adminUser, context = {}) {
    const account = await accountRepository.findByIdOrAccountNumber(accountId);
    if (!account) {
      throw AppError.notFound('Account not found');
    }

    const validStatuses = ['ACTIVE', 'FROZEN', 'CLOSED'];
    if (!validStatuses.includes(status)) {
      throw AppError.badRequest(`Invalid account status. Permitted: ${validStatuses.join(', ')}`);
    }

    const updated = await accountRepository.updateStatus(account.id, status);

    await auditRepository.create({
      actorId: adminUser.id,
      action: 'ADMIN_ACCOUNT_STATUS_UPDATED',
      resourceType: 'ACCOUNT',
      resourceId: account.id,
      metadata: { previousStatus: account.status, newStatus: status, accountNumber: account.account_number },
      ipAddress: context.ipAddress,
    });

    return updated;
  }
}

export const adminService = new AdminService();

