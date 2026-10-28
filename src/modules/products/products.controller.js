import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as productsService from './products.service.js';

export const sync = asyncHandler(async (req, res) => {
  const result = await productsService.syncAllProducts();
  return ApiResponse.success(res, result, 'Products synced successfully from providers');
});

export const triggerSync = asyncHandler(async (req, res) => {
  const result = await productsService.syncAllProducts();
  return ApiResponse.success(res, result, 'Products catalog synchronized and classified successfully');
});

export const reclassify = asyncHandler(async (req, res) => {
  const result = await productsService.reclassifyAllProducts();
  return ApiResponse.success(res, result, result.message);
});

export const getAdminList = asyncHandler(async (req, res) => {
  const result = await productsService.getAdminProducts(req.query);
  return ApiResponse.success(res, result, 'Admin products fetched successfully');
});

export const getStats = asyncHandler(async (req, res) => {
  const result = await productsService.getCatalogStats();
  return ApiResponse.success(res, result, 'Catalog statistics fetched successfully');
});

export const toggleVisibility = asyncHandler(async (req, res) => {
  const product = await productsService.toggleProductVisibility(req.params.id);
  const statusMsg = product.isVisible ? 'تم تفعيل ظهور المنتج' : 'تم إخفاء المنتج من التطبيق';
  return ApiResponse.success(res, product, statusMsg);
});

export const bulkVisibility = asyncHandler(async (req, res) => {
  const { productIds, isVisible } = req.body;
  const result = await productsService.bulkUpdateProductsVisibility(productIds, isVisible);
  const statusMsg = isVisible !== false
    ? `تم تفعيل ${result.modifiedCount} منتج بنجاح في المتجر`
    : `تم إيقاف تفعيل ${result.modifiedCount} منتج بنجاح وإخفائها من المتجر`;
  return ApiResponse.success(res, result, statusMsg);
});

export const updateCategory = asyncHandler(async (req, res) => {
  const product = await productsService.updateProductMainCategory(
    req.params.id,
    req.body
  );
  return ApiResponse.success(res, product, 'تم تحديث تصنيف المنتج بنجاح');
});

export const updateCategoryGroup = asyncHandler(async (req, res) => {
  const result = await productsService.updateCategoryGroup(
    req.body.category,
    req.body.mainCategory
  );
  return ApiResponse.success(res, result, 'تم تحديث تصنيف جميع منتجات هذه الفئة بنجاح');
});

const extractUserCurrency = (req) => {
  return (
    req.user?.currency ||
    req.query.currency ||
    req.headers['x-user-currency'] ||
    null
  );
};

export const getCategories = asyncHandler(async (req, res) => {
  const userCurrency = extractUserCurrency(req);
  const result = await productsService.getAllCategories(userCurrency);
  return ApiResponse.success(res, result, 'Categories fetched successfully');
});

export const addCategory = asyncHandler(async (req, res) => {
  const result = await productsService.createCategory(req.body);
  return ApiResponse.success(res, result, 'تم إنشاء القسم الجديد بنجاح');
});

export const editCategory = asyncHandler(async (req, res) => {
  const result = await productsService.updateCategory(req.params.id, req.body);
  return ApiResponse.success(res, result, 'تم تحديث بيانات القسم بنجاح');
});

export const removeCategory = asyncHandler(async (req, res) => {
  const result = await productsService.deleteCategory(req.params.id);
  return ApiResponse.success(res, result, 'تم حذف القسم بنجاح');
});

export const bulkUpdateCategory = asyncHandler(async (req, res) => {
  const { productIds } = req.body;
  const result = await productsService.bulkUpdateProductsCategory(productIds, req.body);
  return ApiResponse.success(res, result, `تم نقل ${result.modifiedCount} منتج بنجاح`);
});

// Sub-Category handlers
export const getSubCategoriesList = asyncHandler(async (req, res) => {
  const userCurrency = extractUserCurrency(req);
  const result = await productsService.getSubCategories(req.query.mainCategory, userCurrency);
  return ApiResponse.success(res, result, 'Subcategories fetched successfully');
});

export const addSubCategory = asyncHandler(async (req, res) => {
  const result = await productsService.createSubCategory(req.body);
  return ApiResponse.success(res, result, 'تم إنشاء التصنيف الفرعي وتجميع المنتجات بنجاح');
});

export const editSubCategory = asyncHandler(async (req, res) => {
  const result = await productsService.updateSubCategory(req.params.id, req.body);
  return ApiResponse.success(res, result, 'تم تحديث بيانات التصنيف الفرعي بنجاح');
});

export const removeSubCategory = asyncHandler(async (req, res) => {
  const result = await productsService.deleteSubCategory(req.params.id);
  return ApiResponse.success(res, result, 'تم حذف التصنيف الفرعي بنجاح وإلغاء تجميع المنتجات');
});

export const bulkAssignSubCategory = asyncHandler(async (req, res) => {
  const result = await productsService.bulkAssignSubCategory(req.body);
  return ApiResponse.success(res, result, `تم تجميع ${result.modifiedCount} منتج في التصنيف الفرعي بنجاح`);
});

export const getUserList = asyncHandler(async (req, res) => {
  const userCurrency = extractUserCurrency(req);
  const result = await productsService.getUserProducts(req.query, userCurrency);
  return ApiResponse.success(res, result, 'User products fetched successfully');
});

export const getDetails = asyncHandler(async (req, res) => {
  const userCurrency = extractUserCurrency(req);
  const result = await productsService.getProductDetails(req.params.id, userCurrency);
  return ApiResponse.success(res, result, 'Product details fetched successfully');
});

export const updateDiscount = asyncHandler(async (req, res) => {
  const { productIds, discountPercent } = req.body;
  const ids = Array.isArray(productIds) ? productIds : (req.params.id ? [req.params.id] : []);
  const result = await productsService.updateProductsDiscount(ids, discountPercent);
  const msg = Number(discountPercent) > 0
    ? `تم تطبيق خصم ${discountPercent}% على ${result.modifiedCount} منتج بنجاح`
    : `تم إزالة الخصم عن ${result.modifiedCount} منتج بنجاح`;
  return ApiResponse.success(res, result, msg);
});

export const createCustom = asyncHandler(async (req, res) => {
  const result = await productsService.createCustomProduct(req.body);
  return ApiResponse.success(res, result, 'تم إنشاء المنتج الخاص بنجاح');
});

export const updateCustom = asyncHandler(async (req, res) => {
  const result = await productsService.updateCustomProduct(req.params.id, req.body);
  return ApiResponse.success(res, result, 'تم تحديث بيانات المنتج الخاص بنجاح');
});

export const deleteCustom = asyncHandler(async (req, res) => {
  const result = await productsService.deleteCustomProduct(req.params.id);
  return ApiResponse.success(res, result, 'تم حذف المنتج الخاص بنجاح');
});


