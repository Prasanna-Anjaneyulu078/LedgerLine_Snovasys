import { statementService } from './statement.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class StatementController {
  getStatement = asyncHandler(async (req, res) => {
    const result = await statementService.getStatement(req.params.accountId, req.user, req.query);
    res.status(200).json(ApiResponse.success(result, 'Account statement generated successfully'));
  });
}

export const statementController = new StatementController();

