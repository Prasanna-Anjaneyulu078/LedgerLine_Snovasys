import { Router } from 'express';
import { statementController } from './statement.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeAccountAccess } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { statementQuerySchema } from '../accounts/account.validation.js';

const statementRouter = Router();

statementRouter.use(authenticate);

statementRouter.get(
  '/:accountNumber',
  validate(statementQuerySchema, 'query'),
  authorizeAccountAccess('accountNumber'),
  statementController.getStatement
);

export { statementRouter };

