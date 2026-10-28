import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as settingsService from './settings.service.js';

export const getSettings = asyncHandler(async (req, res) => {
  const result = await settingsService.getSettings();
  return ApiResponse.success(res, result, 'Settings fetched successfully');
});

export const updateSettings = asyncHandler(async (req, res) => {
  const result = await settingsService.updateSettings(req.body);
  return ApiResponse.success(res, result, 'تم تحديث الإعدادات ونسبة الربح بنجاح');
});

export const getTicker = asyncHandler(async (req, res) => {
  const result = await settingsService.getTickerSettings();
  return ApiResponse.success(res, result, 'Ticker settings fetched successfully');
});

export const updateTicker = asyncHandler(async (req, res) => {
  const result = await settingsService.updateTickerSettings(req.body);
  return ApiResponse.success(res, result, 'تم تحديث شريط الإعلانات المتحرك بنجاح');
});

