import { Router } from 'express';
import { transactionController } from './transaction.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
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

transactionRouter.post(
  '/deposit',
  transactionLimiter,
  validate(depositSchema),
  transactionController.deposit
);

transactionRouter.post(
  '/withdraw',
  transactionLimiter,
  validate(withdrawSchema),
  transactionController.withdraw
);

transactionRouter.post(
  '/transfer',
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

