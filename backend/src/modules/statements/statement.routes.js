import { Router } from 'express';
import { statementController } from './statement.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorizeAccountAccess } from '../../middleware/authorize.js';

const statementRouter = Router();

statementRouter.use(authenticate);

statementRouter.get('/:accountNumber', authorizeAccountAccess('accountNumber'), statementController.getStatement);

export { statementRouter };

