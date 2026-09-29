import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
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
