import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as depositsService from './deposits.service.js';

// User: Get active deposit methods
export const getActiveMethods = asyncHandler(async (req, res) => {
  const methods = await depositsService.getActiveDepositMethods();
  return ApiResponse.success(res, methods, 'تم جلب طرق الإيداع المتاحة بنجاح');
});

// User: Submit deposit request
export const submitDeposit = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const deposit = await depositsService.createDepositRequest({
    ...req.body,
    userId,
  });
  return ApiResponse.success(res, deposit, 'تم إرسال طلب الإيداع بنجاح وهو قيد المراجعة');
});

// User: Get their deposit requests
export const getMyDeposits = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const deposits = await depositsService.getUserDeposits(userId);
  return ApiResponse.success(res, deposits, 'تم جلب طلبات الإيداع الخاصة بك بنجاح');
});

// Admin: Get all deposit requests with filters
export const getAdminDeposits = asyncHandler(async (req, res) => {
  const result = await depositsService.getAdminDeposits(req.query);
  return ApiResponse.success(res, result, 'تم جلب طلبات الإيداع للإدارة بنجاح');
});

// Admin: Accept deposit
export const acceptDeposit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.user.id || req.user._id;
  const adminEmail = req.user.email || '';
  const result = await depositsService.acceptDeposit({
    depositId: id,
    adminId,
    adminEmail,
  });
  return ApiResponse.success(res, result, result.message);
});

// Admin: Reject deposit
export const rejectDeposit = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.user.id || req.user._id;
  const adminEmail = req.user.email || '';
  const result = await depositsService.rejectDeposit({
    depositId: id,
    rejectionReason: reason,
    adminId,
    adminEmail,
  });
  return ApiResponse.success(res, result, result.message);
});

// Admin: Get all deposit methods
export const getAllMethodsAdmin = asyncHandler(async (req, res) => {
  const methods = await depositsService.getAllMethodsAdmin();
  return ApiResponse.success(res, methods, 'تم جلب وسائل الإيداع بنجاح');
});

// Admin: Create deposit method
export const createMethod = asyncHandler(async (req, res) => {
  const method = await depositsService.createDepositMethod(req.body);
  return ApiResponse.success(res, method, 'تمت إضافة طريقة الإيداع بنجاح');
});

// Admin: Update deposit method
export const updateMethod = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const method = await depositsService.updateDepositMethod(id, req.body);
  return ApiResponse.success(res, method, 'تم تحديث طريقة الإيداع بنجاح');
});

// Admin: Toggle deposit method active
export const toggleMethod = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const method = await depositsService.toggleDepositMethod(id);
  return ApiResponse.success(res, method, 'تم تغيير حالة طريقة الإيداع بنجاح');
});

// Admin: Delete deposit method
export const deleteMethod = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const result = await depositsService.deleteDepositMethod(id);
  return ApiResponse.success(res, result, result.message);
});
