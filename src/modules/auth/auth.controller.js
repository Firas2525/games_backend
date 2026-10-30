import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import {
  registerUser,
  loginUser,
  adminLogin,
  verifyTwoFactorLogin,
  googleAuthLogin,
  setupTwoFactor,
  enableTwoFactor,
  disableTwoFactor,
} from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  return ApiResponse.created(res, result, 'User registered successfully');
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  return ApiResponse.success(res, result, 'Login processed');
});

export const verify2faLoginHandler = asyncHandler(async (req, res) => {
  const result = await verifyTwoFactorLogin(req.body);
  return ApiResponse.success(res, result, 'تم التحقق وتسجيل الدخول بنجاح');
});

export const googleLoginHandler = asyncHandler(async (req, res) => {
  const result = await googleAuthLogin(req.body);
  return ApiResponse.success(res, result, 'تم تسجيل الدخول عبر Google بنجاح');
});

export const setup2faHandler = asyncHandler(async (req, res) => {
  const result = await setupTwoFactor(req.user._id || req.user.id);
  return ApiResponse.success(res, result, 'تم إنشاء مفتاح Google Authenticator');
});

export const enable2faHandler = asyncHandler(async (req, res) => {
  const result = await enableTwoFactor(req.user._id || req.user.id, req.body?.code);
  return ApiResponse.success(res, result, 'تم تفعيل المصادقة الثنائية بنجاح');
});

export const disable2faHandler = asyncHandler(async (req, res) => {
  const result = await disableTwoFactor(req.user._id || req.user.id, req.body?.code);
  return ApiResponse.success(res, result, 'تم إيقاف المصادقة الثنائية بنجاح');
});

export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, req.user, 'Current user profile fetched successfully');
});

export const adminLoginHandler = asyncHandler(async (req, res) => {
  const result = await adminLogin(req.body);
  return ApiResponse.success(res, result, 'Admin login successful');
});
