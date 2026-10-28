import { asyncHandler } from '../../utils/asyncHandler.js';
import { ApiResponse } from '../../utils/apiResponse.js';
import * as favoritesService from './favorites.service.js';

const extractUserCurrency = (req) => {
  return (
    req.user?.currency ||
    req.query.currency ||
    req.headers['x-user-currency'] ||
    null
  );
};

export const toggleFavoriteHandler = asyncHandler(async (req, res) => {
  const userId = req.user._id || req.user.id;
  const productId = req.body.productId || req.params.productId;
  const result = await favoritesService.toggleFavorite(userId, productId);
  return ApiResponse.success(res, result, result.message);
});

export const getMyFavoritesHandler = asyncHandler(async (req, res) => {
  const userId = req.user._id || req.user.id;
  const userCurrency = extractUserCurrency(req);
  const result = await favoritesService.getUserFavorites(userId, userCurrency);
  return ApiResponse.success(res, result, 'تم جلب المفضلة بنجاح');
});

export const getMyFavoriteIdsHandler = asyncHandler(async (req, res) => {
  const userId = req.user._id || req.user.id;
  const result = await favoritesService.getUserFavoriteIds(userId);
  return ApiResponse.success(res, result, 'تم جلب معرّفات المفضلة بنجاح');
});

export const removeFavoriteHandler = asyncHandler(async (req, res) => {
  const userId = req.user._id || req.user.id;
  const productId = req.params.productId || req.body.productId;
  const result = await favoritesService.removeFavorite(userId, productId);
  return ApiResponse.success(res, result, result.message);
});
