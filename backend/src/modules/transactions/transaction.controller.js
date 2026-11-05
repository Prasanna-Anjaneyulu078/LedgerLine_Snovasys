import { transactionService } from './transaction.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class TransactionController {
  deposit = asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || null;
    const context = { ipAddress: req.ip || req.connection?.remoteAddress };

    const result = await transactionService.deposit(req.body, req.user, idempotencyKey, context);
    res.status(200).json(ApiResponse.success(result, 'Deposit processed successfully'));
  });

  withdraw = asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || null;
    const context = { ipAddress: req.ip || req.connection?.remoteAddress };

    const result = await transactionService.withdraw(req.body, req.user, idempotencyKey, context);
    res.status(200).json(ApiResponse.success(result, 'Withdrawal processed successfully'));
  });

  transfer = asyncHandler(async (req, res) => {
    const idempotencyKey = req.headers['idempotency-key'] || null;
    const context = { ipAddress: req.ip || req.connection?.remoteAddress };

    const result = await transactionService.transfer(req.body, req.user, idempotencyKey, context);
    res.status(200).json(ApiResponse.success(result, 'Transfer completed successfully'));
  });

  getTransactions = asyncHandler(async (req, res) => {
    const result = await transactionService.getTransactions(req.user, req.query);
    res.status(200).json(ApiResponse.success(result, 'Transactions retrieved successfully'));
  });

  getTransactionById = asyncHandler(async (req, res) => {
    const result = await transactionService.getTransactionById(req.params.transactionId, req.user);
    res.status(200).json(ApiResponse.success(result, 'Transaction details retrieved successfully'));
  });
}

export const transactionController = new TransactionController();

