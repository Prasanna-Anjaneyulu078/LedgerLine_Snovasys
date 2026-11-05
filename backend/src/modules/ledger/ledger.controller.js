import { ledgerService } from './ledger.service.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

export class LedgerController {
  getAllLedgerEntries = asyncHandler(async (req, res) => {
    const result = await ledgerService.getAllLedgerEntries(req.query);
    res.status(200).json(ApiResponse.success(result, 'Ledger entries retrieved successfully'));
  });

  getAccountLedgerEntries = asyncHandler(async (req, res) => {
    const result = await ledgerService.getAccountLedgerEntries(req.params.accountId, req.user, req.query);
    res.status(200).json(ApiResponse.success(result, 'Account ledger retrieved successfully'));
  });
}

export const ledgerController = new LedgerController();

