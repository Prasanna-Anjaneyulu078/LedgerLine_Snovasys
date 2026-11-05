import { Router } from 'express';
import { auditController } from './audit.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const auditRouter = Router();

auditRouter.use(authenticate);

// Restricted to ADMIN and AUDITOR roles
auditRouter.get('/', authorize('ADMIN', 'AUDITOR'), auditController.getAuditEvents);

export { auditRouter };

