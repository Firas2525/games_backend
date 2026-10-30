import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as ordersService from './orders.service.js';

export const purchase = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const result = await ordersService.executePurchase({
    ...req.body,
    userId,
  });
  return ApiResponse.success(res, result, 'تم استقبال الطلب بنجاح');
});

export const getMyOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id || req.user._id;
  const result = await ordersService.getUserOrders(userId);
  return ApiResponse.success(res, result, 'تم جلب طلباتك بنجاح');
});

export const getAdminOrders = asyncHandler(async (req, res) => {
  const result = await ordersService.getAllOrdersAdmin(req.query);
  return ApiResponse.success(res, result, 'Admin orders fetched successfully');
});

export const getFinancialStats = asyncHandler(async (req, res) => {
  const result = await ordersService.getFinancialStatsAdmin();
  return ApiResponse.success(res, result, 'Financial statistics fetched successfully');
});

export const checkOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await ordersService.checkSingleOrder(orderId);
  return ApiResponse.success(res, result, 'تم فحص حالة الطلب من المزود بنجاح');
});

export const syncOrders = asyncHandler(async (req, res) => {
  const result = await ordersService.syncPendingOrders();
  return ApiResponse.success(res, result, `تم تحديث ${result.updatedCount} طلب من أصل ${result.checkedCount}`);
});

export const getCustomOrders = asyncHandler(async (req, res) => {
  const result = await ordersService.getCustomOrdersAdmin(req.query);
  return ApiResponse.success(res, result, 'Custom provider orders fetched successfully');
});

export const completeCustomOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await ordersService.completeCustomOrder(orderId, req.body);
  return ApiResponse.success(res, result, 'تم إكمال طلب المزود الخاص وتأكيده بنجاح');
});

export const rejectCustomOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await ordersService.cancelOrRejectCustomOrder(orderId, {
    reason: req.body?.reason,
    isReject: true,
  });
  return ApiResponse.success(res, result, 'تم رفض الطلب وإعادة الرصيد إلى محفظة المستخدم بنجاح');
});

export const cancelCustomOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const result = await ordersService.cancelOrRejectCustomOrder(orderId, {
    reason: req.body?.reason,
    isReject: false,
  });
  return ApiResponse.success(res, result, 'تم إلغاء الطلب واسترجاع المبلغ إلى محفظة المستخدم بنجاح');
});

