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

export const deleteBatchLogs = asyncHandler(async (req, res) => {
  const { ids } = req.body;
  const result = await logsService.deleteLogsBatch(ids);
  return ApiResponse.success(res, result, `تم حذف ${result.deletedCount} سجل بنجاح`);
});

export const deleteSingleLog = asyncHandler(async (req, res) => {
  const result = await logsService.deleteSingleLog(req.params.id);
  return ApiResponse.success(res, result, 'تم حذف السجل بنجاح');
});

export const deleteAllLogs = asyncHandler(async (req, res) => {
  const result = await logsService.deleteAllProviderLogs();
  return ApiResponse.success(res, result, `تم إفراغ كافة سجلات المزودين (${result.deletedCount} سجل)`);
});

export const purgeOldLogs = asyncHandler(async (req, res) => {
  const result = await logsService.clearOldLogs();
  return ApiResponse.success(res, result, `تم تنظيف ${result.deletedCount} سجل قديم`);
});
