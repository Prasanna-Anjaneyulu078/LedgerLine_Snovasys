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
  '/:accountId',
  validate(accountIdParamSchema, 'params'),
  authorizeAccountAccess('accountId'),
  accountController.getAccountById
);

accountRouter.get(
  '/:accountId/balance',
  validate(accountIdParamSchema, 'params'),
  authorizeAccountAccess('accountId'),
  accountController.getAccountBalance
);

accountRouter.get(
  '/:accountId/statement',
  validate(accountIdParamSchema, 'params'),
  validate(statementQuerySchema, 'query'),
  authorizeAccountAccess('accountId'),
  accountController.getAccountStatement
);

export { accountRouter };

