import { accountService } from './account.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class AccountController {
  createAccount = asyncHandler(async (req, res) => {
    const context = { ipAddress: req.ip || req.connection?.remoteAddress };
    const account = await accountService.createAccount(req.user.id, req.body, context);
    res.status(201).json(ApiResponse.created(account, 'Account created successfully'));
  });

  getAccounts = asyncHandler(async (req, res) => {
    const result = await accountService.getAccounts(req.user, req.query);
    res.status(200).json(ApiResponse.success(result, 'Accounts retrieved successfully'));
  });

  getAccountById = asyncHandler(async (req, res) => {
    const account = await accountService.getAccountById(req.params.accountId, req.user);
    res.status(200).json(ApiResponse.success(account, 'Account retrieved successfully'));
  });

  getAccountBalance = asyncHandler(async (req, res) => {
    const balance = await accountService.getAccountBalance(req.params.accountId, req.user);
    res.status(200).json(ApiResponse.success(balance, 'Balance retrieved successfully'));
  });

  getAccountStatement = asyncHandler(async (req, res) => {
    const statement = await accountService.getAccountStatement(req.params.accountId, req.user, req.query);
    res.status(200).json(ApiResponse.success(statement, 'Statement retrieved successfully'));
  });

  getRecipientAccount = asyncHandler(async (req, res) => {
    const recipient = await accountService.getRecipientAccount(req.params.accountNumber, req.user);
    res.status(200).json(ApiResponse.success(recipient, 'Recipient account verified'));
  });
}

export const accountController = new AccountController();

