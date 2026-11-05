import mongoose from 'mongoose';
import { Favorite } from './favorites.model.js';
import { Product } from '../products/products.model.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { getSettings } from '../settings/settings.service.js';
import {
  calcSmartPrice,
  getCategoryProfitMap,
  resolveProductProfitPercentage,
  buildCurrencyProductFilter,
} from '../products/products.service.js';

/**
 * Toggle favorite status for a user and product
 */
export const toggleFavorite = async (userId, productId) => {
  if (!productId || !mongoose.isValidObjectId(productId)) {
    throw new ApiError('معرف المنتج غير صالح', HTTP_STATUS.BAD_REQUEST);
  }

  const product = await Product.findById(productId).lean();
  if (!product) {
    throw new ApiError('المنتج غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  const existing = await Favorite.findOne({ userId, productId });

  if (existing) {
    await Favorite.deleteOne({ _id: existing._id });
    return {
      isFavorite: false,
      productId: productId.toString(),
      message: 'تمت إزالة العنصر من المفضلة',
    };
  } else {
    await Favorite.create({ userId, productId });
    return {
      isFavorite: true,
      productId: productId.toString(),
      message: 'تمت إضافة العنصر إلى المفضلة بنجاح',
    };
  }
};

/**
 * Explicitly remove a product from favorites
 */
export const removeFavorite = async (userId, productId) => {
  if (!productId || !mongoose.isValidObjectId(productId)) {
    throw new ApiError('معرف المنتج غير صالح', HTTP_STATUS.BAD_REQUEST);
  }

  await Favorite.deleteOne({ userId, productId });
  return {
    isFavorite: false,
    productId: productId.toString(),
    message: 'تمت إزالة العنصر من المفضلة بنجاح',
  };
};

/**
 * Get all favorite product IDs for quick O(1) checks in frontend
 */
export const getUserFavoriteIds = async (userId) => {
  const favorites = await Favorite.find({ userId }).select('productId').lean();
  const favoriteIds = favorites
    .map((f) => f.productId?.toString())
    .filter(Boolean);
  return {
    favoriteIds,
    count: favoriteIds.length,
  };
};

/**
 * Get populated list of favorite products for a user with smart pricing
 */
export const getUserFavorites = async (userId, userCurrency = null) => {
  const rawFavorites = await Favorite.find({ userId })
    .sort({ createdAt: -1 })
    .populate({
      path: 'productId',
      match: { isVisible: { $ne: false }, isAvailable: { $ne: false } },
    })
    .lean();

  // Filter out any populated items where product was deleted or hidden
  const validItems = rawFavorites.filter((f) => f.productId != null);

  const settings = await getSettings();
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = await getCategoryProfitMap();
  const isUserSyp = Boolean(userCurrency && (String(userCurrency).toUpperCase().includes('SYP') || String(userCurrency).includes('\u0633') || String(userCurrency).includes('\u0644\u064A\u0631\u0629')));
  const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

  const products = validItems.map((item) => {
    const doc = item.productId;
    const isCustom = doc.source === 'custom';
    const effectiveProfit = resolveProductProfitPercentage(
      doc,
      globalProfitPercentage,
      catMap,
      subCatMap
    );
    const baseCost =
      doc.originalPrice && doc.originalPrice > 0
        ? doc.originalPrice
        : doc.sellingPrice !== null && doc.sellingPrice !== undefined && doc.sellingPrice > 0
        ? doc.sellingPrice
        : doc.price && doc.price > 0
        ? doc.price
        : 0;

    const priceBeforeDiscount = isCustom
      ? calcSmartPrice(doc.sellingPrice && doc.sellingPrice > 0 ? doc.sellingPrice : (doc.price || baseCost))
      : (effectiveProfit > 0
          ? calcSmartPrice(baseCost * (1 + effectiveProfit / 100))
          : baseCost);

    const discountPercent = doc.discountPercent || 0;
    const finalPrice =
      discountPercent > 0
        ? calcSmartPrice(priceBeforeDiscount * (1 - discountPercent / 100))
        : priceBeforeDiscount;

    return {
      ...doc,
      id: doc._id.toString(),
    let finalCurrency = (doc.currency === 'BOTH' || doc.currency === 'ALL' || !doc.currency) ? '$' : doc.currency;
    let convertedCost = baseCost;
    let convertedPriceBeforeDiscount = priceBeforeDiscount;
    let convertedFinalPrice = finalPrice;

    if (isUserSyp && isCustom && (finalCurrency === '$' || finalCurrency === 'USD')) {
      finalCurrency = 'Ù„.Ø³';
      convertedCost = Math.round(baseCost * exchangeRate);
      convertedPriceBeforeDiscount = Math.round(priceBeforeDiscount * exchangeRate);
      convertedFinalPrice = discountPercent > 0
        ? Math.round(convertedPriceBeforeDiscount * (1 - discountPercent / 100))
        : convertedPriceBeforeDiscount;
    }
      costPrice: convertedCost,
      price: convertedFinalPrice,
      priceBeforeDiscount: discountPercent > 0 ? convertedPriceBeforeDiscount : null,
      discountPercent,
      profitPercentage: effectiveProfit,
      isFavorite: true,
      favoritedAt: item.createdAt,
    };
  });

  return {
    products,
    count: products.length,
  };
};
