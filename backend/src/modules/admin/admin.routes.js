import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

const adminRouter = Router();

adminRouter.use(authenticate);
adminRouter.use(authorize('ADMIN'));

adminRouter.get('/dashboard', adminController.getDashboardOverview);
adminRouter.get('/users', adminController.getAllUsers);
adminRouter.get('/accounts', adminController.getAllAccounts);
adminRouter.patch('/users/:userId/status', adminController.updateUserStatus);
adminRouter.patch('/accounts/:accountId/status', adminController.updateAccountStatus);

export { adminRouter };

