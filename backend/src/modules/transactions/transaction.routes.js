import { Router } from 'express';
import { transactionController } from './transaction.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { transactionLimiter } from '../../middleware/rateLimiter.js';
import {
  depositSchema,
  withdrawSchema,
  transferSchema,
  transactionIdParamSchema,
  transactionQuerySchema,
} from './transaction.validation.js';

const transactionRouter = Router();

transactionRouter.use(authenticate);

// Financial money-movement endpoints: strictly restricted to ACCOUNT_HOLDER
transactionRouter.post(
  '/deposit',
  authorize('ACCOUNT_HOLDER'),
  transactionLimiter,
  validate(depositSchema),
  transactionController.deposit
);

transactionRouter.post(
  '/withdraw',
  authorize('ACCOUNT_HOLDER'),
  transactionLimiter,
  validate(withdrawSchema),
  transactionController.withdraw
);

transactionRouter.post(
  '/transfer',
  authorize('ACCOUNT_HOLDER'),
  transactionLimiter,
  validate(transferSchema),
  transactionController.transfer
);

transactionRouter.get(
  '/',
  validate(transactionQuerySchema, 'query'),
  transactionController.getTransactions
);

transactionRouter.get(
  '/:transactionId',
  validate(transactionIdParamSchema, 'params'),
  transactionController.getTransactionById
);

export { transactionRouter };

