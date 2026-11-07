import { adminService } from './admin.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class AdminController {
  getDashboardOverview = asyncHandler(async (req, res) => {
    const result = await adminService.getDashboardOverview();
    res.status(200).json(ApiResponse.success(result, 'Admin dashboard telemetry retrieved successfully'));
  });

  getAllUsers = asyncHandler(async (req, res) => {
    const result = await adminService.getAllUsers(req.query);
    res.status(200).json(ApiResponse.success(result, 'System users retrieved successfully'));
  });

  getAllAccounts = asyncHandler(async (req, res) => {
    const result = await adminService.getAllAccounts(req.query);
    res.status(200).json(ApiResponse.success(result, 'System accounts retrieved successfully'));
  });

  updateUserStatus = asyncHandler(async (req, res) => {
    const context = { ipAddress: req.ip || req.connection?.remoteAddress };
    const { isActive } = req.body;
    const result = await adminService.updateUserStatus(req.params.userId, isActive, req.user, context);
    res.status(200).json(ApiResponse.success(result, 'User status updated successfully'));
  });

  updateAccountStatus = asyncHandler(async (req, res) => {
    const context = { ipAddress: req.ip || req.connection?.remoteAddress };
    const { status } = req.body;
    const result = await adminService.updateAccountStatus(req.params.accountId, status, req.user, context);
    res.status(200).json(ApiResponse.success(result, 'Account status updated successfully'));
  });
}

export const adminController = new AdminController();

