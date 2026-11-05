import { auditService } from './audit.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class AuditController {
  getAuditEvents = asyncHandler(async (req, res) => {
    const result = await auditService.getAuditEvents(req.query);
    res.status(200).json(ApiResponse.success(result, 'Audit events retrieved successfully'));
  });
}

export const auditController = new AuditController();

