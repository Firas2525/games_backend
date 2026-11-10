import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { User } from './users.model.js';
import * as usersService from './users.service.js';

export const getUsers = asyncHandler(async (req, res) => {
  const users = await usersService.getAllUsers(req.query);
  return ApiResponse.success(res, users, 'Users retrieved successfully');
});

export const getUser = asyncHandler(async (req, res) => {
  const user = await usersService.getUserById(req.params.id);
  return ApiResponse.success(res, user, 'User retrieved successfully');
});

export const toggleStatus = asyncHandler(async (req, res) => {
  const user = await usersService.toggleUserStatus(req.params.id);
  return ApiResponse.success(res, user, 'User status updated successfully');
});

export const deposit = asyncHandler(async (req, res) => {
  const result = await usersService.depositBalance({
    userId: req.params.id,
    amount: req.body.amount,
    note: req.body.note,
    adminId: req.user._id,
  });
  return ApiResponse.success(res, result, 'Balance recharged successfully');
});

export const deduct = asyncHandler(async (req, res) => {
  const result = await usersService.deductBalance({
    userId: req.params.id,
    amount: req.body.amount,
    note: req.body.note,
    adminId: req.user._id,
  });
  return ApiResponse.success(res, result, 'Balance deducted successfully');
});

export const getTransactions = asyncHandler(async (req, res) => {
  const transactions = await usersService.getUserTransactions(req.params.id);
  return ApiResponse.success(res, transactions, 'User transactions retrieved successfully');
});

export const getMyTransactions = asyncHandler(async (req, res) => {
  const transactions = await usersService.getUserTransactions(req.user._id);
  return ApiResponse.success(res, transactions, 'My transactions retrieved successfully');
});

export const getMyFinancialSummary = asyncHandler(async (req, res) => {
  const summary = await usersService.getUserFinancialSummary(req.user._id);
  return ApiResponse.success(res, summary, 'User financial summary retrieved successfully');
});

export const getAllTransactionsHandler = asyncHandler(async (req, res) => {
  const transactions = await usersService.getAllTransactions(req.query);
  return ApiResponse.success(res, transactions, 'All operations logs retrieved successfully');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { password } = req.body;
  const user = await usersService.updateUserPassword(req.params.id, password);
  return ApiResponse.success(res, user, 'User password updated successfully');
});

export const updateLevel = asyncHandler(async (req, res) => {
  const { manualLevel } = req.body;
  const user = await usersService.updateUserLevel(req.params.id, manualLevel);
  return ApiResponse.success(res, user, 'User level updated successfully');
});

export const updateFcmToken = asyncHandler(async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return ApiResponse.error(res, 'FCM Token is required', HTTP_STATUS.BAD_REQUEST);
  }
  await User.findByIdAndUpdate(req.user._id, { fcmToken: String(token).trim() });
  return ApiResponse.success(res, { token }, 'FCM token updated successfully');
});

export const getCoinsInfoHandler = asyncHandler(async (req, res) => {
  const result = await usersService.getCoinsInfo(req.user._id);
  return ApiResponse.success(res, result, 'Coins info retrieved successfully');
});

export const redeemCoinsHandler = asyncHandler(async (req, res) => {
  const { amountCoins } = req.body;
  const result = await usersService.redeemCoins(req.user._id, amountCoins);
  return ApiResponse.success(res, result, result.message);
});

export const updateMyProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id || req.user.id;
  const { name, phone, avatar } = req.body;

  const user = await User.findById(userId);
  if (!user) {
    return ApiResponse.error(res, 'المستخدم غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (name !== undefined) {
    const trimmed = String(name).trim();
    if (trimmed.length < 2) {
      return ApiResponse.error(res, 'يجب أن يتكون الاسم من حرفين على الأقل', HTTP_STATUS.BAD_REQUEST);
    }
    if (trimmed.length > 50) {
      return ApiResponse.error(res, 'لا يمكن أن يتجاوز الاسم 50 حرفاً', HTTP_STATUS.BAD_REQUEST);
    }
    user.name = trimmed;
  }

  if (phone !== undefined) {
    user.phone = String(phone).trim();
  }

  if (avatar !== undefined) {
    user.avatar = String(avatar).trim();
  }

  await user.save();

  const updatedUser = await User.findById(userId);
  return ApiResponse.success(res, updatedUser, 'تم تحديث بيانات الحساب بنجاح ✅');
});

export const updateCustomProfit = asyncHandler(async (req, res) => {
  const { customProfitPercentage } = req.body;
  const user = await usersService.updateUserCustomProfit(req.params.id, customProfitPercentage);
  return ApiResponse.success(res, user, 'تم تحديث نسبة الربح المخصصة للمستخدم بنجاح ✅');
});

export const purgeAllUsersHandler = asyncHandler(async (req, res) => {
  const result = await usersService.purgeAllUsers(req.user._id, req.body.confirmation);
  return ApiResponse.success(res, result, result.message);
});




