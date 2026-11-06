import { Router } from 'express';
import { accountController } from './account.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAccountAccess } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import {
  createAccountSchema,
  accountIdParamSchema,
  statementQuerySchema,
} from './account.validation.js';

const accountRouter = Router();

// All account routes require authentication
accountRouter.use(authenticate);

accountRouter.post(
  '/',
  authorize('ADMIN', 'ACCOUNT_HOLDER'),
  validate(createAccountSchema),
  accountController.createAccount
);

accountRouter.get('/', accountController.getAccounts);

accountRouter.get(
  '/:accountNumber',
  validate(accountIdParamSchema, 'params'),
  authorizeAccountAccess('accountNumber'),
  accountController.getAccountById
);

accountRouter.get(
  '/:accountNumber/balance',
  validate(accountIdParamSchema, 'params'),
  authorizeAccountAccess('accountNumber'),
  accountController.getAccountBalance
);

accountRouter.get(
  '/:accountNumber/statement',
  validate(accountIdParamSchema, 'params'),
  validate(statementQuerySchema, 'query'),
  authorizeAccountAccess('accountNumber'),
  accountController.getAccountStatement
);

export { accountRouter };

