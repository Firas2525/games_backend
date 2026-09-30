import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as productsService from './products.service.js';

export const sync = asyncHandler(async (req, res) => {
  const result = await productsService.syncAllProducts();
  return ApiResponse.success(res, result, 'Products synced successfully from providers');
});

export const getAdminList = asyncHandler(async (req, res) => {
  const result = await productsService.getAdminProducts(req.query);
  return ApiResponse.success(res, result, 'Admin products fetched successfully');
});

export const toggleVisibility = asyncHandler(async (req, res) => {
  const product = await productsService.toggleProductVisibility(req.params.id);
  const statusMsg = product.isVisible ? 'تم تفعيل ظهور المنتج' : 'تم إخفاء المنتج من التطبيق';
  return ApiResponse.success(res, product, statusMsg);
});

export const getUserList = asyncHandler(async (req, res) => {
  const result = await productsService.getUserProducts(req.query);
  return ApiResponse.success(res, result, 'User products fetched successfully');
});
