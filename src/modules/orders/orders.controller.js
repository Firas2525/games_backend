import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import * as ordersService from './orders.service.js';
import { sendAdminNotification, getFcmDiagnostics, sendDirectTokenPush } from '../../config/firebaseAdmin.js';

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

export const getProfitReports = asyncHandler(async (req, res) => {
  const result = await ordersService.getProfitReportsAdmin(req.query);
  return ApiResponse.success(res, result, 'تم جلب تقارير الأرباح والمبيعات بنجاح');
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

export const testAdminNotification = asyncHandler(async (req, res) => {
  const result = await sendAdminNotification({
    title: 'طلب جديد',
    body: 'هذا إشعار تجريبي لاختبار وصول التنبيهات إلى جهاز المدير بنجاح!',
    data: {
      type: 'test_notification',
      timestamp: String(Date.now()),
    },
  });

  if (!result.success) {
    return ApiResponse.error(
      res,
      `فشل إرسال الإشعار: ${result.error || result.reason || 'تأكد من إضافة FIREBASE_SERVICE_ACCOUNT على Render'}`,
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }

  return ApiResponse.success(res, result, 'تم إرسال الإشعار التجريبي بنجاح عبر Firebase');
});

export const getFcmDiagnosticsHandler = asyncHandler(async (req, res) => {
  const diagnostics = await getFcmDiagnostics();
  return ApiResponse.success(res, diagnostics, 'FCM diagnostics retrieved successfully');
});

export const testDirectTokenHandler = asyncHandler(async (req, res) => {
  const token = req.query.token || req.body?.token;
  if (!token) {
    return ApiResponse.error(res, 'Token is required', HTTP_STATUS.BAD_REQUEST);
  }
  const result = await sendDirectTokenPush(token, {
    title: req.query.title || 'إشعار فوري مباشر 🎮',
    body: req.query.body || 'هذا فحص فوري للتأكد من وصول الإشعار المباشر لجهازك!',
  });
  return ApiResponse.success(res, result, result.success ? 'Delivered' : 'Failed');
});

