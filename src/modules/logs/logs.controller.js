import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as logsService from './logs.service.js';

export const listLogs = asyncHandler(async (req, res) => {
  const result = await logsService.getLogs(req.query);
  return ApiResponse.success(res, result, 'Logs retrieved successfully');
});

export const getLog = asyncHandler(async (req, res) => {
  const result = await logsService.getLogDetails(req.params.id);
  return ApiResponse.success(res, result, 'Log retrieved successfully');
});

export const purgeOldLogs = asyncHandler(async (req, res) => {
  const result = await logsService.clearOldLogs();
  return ApiResponse.success(res, result, `تم تنظيف ${result.deletedCount} سجل قديم`);
});
