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

export const updateCategory = asyncHandler(async (req, res) => {
  const product = await productsService.updateProductMainCategory(
    req.params.id,
    req.body.mainCategory
  );
  return ApiResponse.success(res, product, 'تم تحديث التصنيف الرئيسي للمنتج بنجاح');
});

export const updateCategoryGroup = asyncHandler(async (req, res) => {
  const result = await productsService.updateCategoryGroup(
    req.body.category,
    req.body.mainCategory
  );
  return ApiResponse.success(res, result, 'تم تحديث تصنيف جميع منتجات هذه الفئة بنجاح');
});

export const getUserList = asyncHandler(async (req, res) => {
  const result = await productsService.getUserProducts(req.query);
  return ApiResponse.success(res, result, 'User products fetched successfully');
});

export const getDetails = asyncHandler(async (req, res) => {
  const result = await productsService.getProductDetails(req.params.id);
  return ApiResponse.success(res, result, 'Product details fetched successfully');
});
