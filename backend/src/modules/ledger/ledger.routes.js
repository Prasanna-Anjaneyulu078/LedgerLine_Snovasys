import { Router } from 'express';
import { ledgerController } from './ledger.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, authorizeAccountAccess } from '../../middleware/authorize.js';

const ledgerRouter = Router();

ledgerRouter.use(authenticate);

ledgerRouter.get('/', authorize('ADMIN', 'AUDITOR'), ledgerController.getAllLedgerEntries);
ledgerRouter.get('/:accountNumber', authorizeAccountAccess('accountNumber'), ledgerController.getAccountLedgerEntries);

export { ledgerRouter };

