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
