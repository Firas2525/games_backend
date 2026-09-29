import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import { registerUser, loginUser } from './auth.service.js';

export const register = asyncHandler(async (req, res) => {
  const result = await registerUser(req.body);
  return ApiResponse.created(res, result, 'User registered successfully');
});

export const login = asyncHandler(async (req, res) => {
  const result = await loginUser(req.body);
  return ApiResponse.success(res, result, 'Login successful');
});

export const getMe = asyncHandler(async (req, res) => {
  return ApiResponse.success(res, req.user, 'Current user profile fetched successfully');
});
