import mongoose from 'mongoose';
import { Product } from './products.model.js';
import { Category } from './categories.model.js';
import { SubCategory } from './subcategories.model.js';
import { normalizeSwGamesProduct } from './adapters/swGames.adapter.js';
import { normalizeAuto1CardProduct } from './adapters/auto1card.adapter.js';
import { normalizeBrand1CardProduct } from './adapters/brand1card.adapter.js';
import { detectMainCategory, cleanName } from './utils/categorizer.js';
import { seedLegacyOverrides } from '../../scripts/seedLegacyOverrides.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { getSettings } from '../settings/settings.service.js';
import { serverCache } from '../../utils/memoryCache.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * Accurately formats and preserves smart price precision:
 * - If price >= 1: formats up to 4 decimal places
 * - If price < 1: preserves full precision up to 8 decimal places so micro-prices (e.g. 0.00006511)
 *   are NEVER rounded to 0.0001, eliminating price calculation errors when multiplied by large quantities.
 */
export const calcSmartPrice = (val) => {
  const n = Number(val) || 0;
  if (n <= 0) return 0;
  return n >= 1 ? Number(n.toFixed(4)) : Number(n.toFixed(8));
};

// 1. Fetch from SW Games USD Account (رؤيا دولار - ROYA_USD)
export const fetchSwGamesUsd = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const token =
      process.env.SW_GAMES_TOKEN || 'i1zz8ajhxca9419asucqcmj6z6';

    const res = await fetch('https://sw-games.net/api/fastapi/products', {
      headers: {
        apiToken: token,
        Accept: 'application/json',
        'User-Agent': BROWSER_USER_AGENT,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`SW Games USD API returned status ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data?.data?.products || [];
    return items.map((item) =>
      normalizeSwGamesProduct(item, 'roya_usd', 'رؤيا دولار')
    );
  } catch (error) {
    console.error('SW Games USD fetch error:', error.message);
    return [];
  }
};

// 1.1 Fetch from SW Games SYP Account (رؤيا ليرة - ROYA_SYP - Syrian Telecom & Bills)
export const fetchSwGamesSyp = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const token =
      process.env.SW_GAMES_SYP_TOKEN || 'yzhm54xr2dh6778klm34c5y21';

    const res = await fetch('https://sw-games.net/api/fastapi/products', {
      headers: {
        apiToken: token,
        Accept: 'application/json',
        'User-Agent': BROWSER_USER_AGENT,
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`SW Games SYP API returned status ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data?.data?.products || [];
    return items.map((item) => {
      const normalized = normalizeSwGamesProduct(item, 'roya_syp', 'رؤيا ليرة');
      normalized.currency = 'ل.س';
      return normalized;
    });
  } catch (error) {
    console.error('SW Games SYP fetch error:', error.message);
    return [];
  }
};

// 2. Fetch from Brand One Card API (براند ون كارد - BRAND1CARD)
export const fetchBrand1Card = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const token =
      process.env.BRAND1CARD_API_TOKEN ||
      '3cf13f069cf8786bc75ed75794641e9cf34e467f6fe6ed892a9ff227941ea0b8';

    const apiUrl =
      process.env.BRAND1CARD_API_URL ||
      'https://api.brand-one-card.com/client/api/products';

    const res = await fetch(apiUrl, {
      headers: {
        'api-token': token,
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (res.status === 401) {
      const errJson = await res.json().catch(() => null);
      console.warn(
        'Brand One Card 401 Unauthorized. Token or IP might need whitelisting in panel:',
        errJson?.msg || errJson || '401'
      );
      return [];
    }

    if (!res.ok) {
      console.warn(`Brand One Card API returned status ${res.status}`);
      return [];
    }

    const json = await res.json();
    if (json && json.status === 'ERROR') {
      console.warn('Brand One Card API message:', json.msg || json);
      if (json.code === 123 || (json.msg && json.msg.includes('IP'))) {
        try {
          const ipRes = await fetch('https://api.ipify.org?format=json');
          const ipData = await ipRes.json();
          console.warn(`🚨 [Brand One Card] IP NOT ALLOWED. Outgoing server IP is: ${ipData.ip}. Please whitelist this IP in the Brand One Card panel!`);
        } catch (_) { }
      }
      return [];
    }

    const items = Array.isArray(json) ? json : json?.data || [];
    return items.map(normalizeBrand1CardProduct);
  } catch (error) {
    console.error('Brand One Card fetch error:', error.message);
    return [];
  }
};

// 2.1 Fetch from Auto 1 Card API (سيريا كارد العائلة)
export const fetchAuto1Card = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const token =
      process.env.AUTO1CARD_API_TOKEN ||
      'vXxwuG4VVYkw9XGS7FCoOjshKTxr4-xV_Wfd7mPp4Sw-p_Q6h8T7hbxSeO11148N';

    const res = await fetch('https://api.auto1card.com/client/api/products', {
      headers: {
        'api-token': token,
        Cookie: 'auto1card_v1=a5prjhmv2kpou405uj1bbua91b',
        'User-Agent': BROWSER_USER_AGENT,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return [];
    }

    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items.map(normalizeAuto1CardProduct);
  } catch (error) {
    return [];
  }
};

// 2.2 Purge Syria Card & Auto 1 Card products completely from MongoDB
export const purgeSyriaCardProducts = async () => {
  try {
    const res = await Product.deleteMany({
      $or: [
        { source: { $in: ['syria_card', 'auto1card'] } },
        { sourceName: { $regex: 'سيريا كارد|Syria Card|Auto 1 Card|Auto1Card', $options: 'i' } },
      ],
    });
    if (res.deletedCount > 0) {
      console.log(`✅ [Products] Permanently deleted ${res.deletedCount} Syria Card / Auto 1 Card products.`);
    }
    return res.deletedCount;
  } catch (err) {
    console.error('Error deleting Syria Card products:', err.message);
    return 0;
  }
};
export const deactivateSyriaCardProducts = purgeSyriaCardProducts;

// 3. Sync from approved providers (Roya USD, Roya SYP, Brand 1 Card) into MongoDB
/**
 * Ensures the dedicated "العناصر الجديدة" SubCategory folder exists for a given main category.
 * Used for receiving newly discovered provider products with disabled status.
 */
export const ensureNewItemsSubCategory = async (mainCategory = 'games') => {
  const targetCategory = mainCategory || 'games';
  let subCat = await SubCategory.findOne({
    name: 'العناصر الجديدة',
    mainCategory: targetCategory,
    parentId: null,
  });
  if (!subCat) {
    subCat = await SubCategory.create({
      name: 'العناصر الجديدة',
      mainCategory: targetCategory,
      parentId: null,
      imageUrl: 'https://cdn-icons-png.flaticon.com/512/3500/3500833.png',
      sortOrder: -100, // Appears first in folder view
      isVisible: true, // Visible for admin to manage
    });
  }
  return subCat;
};

export const syncAllProducts = async () => {
  // First, migrate any legacy 'sw_games' source name to 'roya_usd' and deactivate syria_card
  try {
    await Product.updateMany(
      { source: 'sw_games' },
      { $set: { source: 'roya_usd', sourceName: 'رؤيا دولار' } }
    );
    // Explicitly deactivate Syria Card / Auto 1 Card products
    await deactivateSyriaCardProducts();
  } catch (e) {
    console.warn('Legacy source migration note:', e.message);
  }

  // Only fetch from Roya USD, Roya SYP, and Brand 1 Card (Syria Card is disabled)
  const [swUsdList, swSypList, brand1List] = await Promise.all([
    fetchSwGamesUsd(),
    fetchSwGamesSyp(),
    fetchBrand1Card(),
  ]);

  const allNormalized = [...swUsdList, ...swSypList, ...brand1List];

  if (allNormalized.length === 0) {
    return {
      totalSynced: 0,
      brandNewCount: 0,
      updatedExistingCount: 0,
      royaUsdCount: 0,
      royaSypCount: 0,
      brand1CardCount: 0,
    };
  }

  // 1. Fetch ALL existing provider products currently in DB (including disabled or previously stopped ones)
  const existingProducts = await Product.find({
    source: { $in: ['roya_usd', 'roya_syp', 'brand1card', 'sw_games'] },
  })
    .select('_id source externalId name image mainCategory subCategoryId subCategoryName subCategoryImage isCategoryOverridden isNameOverridden isImageOverridden isVisible isAvailable category providerName providerImage')
    .lean();

  const existingMap = new Map();
  for (const p of existingProducts) {
    existingMap.set(`${p.source}:${p.externalId}`, p);
  }

  // Cache for "العناصر الجديدة" folders per mainCategory
  const newItemsFolderCache = new Map();
  const getNewItemsFolder = async (mainCategory = 'games') => {
    const key = mainCategory || 'games';
    if (newItemsFolderCache.has(key)) {
      return newItemsFolderCache.get(key);
    }
    const folder = await ensureNewItemsSubCategory(key);
    newItemsFolderCache.set(key, folder);
    return folder;
  };

  const operations = [];
  const currentProviderKeys = new Set();
  let brandNewCount = 0;
  let updatedExistingCount = 0;

  for (const item of allNormalized) {
    const key = `${item.source}:${item.externalId}`;
    currentProviderKeys.add(key);

    const existing = existingMap.get(key);

    if (existing) {
      // SCENARIO 1: Existing product (either active or returning after a temporary stop)
      // -> MUST return to its existing subfolder (subCategoryId, subCategoryName) and mainCategory!
      // -> Preserves custom name, image, and admin visibility state!
      const updateDoc = {
        price: item.price,
        originalPrice: item.originalPrice,
        currency: item.currency,
        isAvailable: item.isAvailable !== false, // Provider brought it back / available
        minCount: item.minCount,
        maxCount: item.maxCount,
        qtyValues: item.qtyValues,
        requiredFields: item.requiredFields,
        sourceName: item.sourceName,
        rawPayload: item.rawPayload,
        providerName: item.name,
        providerImage: item.image,
      };

      if (!existing.isNameOverridden) {
        updateDoc.name = item.name;
      }
      if (!existing.isImageOverridden) {
        updateDoc.image = item.image;
      }

      // Preserve existing subfolder & categorization 100%!
      if (existing.subCategoryId) {
        updateDoc.subCategoryId = existing.subCategoryId;
        updateDoc.subCategoryName = existing.subCategoryName || '';
        updateDoc.subCategoryImage = existing.subCategoryImage || '';
        updateDoc.mainCategory = existing.mainCategory;
      } else if (existing.isCategoryOverridden) {
        updateDoc.mainCategory = existing.mainCategory;
      }

      // Preserve visibility state set by admin (do not overwrite disabled products)
      updateDoc.isVisible = existing.isVisible;

      operations.push({
        updateOne: {
          filter: { _id: existing._id },
          update: { $set: updateDoc },
        },
      });
      updatedExistingCount++;
    } else {
      // SCENARIO 2: BRAND NEW product from provider!
      // -> Put in folder "العناصر الجديدة" (New Items)
      // -> Default state: DISABLED (isVisible: false) until admin moves and activates!
      const mainCat = item.mainCategory || detectMainCategory(item.name, item.category, item.source) || 'games';
      const newItemsFolder = await getNewItemsFolder(mainCat);

      const newDoc = {
        source: item.source,
        externalId: item.externalId,
        sourceName: item.sourceName,
        name: item.name,
        category: item.category,
        image: item.image,
        mainCategory: mainCat,
        subCategoryId: newItemsFolder._id,
        subCategoryName: newItemsFolder.name, // 'العناصر الجديدة'
        subCategoryImage: newItemsFolder.imageUrl,
        isCategoryOverridden: false,
        isNameOverridden: false,
        isImageOverridden: false,
        price: item.price,
        originalPrice: item.originalPrice,
        currency: item.currency,
        isAvailable: item.isAvailable !== false,
        isVisible: false, // Default: DISABLED / INACTIVE until admin moves and enables!
        minCount: item.minCount,
        maxCount: item.maxCount,
        qtyValues: item.qtyValues,
        requiredFields: item.requiredFields,
        rawPayload: item.rawPayload,
        providerName: item.name,
        providerImage: item.image,
      };

      operations.push({
        insertOne: {
          document: newDoc,
        },
      });
      brandNewCount++;
    }
  }

  // Products in DB that temporarily disappeared from provider:
  // Mark them unavailable (isAvailable: false) without deleting them,
  // so when they return later with the same ID, they seamlessly reactivate in the exact same subfolder!
  const missingProductIds = [];
  for (const p of existingProducts) {
    const key = `${p.source}:${p.externalId}`;
    if (!currentProviderKeys.has(key) && p.isAvailable) {
      missingProductIds.push(p._id);
    }
  }

  if (missingProductIds.length > 0) {
    await Product.updateMany(
      { _id: { $in: missingProductIds } },
      { $set: { isAvailable: false } }
    );
  }

  const bulkResult = operations.length > 0 ? await Product.bulkWrite(operations, { ordered: false }) : {};
  serverCache.clearAll();

  const totalSynced =
    (bulkResult.insertedCount || brandNewCount || 0) +
    (bulkResult.modifiedCount || 0) +
    (bulkResult.matchedCount || 0);

  return {
    totalSynced,
    brandNewCount,
    updatedExistingCount,
    temporarilyUnavailableCount: missingProductIds.length,
    royaUsdCount: swUsdList.length,
    royaSypCount: swSypList.length,
    brand1CardCount: brand1List.length,
  };
};

// Standalone function to reclassify non-overridden products (excluding items in subfolders or new items)
export const reclassifyAllProducts = async () => {
  const allExisting = await Product.find({
    isCategoryOverridden: { $ne: true },
    subCategoryId: null,
    subCategoryName: { $ne: 'العناصر الجديدة' },
  }).lean();
  if (allExisting.length === 0) {
    return { reclassifiedCount: 0, message: 'لا توجد منتجات بحاجة لإعادة الفرز' };
  }

  const reclassOps = allExisting.map((p) => ({
    updateOne: {
      filter: { _id: p._id },
      update: {
        $set: {
          mainCategory: detectMainCategory(p.name, p.category, p.source),
        },
      },
    },
  }));
  const res = await Product.bulkWrite(reclassOps, { ordered: false });
  return {
    reclassifiedCount: res.modifiedCount || 0,
    totalChecked: allExisting.length,
    message: 'تم إعادة فرز المنتجات بنجاح بناءً على الفرز الذكي المبدئي',
  };
};


// 3.1 Background Initializer on Server Startup
export const autoSyncOnStartup = async () => {
  try {
    console.log('🔄 [AutoSync] Starting catalog synchronization and categorization...');
    // Immediate deactivation of Syria Card products
    await deactivateSyriaCardProducts().catch(() => { });
    // Seed legacy admin overrides if present
    await seedLegacyOverrides().catch(() => { });
    const result = await syncAllProducts();
    console.log('✅ [AutoSync] Sync completed successfully:', result);

    // Ensure custom products display '$' currency instead of internal 'BOTH'
    try {
      const customMigrate = await Product.updateMany(
        { source: 'custom', currency: { $in: ['BOTH', 'ALL', 'both', 'all', null, ''] } },
        { $set: { currency: '$' } }
      );
      if (customMigrate.modifiedCount > 0) {
        console.log(`✅ [AutoSync] Cleaned ${customMigrate.modifiedCount} custom products currency to $.`);
      }
    } catch (_) { }
  } catch (err) {
    console.error('❌ [AutoSync] Failed on startup:', err.message);
  }
};

// Helpers: Resolve category-specific profit percentage
export const getCategoryProfitMap = async () => {
  try {
    const cacheKey = 'cat_profit_maps';
    const cached = serverCache.get(cacheKey);
    if (cached) return cached;

    const [categories, subCategories] = await Promise.all([
      Category.find({}).select('key profitPercentage').lean(),
      SubCategory.find({}).select('_id profitPercentage').lean(),
    ]);
    const catMap = {};
    for (const c of categories) {
      if (c && c.key && c.profitPercentage !== null && c.profitPercentage !== undefined && !isNaN(c.profitPercentage)) {
        catMap[c.key] = Number(c.profitPercentage);
      }
    }
    const subCatMap = {};
    for (const sc of subCategories) {
      if (sc && sc._id && sc.profitPercentage !== null && sc.profitPercentage !== undefined && !isNaN(sc.profitPercentage)) {
        subCatMap[sc._id.toString()] = Number(sc.profitPercentage);
      }
    }
    const result = { catMap, subCatMap };
    serverCache.set(cacheKey, result, 60);
    return result;
  } catch (err) {
    console.warn('[getCategoryProfitMap] error:', err.message);
    return { catMap: {}, subCatMap: {} };
  }
};

export const resolveProductProfitPercentage = (
  product,
  globalProfit,
  catMap = {},
  subCatMap = {},
  userCustomProfit = null
) => {
  let nominalProfit = globalProfit || 0;
  if (product) {
    if (product.source === 'custom') {
      const cost = Number(product.originalPrice ?? 0);
      const selling = Number(product.sellingPrice ?? product.price ?? cost);
      if (cost > 0 && selling > cost) {
        nominalProfit = Number((((selling - cost) / cost) * 100).toFixed(2));
      } else {
        const subId = product.subCategoryId ? product.subCategoryId.toString() : null;
        if (subId && subCatMap[subId] !== undefined) {
          nominalProfit = subCatMap[subId];
        } else if (product.mainCategory && catMap[product.mainCategory] !== undefined) {
          nominalProfit = catMap[product.mainCategory];
        } else {
          nominalProfit = globalProfit || 0;
        }
      }
    } else {
      const subId = product.subCategoryId ? product.subCategoryId.toString() : null;
      if (subId && subCatMap[subId] !== undefined) {
        nominalProfit = subCatMap[subId];
      } else if (product.mainCategory && catMap[product.mainCategory] !== undefined) {
        nominalProfit = catMap[product.mainCategory];
      }
    }
  }

  // If user has a custom profit percentage
  if (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit)) {
    const customRate = Number(userCustomProfit);
    const globalRate = Number(globalProfit || 0);
    let scaledProfit = customRate;
    if (globalRate > 0) {
      const userRatio = customRate / globalRate;
      scaledProfit = Number((nominalProfit * userRatio).toFixed(2));
    } else {
      scaledProfit = customRate;
    }
    // Admin safety floor: profit margin must never drop below 0.4%
    return Math.max(scaledProfit, 0.4);
  }

  return nominalProfit;
};

// 4. Admin: Get all normalized products with filters
export const getAdminProducts = async (query = {}) => {
  // Purge any residual Syria Card products in background
  const cacheKey = `admin_products_${JSON.stringify(query)}`;
  const cached = serverCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const andClauses = [];

  // Strictly exclude disabled providers (Syria Card / Auto 1 Card)
  andClauses.push({
    source: { $nin: ['syria_card', 'auto1card'] },
  });

  if (query.source && query.source !== 'all') {
    andClauses.push({ source: query.source });
  }
  if (query.category && query.category !== 'all') {
    andClauses.push({ category: query.category });
  }
  if (query.mainCategory && query.mainCategory !== 'all') {
    andClauses.push({ mainCategory: query.mainCategory });
  }
  if (query.isVisible !== undefined && query.isVisible !== 'all') {
    andClauses.push({ isVisible: query.isVisible === 'true' });
  }
  if (query.hasDiscount === 'true' || query.discounted === 'true') {
    andClauses.push({ discountPercent: { $gt: 0 } });
  }
  if (query.subCategoryId !== undefined && query.subCategoryId !== 'all') {
    if (query.subCategoryId === 'null' || query.subCategoryId === 'none' || query.subCategoryId === 'root' || !query.subCategoryId) {
      andClauses.push({
        $or: [
          { subCategoryId: null },
          { subCategoryId: { $exists: false } },
        ],
      });
    } else if (mongoose.Types.ObjectId.isValid(query.subCategoryId)) {
      const objId = new mongoose.Types.ObjectId(query.subCategoryId);
      andClauses.push({
        $or: [
          { subCategoryId: objId },
          { subCategoryId: String(query.subCategoryId) },
        ],
      });
    } else {
      andClauses.push({ subCategoryId: query.subCategoryId });
    }
  }
  if (query.search) {
    andClauses.push({
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { category: { $regex: query.search, $options: 'i' } },
      ],
    });
  }

  const filter = andClauses.length > 0 ? (andClauses.length === 1 ? andClauses[0] : { $and: andClauses }) : {};

  const products = await Product.find(filter)
    .select('-rawPayload')
    .sort({ price: 1, name: 1 })
    .lean();

  const [settings, profitMaps] = await Promise.all([
    getSettings(),
    getCategoryProfitMap(),
  ]);
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = profitMaps;

  const mappedProducts = products.map((p) => {
    const isCustom = p.source === 'custom';
    const baseCost = p.originalPrice && p.originalPrice > 0 ? p.originalPrice : (p.price || 0);
    const effectiveProfit = resolveProductProfitPercentage(p, globalProfitPercentage, catMap, subCatMap);
    const calculatedPrice = isCustom
      ? calcSmartPrice(p.sellingPrice && p.sellingPrice > 0 ? p.sellingPrice : (p.price || baseCost))
      : (effectiveProfit > 0
        ? calcSmartPrice(baseCost * (1 + effectiveProfit / 100))
        : baseCost);
    const discountPercent = p.discountPercent || 0;
    let finalPrice = calculatedPrice;
    if (discountPercent > 0 && baseCost > 0) {
      const netProfit = Math.max(0, effectiveProfit - discountPercent);
      finalPrice = calcSmartPrice(baseCost * (1 + netProfit / 100));
    }
    return {
      ...p,
      currency: (p.currency === 'BOTH' || p.currency === 'ALL' || !p.currency) ? '$' : p.currency,
      costPrice: baseCost,
      calculatedPrice,
      priceBeforeDiscount: calculatedPrice,
      price: finalPrice,
      discountPercent,
      profitPercentage: effectiveProfit,
    };
  });

  mappedProducts.sort((a, b) => {
    const diff = (a.price || 0) - (b.price || 0);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  const categoriesSet = new Set();
  const sourcesSet = new Set();
  for (const p of mappedProducts) {
    if (p.category && p.category.trim()) categoriesSet.add(p.category.trim());
    if (p.sourceName && p.sourceName.trim()) sourcesSet.add(p.sourceName.trim());
  }
  const categories = Array.from(categoriesSet).sort();
  const sources = Array.from(sourcesSet).sort();

  const result = {
    products: mappedProducts,
    categories,
    sources,
    profitPercentage: globalProfitPercentage,
    totalCount: products.length,
  };

  serverCache.set(cacheKey, result, 120);

  return result;
};

// 4.1 Live Verified Catalog Statistics
export const getCatalogStats = async () => {
  const baseFilter = { source: { $nin: ['syria_card', 'auto1card'] } };
  const [totalProducts, activeProducts, categoryAggregation, sourceAggregation] = await Promise.all([
    Product.countDocuments(baseFilter),
    Product.countDocuments({ ...baseFilter, isVisible: true }),
    Product.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$mainCategory', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
      { $match: baseFilter },
      { $group: { _id: '$source', count: { $sum: 1 } } },
    ]),
  ]);

  const categories = {
    games: 0,
    apps: 0,
    social: 0,
    subscriptions: 0,
    numbers: 0,
    cards: 0,
    payment: 0,
  };
  for (const item of categoryAggregation) {
    if (item._id) categories[item._id] = item.count;
  }

  const sources = {
    roya_usd: 0,
    roya_syp: 0,
    brand1card: 0,
    custom: 0,
  };
  for (const item of sourceAggregation) {
    if (item._id) {
      if (item._id === 'roya_usd' || item._id === 'sw_games') {
        sources.roya_usd = (sources.roya_usd || 0) + item.count;
      } else if (item._id === 'roya_syp') {
        sources.roya_syp = (sources.roya_syp || 0) + item.count;
      } else if (item._id === 'brand1card') {
        sources.brand1card = (sources.brand1card || 0) + item.count;
      } else if (item._id === 'custom') {
        sources.custom = (sources.custom || 0) + item.count;
      }
    }
  }

  return {
    totalProducts,
    activeProducts,
    categories,
    sources,
  };
};

// 5. Admin: Toggle visibility in User App
export const toggleProductVisibility = async (id) => {
  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  product.isVisible = !product.isVisible;
  await product.save();
  return product;
};

// 5.1 Admin: Bulk update products visibility (Activate / Deactivate multiple items)
export const bulkUpdateProductsVisibility = async (productIds, isVisible) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ApiError('يرجى تحديد المنتجات المراد تعديل حالتها', HTTP_STATUS.BAD_REQUEST);
  }

  const result = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { isVisible: Boolean(isVisible) } }
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    isVisible: Boolean(isVisible),
  };
};

export const DEFAULT_MAIN_CATEGORIES = [
  {
    key: 'games',
    title: 'ألعاب إلكترونية وشحن ألعاب',
    subtitle: 'ببجي، فري فاير، كول أوف ديوتي، روبلوكس وكافة شحنات الألعاب',
    icon: 'sports_esports_rounded',
    color: '#6366F1',
    sortOrder: 1,
    isCustom: false,
  },
  {
    key: 'apps',
    title: 'تطبيقات وبث مباشر',
    subtitle: 'شات، عملات تيك توك، لايكي، بيجو لايف وتطبيقات المحادثة',
    icon: 'forum_rounded',
    color: '#10B981',
    sortOrder: 2,
    isCustom: false,
  },
  {
    key: 'social',
    title: 'خدمات سوشل ميديا',
    subtitle: 'متابعين، لايكات، مشاهدات إنستغرام، تيك توك وتويتر فورياً',
    icon: 'share_rounded',
    color: '#EC4899',
    sortOrder: 3,
    isCustom: false,
  },
  {
    key: 'subscriptions',
    title: 'اشتراكات وباقات VIP',
    subtitle: 'نتفلكس، شاهد VIP، يوتيوب بريميوم، سبوتيفاي وباقات الترفيه',
    icon: 'subscriptions_rounded',
    color: '#E11D48',
    sortOrder: 4,
    isCustom: false,
  },
  {
    key: 'cards',
    title: 'بطاقات وقسائم رقمية',
    subtitle: 'بطاقات جوجل بلاي، آيتونز، بلايستيشن، رايزر جولد وإكس بوكس',
    icon: 'credit_card_rounded',
    color: '#F59E0B',
    sortOrder: 5,
    isCustom: false,
  },
  {
    key: 'numbers',
    title: 'أرقام تفعيل دولية',
    subtitle: 'أرقام وهمية لجميع دول العالم لتفعيل واتساب وتليجرام',
    icon: 'dialpad_rounded',
    color: '#0284C7',
    sortOrder: 6,
    isCustom: false,
  },
  {
    key: 'payment',
    title: 'دفع إلكتروني ومحافظ',
    subtitle: 'شحن بنوك رقمية، بايير، بينانس، بيرفكت موني ومحافظ كاش',
    icon: 'account_balance_wallet_rounded',
    color: '#8B5CF6',
    sortOrder: 7,
    isCustom: false,
  },
];

// Helper: Ensure default 7 categories exist in DB
export const ensureDefaultCategories = async () => {
  const count = await Category.countDocuments();
  if (count === 0) {
    await Category.insertMany(DEFAULT_MAIN_CATEGORIES);
  }
  await ensureSubcategoryProductsVisible();
};

let isAutoRepairDone = false;
export const ensureSubcategoryProductsVisible = async () => {
  if (isAutoRepairDone) return;
  isAutoRepairDone = true;
  try {
    // Automatically repair and enable all products organized into subcategories by Admin
    const result = await Product.updateMany(
      {
        $or: [
          { subCategoryId: { $ne: null } },
          { isCategoryOverridden: true },
        ],
        category: { $ne: 'العناصر الجديدة' },
        $or: [
          { isVisible: false },
          { isVisible: { $exists: false } },
          { isAvailable: false },
        ],
      },
      {
        $set: { isVisible: true, isAvailable: true },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(`[Auto-Repair] Successfully enabled ${result.modifiedCount} products organized in subcategories by Admin.`);
      serverCache.clearAll();
    }
  } catch (err) {
    console.error('ensureSubcategoryProductsVisible error:', err.message);
  }
};

// Helper: Build query filter matching user currency (Lira vs Dollar separation)
export const buildCurrencyProductFilter = (currencyStr) => {
  const syriaCardExclude = { source: { $nin: ['syria_card', 'auto1card'] } };
  if (!currencyStr) return syriaCardExclude;

  const c = String(currencyStr).trim().toUpperCase();
  if (c === 'SYP' || c === 'ل.س' || c === 'ليرة' || c === 'SYRIAN POUND') {
    // SYP USER: Strict isolation:
    // Only Roya SYP (roya_syp) and Custom products.
    // Roya USD (roya_usd), Brand 1 Card (brand1card), and legacy sw_games are strictly excluded.
    return {
      $and: [
        syriaCardExclude,
        {
          source: { $nin: ['roya_usd', 'sw_games', 'brand1card'] },
        },
        {
          currency: { $nin: ['$', 'USD', 'usd'] },
        },
        {
          $or: [
            { source: 'roya_syp' },
            { currency: { $in: ['ل.س', 'SYP', 'syp', 'BOTH', 'ALL', 'both', 'all'] } },
            { sourceName: { $regex: 'ليرة', $options: 'i' } },
            { source: 'custom' },
          ],
        },
      ],
    };
  }

  if (c === 'USD' || c === '$' || c === 'دولار') {
    // USD USER: Strict isolation:
    // Only Roya USD (roya_usd), Brand 1 Card (brand1card), and Custom USD products.
    // Roya SYP (roya_syp) and any Lira product are strictly excluded.
    return {
      $and: [
        syriaCardExclude,
        {
          source: { $nin: ['roya_syp'] },
        },
        {
          currency: { $nin: ['ل.س', 'SYP', 'syp'] },
        },
        {
          sourceName: { $not: { $regex: 'ليرة', $options: 'i' } },
        },
        {
          $or: [
            { source: { $in: ['roya_usd', 'brand1card', 'sw_games'] } },
            {
              source: 'custom',
              $or: [
                { currency: { $in: ['$', 'USD', 'usd', 'BOTH', 'ALL', 'both', 'all'] } },
                { currency: null },
                { currency: { $exists: false } },
                { currency: '' },
              ],
            },
          ],
        },
      ],
    };
  }

  return syriaCardExclude;
};

// 6.0 Get all categories with product counts (filtered by user currency & cached in memory)
export const getAllCategories = async (userCurrency = null, isAdmin = false) => {
  const cacheKey = `categories_${userCurrency || 'all'}`;
  if (!isAdmin) {
    const cached = serverCache.get(cacheKey);
    if (cached) return cached;
  }

  await ensureDefaultCategories();
  const categories = await Category.find({ isVisible: true }).sort({ sortOrder: 1, createdAt: 1 });

  const currencyFilter = buildCurrencyProductFilter(userCurrency);
  const matchFilter = {
    source: { $nin: ['syria_card', 'auto1card'] },
  };
  if (!isAdmin) {
    matchFilter.isAvailable = { $ne: false };
    matchFilter.isVisible = { $ne: false };
  }
  if (currencyFilter) {
    matchFilter.$and = [currencyFilter];
  }

  // Count active products for each category
  const productCounts = await Product.aggregate([
    { $match: matchFilter },
    { $group: { _id: '$mainCategory', count: { $sum: 1 } } },
  ]);

  const countMap = {};
  for (const pc of productCounts) {
    countMap[pc._id] = pc.count;
  }

  let result = categories.map((cat) => ({
    id: cat._id.toString(),
    key: cat.key,
    title: cat.title,
    subtitle: cat.subtitle,
    icon: cat.icon,
    color: cat.color,
    imageUrl: cat.imageUrl || '',
    sortOrder: cat.sortOrder,
    isCustom: cat.isCustom,
    profitPercentage: cat.profitPercentage !== undefined && cat.profitPercentage !== null ? cat.profitPercentage : null,
    productCount: countMap[cat.key] || 0,
  }));

  if (!isAdmin) {
    result = result.filter((cat) => cat.productCount > 0);
    serverCache.set(cacheKey, result, 60);
  }
  return result;
};

// 6.01 Admin: Create new main category
export const createCategory = async (data) => {
  let { key, title, subtitle, icon, color, imageUrl, profitPercentage } = data;
  if (!title || !title.trim()) {
    throw new ApiError('عنوان القسم مطلوب', HTTP_STATUS.BAD_REQUEST);
  }

  if (!key || !key.trim()) {
    // Generate key from title or timestamp
    key = 'cat_' + Date.now().toString(36);
  } else {
    key = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  }

  const existing = await Category.findOne({ key });
  if (existing) {
    throw new ApiError('مفتاح القسم موجود مسبقاً، يرجى اختيار اسم أو رمز آخر', HTTP_STATUS.CONFLICT);
  }

  const category = await Category.create({
    key,
    title: title.trim(),
    subtitle: subtitle?.trim() || '',
    icon: icon?.trim() || 'category_rounded',
    color: color?.trim() || '#6366F1',
    imageUrl: imageUrl?.trim() || '',
    profitPercentage: profitPercentage !== undefined && profitPercentage !== null && profitPercentage !== '' && profitPercentage !== 'null'
      ? Math.max(0, Number(profitPercentage))
      : null,
    sortOrder: Date.now() % 1000,
    isCustom: true,
    isVisible: true,
  });

  serverCache.clearAll();
  return category;
};

// 6.015 Admin: Update existing category (title, image, icon, color, profitPercentage, etc.)
export const updateCategory = async (id, data) => {
  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError('القسم غير موجود', HTTP_STATUS.NOT_FOUND);
  }
  const { title, subtitle, icon, color, imageUrl, isVisible, sortOrder, profitPercentage } = data;
  if (title !== undefined) category.title = title.trim();
  if (subtitle !== undefined) category.subtitle = subtitle.trim();
  if (icon !== undefined) category.icon = icon.trim();
  if (color !== undefined) category.color = color.trim();
  if (imageUrl !== undefined) category.imageUrl = imageUrl.trim();
  if (isVisible !== undefined) category.isVisible = isVisible;
  if (sortOrder !== undefined) category.sortOrder = Number(sortOrder) || 0;
  if (profitPercentage !== undefined) {
    if (profitPercentage === null || profitPercentage === '' || profitPercentage === 'null') {
      category.profitPercentage = null;
    } else {
      category.profitPercentage = Math.max(0, Number(profitPercentage));
    }
  }

  await category.save();
  serverCache.clearAll();
  return category;
};

// 6.02 Admin: Delete a custom category
export const deleteCategory = async (id) => {
  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError('القسم غير موجود', HTTP_STATUS.NOT_FOUND);
  }
  if (!category.isCustom) {
    throw new ApiError('لا يمكن حذف الأقسام الأساسية للنظام', HTTP_STATUS.BAD_REQUEST);
  }

  // Reassign any products in this category to 'games'
  await Product.updateMany(
    { mainCategory: category.key },
    { $set: { mainCategory: 'games', isCategoryOverridden: true } }
  );

  await category.deleteOne();
  serverCache.clearAll();
  return { message: 'تم حذف القسم بنجاح وإعادة تعيين المنتجات التابعة له', id };
};

// 6. Admin: Update Main Category & Sub Category (Sets isCategoryOverridden = true)
export const updateProductMainCategory = async (id, dataOrMainCat) => {
  let mainCategory = typeof dataOrMainCat === 'string' ? dataOrMainCat : dataOrMainCat?.mainCategory;
  let subCategoryName = typeof dataOrMainCat === 'object' ? (dataOrMainCat.subCategoryName || dataOrMainCat.category) : null;
  let subCategoryImage = typeof dataOrMainCat === 'object' ? dataOrMainCat.subCategoryImage : null;
  let subCategoryId = typeof dataOrMainCat === 'object' ? dataOrMainCat.subCategoryId : null;
  const clearSubCategory = typeof dataOrMainCat === 'object' ? Boolean(dataOrMainCat.clearSubCategory) : false;

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  if (mainCategory && mainCategory.trim()) {
    product.mainCategory = mainCategory.trim();
  }

  if (subCategoryId) {
    const targetSub = await SubCategory.findById(subCategoryId);
    if (targetSub) {
      product.subCategoryId = targetSub._id;
      product.subCategoryName = targetSub.name;
      product.subCategoryImage = targetSub.imageUrl || '';
      product.category = targetSub.name;
      product.mainCategory = targetSub.mainCategory;
    }
  } else if (clearSubCategory || subCategoryId === null || subCategoryId === '' || (!subCategoryName && !product.subCategoryId)) {
    product.subCategoryId = null;
    product.subCategoryName = '';
    product.subCategoryImage = '';
    product.category = 'عام';
  } else if (subCategoryName && subCategoryName.trim()) {
    product.subCategoryName = subCategoryName.trim();
    product.category = subCategoryName.trim();
  }

  if (subCategoryImage !== undefined && subCategoryImage !== null) {
    product.subCategoryImage = subCategoryImage.trim();
  }

  product.isCategoryOverridden = true;
  await product.save();
  serverCache.clearAll();
  return product;
};

// 6.1 Admin: Bulk update category & subcategory for selected items (Batch Move)
export const bulkUpdateProductsCategory = async (productIds, dataOrMainCat) => {
  let mainCategory = typeof dataOrMainCat === 'string' ? dataOrMainCat : dataOrMainCat?.mainCategory;
  let subCategoryName = typeof dataOrMainCat === 'object' ? (dataOrMainCat.subCategoryName || dataOrMainCat.category) : null;
  let subCategoryImage = typeof dataOrMainCat === 'object' ? dataOrMainCat.subCategoryImage : null;
  let subCategoryId = typeof dataOrMainCat === 'object' ? dataOrMainCat.subCategoryId : null;
  const clearSubCategory = typeof dataOrMainCat === 'object' ? Boolean(dataOrMainCat.clearSubCategory) : false;

  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ApiError('يجب تحديد عنصر واحد على الأقل لنقله', HTTP_STATUS.BAD_REQUEST);
  }

  const updateFields = {
    isCategoryOverridden: true,
    isVisible: true,
    isAvailable: true,
  };

  if (subCategoryId) {
    const targetSub = await SubCategory.findById(subCategoryId);
    if (targetSub) {
      updateFields.subCategoryId = targetSub._id;
      updateFields.subCategoryName = targetSub.name;
      updateFields.subCategoryImage = targetSub.imageUrl || '';
      updateFields.category = targetSub.name;
      updateFields.mainCategory = targetSub.mainCategory;
    }
  } else {
    if (mainCategory && mainCategory.trim()) {
      updateFields.mainCategory = mainCategory.trim();
    }
    if (subCategoryName !== null && subCategoryName !== undefined && subCategoryName.trim()) {
      updateFields.subCategoryName = subCategoryName.trim();
      updateFields.category = subCategoryName.trim();
    } else {
      // Whenever subCategoryId is null/empty/not provided and subCategoryName is empty,
      // it means the item is placed directly at root level of mainCategory!
      updateFields.subCategoryId = null;
      updateFields.subCategoryName = '';
      updateFields.subCategoryImage = '';
      updateFields.category = 'عام';
    }
    if (subCategoryImage !== undefined && subCategoryImage !== null) {
      updateFields.subCategoryImage = subCategoryImage.trim();
    }
  }

  const result = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: updateFields }
  );

  serverCache.clearAll();

  return {
    modifiedCount: result.modifiedCount,
    ...updateFields,
  };
};

// 6.2 Admin: Bulk update category for all items in a group
export const updateCategoryGroup = async (categoryName, mainCategory) => {
  if (!mainCategory || !mainCategory.trim()) {
    throw new ApiError('التصنيف الرئيسي مطلوب', HTTP_STATUS.BAD_REQUEST);
  }

  const result = await Product.updateMany(
    { category: categoryName },
    { $set: { mainCategory: mainCategory.trim(), isCategoryOverridden: true } }
  );

  return {
    category: categoryName,
    mainCategory: mainCategory.trim(),
    modifiedCount: result.modifiedCount,
  };
};

// Helper to detect smart product groups matching user app
export const detectProductGroupName = (name = '', category = '') => {
  const combined = `${name || ''} ${category || ''}`.toLowerCase();

  // 1. Popular Game Families
  if (combined.includes('pubg') || combined.includes('ببجي') || combined.includes('بوبجي')) return 'ببجي موبايل (PUBG Mobile)';
  if (combined.includes('free fire') || combined.includes('freefire') || combined.includes('فري فاير') || combined.includes('فاير')) return 'فري فاير (Free Fire)';
  if (combined.includes('roblox') || combined.includes('روبلوكس')) return 'روبلوكس (Roblox)';
  if (combined.includes('call of duty') || combined.includes('codm') || combined.includes('كول اوف ديوتي') || combined.includes('كود موبايل')) return 'كول أوف ديوتي (Call of Duty)';
  if (combined.includes('mobile legends') || combined.includes('موبايل ليجند') || combined.includes('mlbb')) return 'موبايل ليجندز (Mobile Legends)';
  if (combined.includes('yalla ludo') || combined.includes('يلا لودو') || combined.includes('لودو')) return 'يلا لودو (Yalla Ludo)';
  if (combined.includes('jawaker') || combined.includes('جواكر')) return 'جواكر (Jawaker)';
  if (combined.includes('clash of clans') || combined.includes('كلاش اوف كلانس')) return 'كلاش أوف كلانس (Clash of Clans)';
  if (combined.includes('clash royale') || combined.includes('كلاش رويال')) return 'كلاش رويال (Clash Royale)';
  if (combined.includes('brawl stars') || combined.includes('براول ستارز')) return 'براول ستارز (Brawl Stars)';
  if (combined.includes('fifa') || combined.includes('fc mobile') || combined.includes('فيفا') || combined.includes('اف سي')) return 'إي إيه إف سي (EA FC Mobile)';
  if (combined.includes('genshin') || combined.includes('قنشن') || combined.includes('جينشن')) return 'جينشين إمباكت (Genshin Impact)';
  if (combined.includes('8 ball') || combined.includes('8ball') || combined.includes('8 بول') || combined.includes('ايت بول') || combined.includes('بلياردو')) return '8 بول (8 Ball Pool)';
  if (combined.includes('hay day') || combined.includes('هاي داي')) return 'هاي داي (Hay Day)';
  if (combined.includes('efootball') || combined.includes('بيس') || combined.includes('pes')) return 'إي فوتبول بيس (eFootball PES)';
  if (combined.includes('toptop') || combined.includes('توب توب')) return 'توب توب (TopTop)';
  if (combined.includes('ludo club') || combined.includes('لودو كلوب')) return 'لودو كلوب (Ludo Club)';

  // 2. Apps & Subscriptions
  if (combined.includes('tiktok') || combined.includes('تيك توك')) return 'تيك توك (TikTok)';
  if (combined.includes('likee') || combined.includes('لايكي')) return 'لايكي (Likee)';
  if (combined.includes('bigo') || combined.includes('بيجو')) return 'بيجو لايف (Bigo Live)';
  if (combined.includes('telegram') || combined.includes('تليجرام') || combined.includes('تلغرام')) return 'تليجرام بريميوم (Telegram)';
  if (combined.includes('netflix') || combined.includes('نتفلكس') || combined.includes('نتفليكس')) return 'نتفلكس (Netflix)';
  if (combined.includes('shahid') || combined.includes('شاهد')) return 'شاهد VIP (Shahid)';
  if (combined.includes('youtube') || combined.includes('يوتيوب')) return 'يوتيوب بريميوم (YouTube)';
  if (combined.includes('spotify') || combined.includes('سبوتيفاي')) return 'سبوتيفاي (Spotify)';
  if (combined.includes('anghami') || combined.includes('انغامي') || combined.includes('أنغامي')) return 'أنغامي (Anghami)';
  if (combined.includes('discord') || combined.includes('ديسكورد')) return 'ديسكورد نيترو (Discord Nitro)';
  if (combined.includes('chatgpt') || combined.includes('شات جي بي تي')) return 'شات جي بي تي (ChatGPT Plus)';
  if (combined.includes('tango') || combined.includes('تانغو') || combined.includes('تانجو')) return 'تانجو (Tango)';
  if (combined.includes('mico') || combined.includes('ميكو')) return 'ميكو لايف (Mico Live)';
  if (combined.includes('soulchill') || combined.includes('سول شيل')) return 'سول شيل (Soulchill)';

  // 3. Digital Cards
  if (combined.includes('google play') || combined.includes('جوجل بلاي') || combined.includes('قوقل بلاي')) return 'بطاقات جوجل بلاي (Google Play)';
  if (combined.includes('itunes') || combined.includes('apple') || combined.includes('ايتونز') || combined.includes('ابل') || combined.includes('آبل')) return 'بطاقات آبل (iTunes / App Store)';
  if (combined.includes('playstation') || combined.includes('بلايستيشن') || combined.includes('psn')) return 'بطاقات بلايستيشن (PlayStation)';
  if (combined.includes('razer') || combined.includes('رايزر') || combined.includes('رازر')) return 'بطاقات رايزر جولد (Razer Gold)';
  if (combined.includes('steam') || combined.includes('ستيم')) return 'بطاقات ستيم (Steam)';
  if (combined.includes('xbox') || combined.includes('اكس بوكس')) return 'بطاقات إكس بوكس (Xbox)';

  const trimmedCat = (category || '').trim();
  if (trimmedCat && trimmedCat !== 'عام' && trimmedCat !== 'عامة' && trimmedCat !== 'Uncategorized') {
    return trimmedCat;
  }
  return (name || '').trim();
};

// Materialize all product groups as official SubCategory documents in MongoDB (Bulk High Performance)
export const materializeAllSubCategories = async (targetMainCategory = null) => {
  try {
    const unassignedMatch = {
      subCategoryId: null,
    };
    if (targetMainCategory && targetMainCategory !== 'all') {
      unassignedMatch.mainCategory = targetMainCategory;
    }
    const unassignedProducts = await Product.find(unassignedMatch)
      .select('_id name category image mainCategory subCategoryName')
      .lean();

    if (unassignedProducts.length === 0) {
      return { totalGroups: 0, createdCount: 0, updatedCount: 0, message: 'كافة المنتجات مصنفة ومربوطة بمجلداتها مسبقاً' };
    }

    // 1. Group unassigned products in memory
    const groups = new Map();
    for (const p of unassignedProducts) {
      let groupName = (p.subCategoryName && p.subCategoryName.trim()) || '';
      if (!groupName) {
        groupName = detectProductGroupName(p.name, p.category);
      }
      if (!groupName || groupName === 'عام' || groupName === 'عامة' || groupName === 'Uncategorized') {
        groupName = (p.category && p.category.trim() && p.category !== 'عام')
          ? p.category.trim()
          : (p.name && p.name.trim()) || 'عام';
      }

      const mainCat = p.mainCategory || targetMainCategory || 'games';
      const key = `${mainCat}:::${groupName.toLowerCase().trim()}`;
      if (!groups.has(key)) {
        groups.set(key, {
          mainCategory: mainCat,
          name: groupName.trim(),
          image: p.image || '',
          productIds: [],
        });
      } else if (!groups.get(key).image && p.image) {
        groups.get(key).image = p.image;
      }
      groups.get(key).productIds.push(p._id);
    }

    // 2. Fetch all existing root subcategories in ONE query
    const existingFilter = { parentId: null };
    if (targetMainCategory && targetMainCategory !== 'all') {
      existingFilter.mainCategory = targetMainCategory;
    }
    const existingSubs = await SubCategory.find(existingFilter).select('_id name mainCategory imageUrl').lean();
    const existingMap = new Map();
    for (const s of existingSubs) {
      existingMap.set(`${s.mainCategory}:::${s.name.toLowerCase().trim()}`, s);
    }

    // 3. Separate existing vs new subcategories
    const toCreate = [];
    for (const [key, grp] of groups.entries()) {
      if (!existingMap.has(key)) {
        toCreate.push({
          mainCategory: grp.mainCategory,
          name: grp.name,
          imageUrl: grp.image || '',
          parentId: null,
          isVisible: true,
        });
      }
    }

    if (toCreate.length > 0) {
      const created = await SubCategory.insertMany(toCreate);
      for (const s of created) {
        existingMap.set(`${s.mainCategory}:::${s.name.toLowerCase().trim()}`, s);
      }
    }

    // 4. Update products in ONE bulk write operation
    const bulkOps = [];
    for (const [key, grp] of groups.entries()) {
      const targetSub = existingMap.get(key);
      if (targetSub && grp.productIds.length > 0) {
        bulkOps.push({
          updateMany: {
            filter: { _id: { $in: grp.productIds } },
            update: {
              $set: {
                subCategoryId: targetSub._id,
                subCategoryName: targetSub.name,
                subCategoryImage: targetSub.imageUrl || grp.image || '',
                category: targetSub.name,
              },
            },
          },
        });
      }
    }

    let modifiedCount = 0;
    if (bulkOps.length > 0) {
      const res = await Product.bulkWrite(bulkOps, { ordered: false });
      modifiedCount = res.modifiedCount || 0;
    }

    return {
      totalGroups: groups.size,
      createdCount: toCreate.length,
      updatedCount: modifiedCount,
      message: `تم تثبيت ${groups.size} مجلداً فرعياً وربط ${modifiedCount} منتجاً بنجاح`,
    };
  } catch (err) {
    console.error('Error in materializeAllSubCategories:', err);
    throw err;
  }
};

// 6.3 Sub-Categories Management (Groups / Folders within a Main Category - High-Speed Cached)
export const getSubCategories = async (
  mainCategory,
  userCurrency = null,
  parentId = undefined,
  isAdmin = false,
  userCustomProfit = null
) => {
  const profitSuffix = (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit))
    ? `_p${userCustomProfit}`
    : '_std';
  const cacheKey = `subcats_${mainCategory || 'all'}_${parentId || 'root'}_${userCurrency || 'all'}${profitSuffix}`;
  if (!isAdmin) {
    const cached = serverCache.get(cacheKey);
    if (cached) return cached;
  }

  const filter = { isVisible: true };
  if (parentId === 'root' || parentId === 'null' || !parentId) {
    filter.parentId = null;
    if (mainCategory && mainCategory !== 'all') {
      filter.mainCategory = mainCategory;
    }
  } else if (parentId && parentId !== 'all') {
    if (mongoose.Types.ObjectId.isValid(parentId)) {
      filter.parentId = new mongoose.Types.ObjectId(parentId);
    } else {
      filter.parentId = null;
    }
  }

  const subCategories = await SubCategory.find(filter).sort({ sortOrder: 1, createdAt: 1 }).lean();
  const allSubCategories = await SubCategory.find({ isVisible: true }).select('_id parentId mainCategory name').lean();

  // 1. Build parent/child relationship map safely (prevent self-reference loops)
  const childCountMap = {};
  const childrenMap = {};
  for (const sc of allSubCategories) {
    if (sc.parentId) {
      const pIdStr = sc.parentId.toString();
      const scIdStr = sc._id.toString();
      if (pIdStr === scIdStr) continue; // Ignore accidental self-reference
      childCountMap[pIdStr] = (childCountMap[pIdStr] || 0) + 1;
      if (!childrenMap[pIdStr]) childrenMap[pIdStr] = [];
      childrenMap[pIdStr].push(scIdStr);
    }
  }

  // Helper to gather all descendant IDs (subtrees) safely preventing any infinite cycles
  const getAllDescendantIds = (subIdStr) => {
    const descendants = [];
    const visited = new Set([subIdStr.toString()]);
    const queue = [subIdStr.toString()];
    while (queue.length > 0) {
      const current = queue.shift();
      const children = childrenMap[current] || [];
      for (const ch of children) {
        const chStr = ch.toString();
        if (!visited.has(chStr)) {
          visited.add(chStr);
          descendants.push(chStr);
          queue.push(chStr);
        }
      }
    }
    return descendants;
  };

  // 2. Prepare comprehensive target IDs (ObjectId + String) and Name mappings
  const allSubCatIds = [];
  const subCategoryNameMap = {};
  for (const s of subCategories) {
    allSubCatIds.push(s._id);
    allSubCatIds.push(s._id.toString());
    if (s.name) {
      subCategoryNameMap[s.name.trim().toLowerCase()] = s._id.toString();
    }
  }

  // Also include all descendant subcategory IDs to count products inside children
  for (const sc of allSubCategories) {
    allSubCatIds.push(sc._id);
    allSubCatIds.push(sc._id.toString());
    if (sc.name) {
      subCategoryNameMap[sc.name.trim().toLowerCase()] = sc._id.toString();
    }
  }

  // 3. Match Products strictly by subCategoryId (fast indexed lookup)
  const andList = [
    { subCategoryId: { $in: allSubCatIds } },
  ];

  // For regular users, only count visible, available, and currency-matching products
  if (!isAdmin) {
    andList.push({ isAvailable: { $ne: false } });
    andList.push({ isVisible: { $ne: false } });
    const currencyFilter = buildCurrencyProductFilter(userCurrency);
    if (currencyFilter) {
      andList.push(currencyFilter);
    }
  }

  const productMatch = andList.length === 1 ? andList[0] : { $and: andList };

  const products = await Product.find(productMatch).select(
    'id _id name image price sellingPrice originalPrice currency isAvailable isVisible subCategoryId subCategoryName category source'
  ).sort({ price: 1, name: 1 }).lean();

  const isUserSyp = Boolean(userCurrency && (String(userCurrency).toUpperCase().includes('SYP') || String(userCurrency).includes('ل.س') || String(userCurrency).includes('ليرة')));
  const [settings, profitMaps] = await Promise.all([
    getSettings(),
    getCategoryProfitMap(),
  ]);
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = profitMaps;
  const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;
  const productsBySubId = {};
  for (const p of products) {
    if (p.currency === 'BOTH' || p.currency === 'ALL' || !p.currency) {
      p.currency = '$';
    }

    const isCustom = p.source === 'custom';
    const effectiveProfit = resolveProductProfitPercentage(p, globalProfitPercentage, catMap, subCatMap, userCustomProfit);
    const regularSellingPrice = Number(p.sellingPrice && p.sellingPrice > 0 ? p.sellingPrice : (p.price || 0));
    let baseCost = Number(p.originalPrice || 0);
    if (baseCost <= 0) {
      if (effectiveProfit > 0 && regularSellingPrice > 0) {
        baseCost = Number((regularSellingPrice / (1 + effectiveProfit / 100)).toFixed(4));
      } else {
        baseCost = regularSellingPrice;
      }
    }

    const hasCustomUserProfit = (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit));
    let priceBeforeDiscount;
    if (isCustom) {
      if (hasCustomUserProfit && baseCost > 0) {
        const customCalculated = calcSmartPrice(baseCost * (1 + effectiveProfit / 100));
        priceBeforeDiscount = Math.min(regularSellingPrice, customCalculated);
      } else {
        priceBeforeDiscount = regularSellingPrice;
      }
    } else {
      priceBeforeDiscount = effectiveProfit > 0 ? calcSmartPrice(baseCost * (1 + effectiveProfit / 100)) : baseCost;
    }

    const minProfitFloor = hasCustomUserProfit ? 0.4 : 0;
    const floorPrice = calcSmartPrice(baseCost * (1 + minProfitFloor / 100));
    const discountPercent = p.discountPercent || 0;
    let finalUnitPrice = priceBeforeDiscount;
    if (discountPercent > 0 && baseCost > 0) {
      const netProfit = Math.max(minProfitFloor, effectiveProfit - discountPercent);
      const discounted = calcSmartPrice(baseCost * (1 + netProfit / 100));
      finalUnitPrice = Math.min(priceBeforeDiscount, Math.max(discounted, floorPrice));
    }
    p.price = finalUnitPrice;

    if (isUserSyp) {
      if (p.source === 'custom' && (p.currency === '$' || p.currency === 'USD' || !p.currency || p.currency === 'BOTH' || p.currency === 'ALL')) {
        p.price = Math.round((p.price || 0) * exchangeRate);
        if (p.sellingPrice) p.sellingPrice = Math.round(p.sellingPrice * exchangeRate);
        if (p.originalPrice) p.originalPrice = Math.round(p.originalPrice * exchangeRate);
      }
      p.currency = 'ل.س';
    }
    const sId = p.subCategoryId?.toString();
    if (sId) {
      if (!productsBySubId[sId]) productsBySubId[sId] = [];
      productsBySubId[sId].push(p);
    }
  }

  let result = subCategories.map((sc) => {
    const sIdStr = sc._id.toString();
    const scProducts = productsBySubId[sIdStr] || [];
    scProducts.sort((a, b) => {
      const pA = a.sellingPrice && a.sellingPrice > 0 ? a.sellingPrice : (a.price || a.originalPrice || 0);
      const pB = b.sellingPrice && b.sellingPrice > 0 ? b.sellingPrice : (b.price || b.originalPrice || 0);
      const diff = pA - pB;
      if (diff !== 0) return diff;
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
    const validPrices = scProducts
      .map((p) => (p.sellingPrice && p.sellingPrice > 0 ? p.sellingPrice : (p.price && p.price > 0 ? p.price : (p.originalPrice || 0))))
      .filter((pr) => pr > 0);
    const startingPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;
    const childCount = childCountMap[sIdStr] || 0;
    const directCount = scProducts.length;

    // Calculate total products including all child folders
    const descendantIds = getAllDescendantIds(sIdStr);
    let totalProductCount = directCount;
    for (const descId of descendantIds) {
      totalProductCount += (productsBySubId[descId]?.length || 0);
    }

    return {
      ...sc,
      id: sIdStr,
      parentId: sc.parentId ? sc.parentId.toString() : null,
      productCount: totalProductCount > 0 ? totalProductCount : directCount,
      directCount,
      totalProductCount,
      childCount,
      isEmpty: (totalProductCount > 0 ? totalProductCount : directCount) === 0 && childCount === 0,
      canDelete: directCount === 0 && childCount === 0,
      products: scProducts,
      startingPrice,
      currency: isUserSyp ? 'ل.س' : (scProducts.length > 0 ? scProducts[0].currency : '$'),
    };
  });

  if (!isAdmin) {
    result = result.filter(
      (sc) =>
        sc.name !== 'العناصر الجديدة' &&
        (sc.productCount > 0 || sc.childCount > 0 || sc.directCount > 0 || sc.totalProductCount > 0)
    );
    serverCache.set(cacheKey, result, 60);
  }
  return result;
};

export const createSubCategory = async (data) => {
  let { mainCategory, name, imageUrl, parentId, productIds } = data;
  if (!name || !name.trim()) {
    throw new ApiError('اسم المجلد / التصنيف الفرعي مطلوب', HTTP_STATUS.BAD_REQUEST);
  }

  let resolvedParentId = null;
  if (parentId && parentId !== 'null' && parentId !== 'root') {
    const parentSub = await SubCategory.findById(parentId);
    if (!parentSub) {
      throw new ApiError('المجلد الأب المحدد غير موجود', HTTP_STATUS.NOT_FOUND);
    }
    resolvedParentId = parentSub._id;
    if (!mainCategory || !mainCategory.trim()) {
      mainCategory = parentSub.mainCategory;
    }
  }

  if (!mainCategory || !mainCategory.trim()) {
    throw new ApiError('القسم الرئيسي مطلوب', HTTP_STATUS.BAD_REQUEST);
  }

  const subCategory = await SubCategory.create({
    mainCategory: mainCategory.trim(),
    parentId: resolvedParentId,
    name: name.trim(),
    imageUrl: imageUrl?.trim() || '',
    isVisible: true,
  });

  if (Array.isArray(productIds) && productIds.length > 0) {
    await Product.updateMany(
      { _id: { $in: productIds } },
      {
        $set: {
          mainCategory: subCategory.mainCategory,
          subCategoryId: subCategory._id,
          subCategoryName: subCategory.name,
          subCategoryImage: subCategory.imageUrl,
          category: subCategory.name,
          isCategoryOverridden: true,
        },
      }
    );
  }

  serverCache.clearAll();

  return {
    ...subCategory.toJSON(),
    id: subCategory._id.toString(),
    parentId: resolvedParentId ? resolvedParentId.toString() : null,
    productCount: Array.isArray(productIds) ? productIds.length : 0,
    childCount: 0,
    isEmpty: !Array.isArray(productIds) || productIds.length === 0,
    canDelete: !Array.isArray(productIds) || productIds.length === 0,
  };
};

export const updateSubCategory = async (id, data) => {
  const subCategory = await SubCategory.findById(id);
  if (!subCategory) {
    throw new ApiError('المجلد / التصنيف الفرعي غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  const { name, imageUrl, mainCategory, parentId, productIds, isVisible } = data;
  if (name !== undefined) subCategory.name = name.trim();
  if (imageUrl !== undefined) subCategory.imageUrl = imageUrl.trim();
  if (isVisible !== undefined) subCategory.isVisible = isVisible;

  // Helper to fetch all descendant subcategory IDs recursively (prevents cyclic hierarchy safely)
  const getAllDescendants = async (rootId) => {
    const descendants = [];
    const rootStr = rootId.toString();
    const visited = new Set([rootStr]);
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.shift();
      const children = await SubCategory.find({ parentId: current }).select('_id').lean();
      for (const child of children) {
        const cStr = child._id.toString();
        if (!visited.has(cStr)) {
          visited.add(cStr);
          descendants.push(child._id);
          queue.push(child._id);
        }
      }
    }
    return descendants;
  };

  let targetMainCategory = mainCategory ? mainCategory.trim() : subCategory.mainCategory;

  if (parentId !== undefined) {
    if (parentId && parentId !== 'null' && parentId !== 'root') {
      if (parentId.toString() === id.toString()) {
        throw new ApiError('لا يمكن نقل المجلد إلى داخل نفسه', HTTP_STATUS.BAD_REQUEST);
      }
      const descendants = await getAllDescendants(id);
      const isDescendant = descendants.some((d) => d.toString() === parentId.toString());
      if (isDescendant) {
        throw new ApiError('لا يمكن نقل المجلد إلى داخل أحد مجلداته الفرعية', HTTP_STATUS.BAD_REQUEST);
      }

      const parentSub = await SubCategory.findById(parentId);
      if (parentSub) {
        subCategory.parentId = parentSub._id;
        targetMainCategory = parentSub.mainCategory;
      }
    } else {
      subCategory.parentId = null;
    }
  }

  const mainCategoryChanged = targetMainCategory && targetMainCategory !== subCategory.mainCategory;
  if (targetMainCategory) {
    subCategory.mainCategory = targetMainCategory;
  }

  await subCategory.save();

  // If subcategory or main category changed, update this folder and all its contents
  const allSubCategoryIds = [subCategory._id, ...(await getAllDescendants(subCategory._id))];

  await Product.updateMany(
    { subCategoryId: subCategory._id },
    {
      $set: {
        subCategoryName: subCategory.name,
        subCategoryImage: subCategory.imageUrl,
        category: subCategory.name,
        mainCategory: subCategory.mainCategory,
      },
    }
  );

  if (mainCategoryChanged) {
    // Update all descendant subcategories to the new mainCategory
    await SubCategory.updateMany(
      { _id: { $in: allSubCategoryIds } },
      { $set: { mainCategory: subCategory.mainCategory } }
    );
    // Update all products in all descendant subcategories
    await Product.updateMany(
      { subCategoryId: { $in: allSubCategoryIds } },
      { $set: { mainCategory: subCategory.mainCategory } }
    );
  }

  if (Array.isArray(productIds)) {
    await Product.updateMany(
      { subCategoryId: subCategory._id, _id: { $nin: productIds } },
      { $set: { subCategoryId: null, subCategoryName: '', subCategoryImage: '' } }
    );
    await Product.updateMany(
      { _id: { $in: productIds } },
      {
        $set: {
          mainCategory: subCategory.mainCategory,
          subCategoryId: subCategory._id,
          subCategoryName: subCategory.name,
          subCategoryImage: subCategory.imageUrl,
          category: subCategory.name,
          isCategoryOverridden: true,
        },
      }
    );
  }

  serverCache.clearAll();

  return subCategory;
};

export const deleteSubCategory = async (id) => {
  const subCategory = await SubCategory.findById(id);
  if (!subCategory) {
    throw new ApiError('المجلد / التصنيف الفرعي غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  const productCount = await Product.countDocuments({
    $or: [
      { subCategoryId: subCategory._id },
      { subCategoryId: String(subCategory._id) },
    ],
  });
  const childCount = await SubCategory.countDocuments({ parentId: subCategory._id });

  if (productCount > 0 || childCount > 0) {
    const parts = [];
    if (productCount > 0) parts.push(`${productCount} عنصر`);
    if (childCount > 0) parts.push(`${childCount} مجلد فرعي`);
    throw new ApiError(
      `لا يمكن حذف هذا المجلد لأنه يحتوي على (${parts.join(' و ')}). يرجى نقل العناصر أولاً لتفريغه قبل الحذف.`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // Clean up any lingering references to this deleted subcategory
  await Product.updateMany(
    {
      $or: [
        { subCategoryId: subCategory._id },
        { subCategoryId: String(subCategory._id) },
        { subCategoryName: subCategory.name },
      ],
    },
    {
      $set: {
        subCategoryId: null,
        subCategoryName: '',
        isCategoryOverridden: false,
      },
    }
  );

  await subCategory.deleteOne();
  serverCache.clearAll();
  return { message: 'تم حذف المجلد بنجاح', id };
};

export const reorderSubCategories = async (items) => {
  let list = Array.isArray(items) ? items : items?.items;
  if (!Array.isArray(list)) {
    throw new ApiError('Ø§Ù„Ù…ØµÙÙˆÙØ© Ø§Ù„Ù…Ø·Ù„ÙˆØ¨Ø© ØºÙŠØ± ØµØ§Ù„Ø­Ø©', HTTP_STATUS.BAD_REQUEST);
  }

  const bulkOps = list
    .map((item, index) => {
      const id = item.id || item._id;
      const sortOrder = item.sortOrder !== undefined ? Number(item.sortOrder) : index;
      if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
      return {
        updateOne: {
          filter: { _id: new mongoose.Types.ObjectId(id) },
          update: { $set: { sortOrder } },
        },
      };
    })
    .filter(Boolean);

  if (bulkOps.length > 0) {
    await SubCategory.bulkWrite(bulkOps);
  }

  serverCache.clearAll();

  return {
    success: true,
    message: 'ØªÙ… Ø­ÙØ¸ ØªØ±ØªÙŠØ¨ Ø§Ù„Ø£Ù‚Ø³Ø§Ù… Ø§Ù„ÙØ±Ø¹ÙŠØ© Ø¨Ù†Ø¬Ø§Ø­',
    updatedCount: bulkOps.length,
  };
};

export const bulkAssignSubCategory = async ({ productIds, subCategoryId, subCategoryName, subCategoryImage, mainCategory }) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ApiError('يجب تحديد المنتجات أولاً', HTTP_STATUS.BAD_REQUEST);
  }

  let finalSubId = subCategoryId;
  let finalSubName = subCategoryName;
  let finalSubImage = subCategoryImage;

  if (subCategoryId) {
    const existing = await SubCategory.findById(subCategoryId);
    if (existing) {
      finalSubName = existing.name;
      finalSubImage = existing.imageUrl;
    }
  }

  const updateFields = {
    subCategoryId: finalSubId || null,
    subCategoryName: finalSubName || '',
    subCategoryImage: finalSubImage || '',
    isCategoryOverridden: true,
  };
  if (mainCategory) {
    updateFields.mainCategory = mainCategory.trim();
  }

  const result = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: updateFields }
  );

  serverCache.clearAll();

  return { modifiedCount: result.modifiedCount };
};

export function buildFlexibleSearchRegex(queryText) {
  if (!queryText || !queryText.trim()) return /.*/i;
  const escapeRegex = (str) => str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
  const normalizeChar = (c) => {
    if (['ا', 'أ', 'إ', 'آ'].includes(c)) return '[اأإآ]';
    if (['ة', 'ه'].includes(c)) return '[ةه]';
    if (['ي', 'ى', 'ئ'].includes(c)) return '[يىئ]';
    if (['و', 'ؤ'].includes(c)) return '[وؤ]';
    return escapeRegex(c);
  };

  const words = queryText.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return /.*/i;

  const wordPatterns = words.map((w) => {
    return w.split('').map(normalizeChar).join('');
  });

  const pattern = wordPatterns.map((wp) => `(?=.*${wp})`).join('');
  return new RegExp(pattern, 'i');
}

// 7. User: Get visible products grouped by Category (All active products visible by default - Cached)
export const getUserProducts = async (query = {}, userCurrency = null, userCustomProfit = null) => {
  const normalizedQuery = {
    category: query.category,
    subCategoryId: query.subCategoryId,
    mainCategory: query.mainCategory,
    search: query.search ? query.search.trim().toLowerCase() : undefined,
    limit: query.limit,
    includeSubCategories: query.includeSubCategories,
  };
  const profitSuffix = (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit))
    ? `_p${userCustomProfit}`
    : '_std';
  const cacheKey = `user_prods_${JSON.stringify(normalizedQuery)}_${userCurrency || 'all'}${profitSuffix}`;
  const cached = serverCache.get(cacheKey);
  if (cached) return cached;

  const andClauses = [
    { isAvailable: { $ne: false } },
    { isVisible: { $ne: false } },
    { source: { $nin: ['syria_card', 'auto1card'] } },
  ];

  const currencyFilter = buildCurrencyProductFilter(userCurrency || query.currency);
  if (currencyFilter) {
    andClauses.push(currencyFilter);
  }

  if (query.category && query.category !== 'all') {
    andClauses.push({ category: query.category });
  }
  if (query.subCategoryId && query.subCategoryId !== 'all') {
    if (query.subCategoryId === 'root' || query.subCategoryId === 'null') {
      andClauses.push({
        $or: [
          { subCategoryId: null },
          { subCategoryId: { $exists: false } },
        ],
      });
    } else {
      let targetSubCat = null;
      if (mongoose.Types.ObjectId.isValid(query.subCategoryId)) {
        try {
          targetSubCat = await SubCategory.findById(query.subCategoryId).lean();
        } catch (_) {}
      }
      if (!targetSubCat) {
        try {
          targetSubCat = await SubCategory.findOne({ name: query.subCategoryId }).lean();
        } catch (_) {}
      }

      if (targetSubCat) {
        const childSubs = await SubCategory.find({ parentId: targetSubCat._id }).select('_id').lean();
        const allIds = [
          targetSubCat._id,
          targetSubCat._id.toString(),
          ...childSubs.map((c) => c._id),
          ...childSubs.map((c) => c._id.toString()),
        ];
        andClauses.push({
          subCategoryId: { $in: allIds },
        });
      } else if (mongoose.Types.ObjectId.isValid(query.subCategoryId)) {
        const objId = new mongoose.Types.ObjectId(query.subCategoryId);
        andClauses.push({
          $or: [
            { subCategoryId: objId },
            { subCategoryId: String(query.subCategoryId) },
          ],
        });
      } else {
        andClauses.push({ subCategoryId: query.subCategoryId });
      }
    }
  }
  if (query.mainCategory && query.mainCategory !== 'all' && (!query.subCategoryId || query.subCategoryId === 'root' || query.subCategoryId === 'null')) {
    andClauses.push({ mainCategory: query.mainCategory });
  }
  if (query.search) {
    const s = query.search.trim();
    const searchRegex = buildFlexibleSearchRegex(s);
    andClauses.push({
      $or: [
        { name: searchRegex },
        { customName: searchRegex },
        { category: searchRegex },
        { subCategoryName: searchRegex },
        { sourceName: searchRegex },
        { providerName: searchRegex },
      ],
    });
  }

  const filter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

  const [settings, profitMaps] = await Promise.all([
    getSettings(),
    getCategoryProfitMap(),
  ]);
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = profitMaps;
  const isUserSyp = Boolean(userCurrency && (String(userCurrency).toUpperCase().includes('SYP') || String(userCurrency).includes('\u0633') || String(userCurrency).includes('\u0644\u064A\u0631\u0629')));
  const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

  let productQuery = Product.find(filter)
    .select('-rawPayload')
    .sort({ price: 1, name: 1 })
    .lean();

  if (query.limit || query.search) {
    const lim = query.search
      ? Math.max(1, Math.min(Number(query.limit) || 300, 500))
      : Math.max(1, Math.min(Number(query.limit) || 200, 500));
    productQuery = productQuery.limit(lim);
  }

  const products = await productQuery;
  const mappedProducts = products.map((doc) => {
    const isCustom = doc.source === 'custom';
    const effectiveProfit = resolveProductProfitPercentage(doc, globalProfitPercentage, catMap, subCatMap, userCustomProfit);
    const regularSellingPrice = Number(doc.sellingPrice && doc.sellingPrice > 0 ? doc.sellingPrice : (doc.price || 0));
    let baseCost = Number(doc.originalPrice || 0);
    if (baseCost <= 0) {
      if (effectiveProfit > 0 && regularSellingPrice > 0) {
        baseCost = Number((regularSellingPrice / (1 + effectiveProfit / 100)).toFixed(4));
      } else {
        baseCost = regularSellingPrice;
      }
    }

    const hasCustomUserProfit = (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit));
    let priceBeforeDiscount;
    if (isCustom) {
      if (hasCustomUserProfit && baseCost > 0) {
        const customCalculated = calcSmartPrice(baseCost * (1 + effectiveProfit / 100));
        priceBeforeDiscount = Math.min(regularSellingPrice, customCalculated);
      } else {
        priceBeforeDiscount = regularSellingPrice;
      }
    } else {
      priceBeforeDiscount = effectiveProfit > 0
        ? calcSmartPrice(baseCost * (1 + effectiveProfit / 100))
        : baseCost;
    }

    // Stop-loss: For custom-profit users, min profit floor is 0.4%, for regular users min profit floor is 0%
    const minProfitFloor = hasCustomUserProfit ? 0.4 : 0;
    const floorPrice = calcSmartPrice(baseCost * (1 + minProfitFloor / 100));
    const discountPercent = doc.discountPercent || 0;
    let finalPrice = priceBeforeDiscount;
    let effectiveDiscountPercent = discountPercent;

    if (discountPercent > 0 && baseCost > 0) {
      const netProfit = Math.max(minProfitFloor, effectiveProfit - discountPercent);
      const discounted = calcSmartPrice(baseCost * (1 + netProfit / 100));
      finalPrice = Math.min(priceBeforeDiscount, Math.max(discounted, floorPrice));
      effectiveDiscountPercent = priceBeforeDiscount > finalPrice
        ? Number((((priceBeforeDiscount - finalPrice) / priceBeforeDiscount) * 100).toFixed(2))
        : 0;
    }

    let finalCurrency = (doc.currency === 'BOTH' || doc.currency === 'ALL' || !doc.currency) ? '$' : doc.currency;
    let convertedCost = baseCost;
    let convertedPriceBeforeDiscount = priceBeforeDiscount;
    let convertedFinalPrice = finalPrice;

    if (isUserSyp) {
      finalCurrency = 'ل.س';
      if (isCustom && (doc.currency === '$' || doc.currency === 'USD' || !doc.currency || doc.currency === 'BOTH' || doc.currency === 'ALL')) {
        convertedCost = Math.round(baseCost * exchangeRate);
        convertedPriceBeforeDiscount = Math.round(priceBeforeDiscount * exchangeRate);
        const sypFloor = Math.round(convertedCost * (1 + minProfitFloor / 100));
        const sypDiscounted = effectiveDiscountPercent > 0
          ? Math.round(convertedPriceBeforeDiscount * (1 - effectiveDiscountPercent / 100))
          : convertedPriceBeforeDiscount;
        convertedFinalPrice = Math.max(sypDiscounted, sypFloor);
      }
    }

    return {
      ...doc,
      id: doc._id ? doc._id.toString() : doc.id,
      currency: finalCurrency,
      costPrice: convertedCost,
      price: convertedFinalPrice,
      priceBeforeDiscount: effectiveDiscountPercent > 0 ? convertedPriceBeforeDiscount : null,
      discountPercent: effectiveDiscountPercent,
      profitPercentage: effectiveProfit,
    };
  });

  mappedProducts.sort((a, b) => {
    const diff = (a.price || 0) - (b.price || 0);
    if (diff !== 0) return diff;
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  // Only fetch subcategories if explicitly requested AND not filtering by a specific subcategory
  let subCategories = [];
  if (query.includeSubCategories === 'true' && query.mainCategory && query.mainCategory !== 'all' && !query.subCategoryId) {
    try {
      subCategories = await getSubCategories(query.mainCategory, userCurrency, undefined, false, userCustomProfit);
    } catch (_) { }
  }

  // Group by category for a cleaner store layout
  const grouped = {};
  for (const p of mappedProducts) {
    if (!grouped[p.category]) {
      grouped[p.category] = [];
    }
    grouped[p.category].push(p);
  }

  const responseData = {
    products: mappedProducts,
    grouped,
    categories: Object.keys(grouped),
    subCategories,
    total: mappedProducts.length,
  };

  const cacheTtl = query.search ? 10 : 60;
  serverCache.set(cacheKey, responseData, cacheTtl);
  return responseData;
};

// 8. Get Product Details (Packages & Pricing modeled after legacy site)
export const getProductDetails = async (id, userCurrency = null, userCustomProfit = null) => {
  const product = await Product.findById(id).lean();
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  const [settings, profitMaps] = await Promise.all([
    getSettings(),
    getCategoryProfitMap(),
  ]);
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = profitMaps;
  const profitPercentage = resolveProductProfitPercentage(product, globalProfitPercentage, catMap, subCatMap, userCustomProfit);

  const isUserSyp = Boolean(
    userCurrency &&
      (String(userCurrency).toUpperCase().includes('SYP') ||
        String(userCurrency).includes('ل.س') ||
        String(userCurrency).includes('ليرة'))
  );
  const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

  if (userCurrency) {
    if (!isUserSyp) {
      // USD user: strictly block Roya SYP or Syrian Lira products
      const isProductSyp =
        product.source === 'roya_syp' ||
        product.currency === 'ل.س' ||
        (product.currency || '').toUpperCase() === 'SYP' ||
        /ليرة/i.test(product.sourceName || '');
      if (isProductSyp) {
        throw new ApiError('عذراً، هذا المنتج متاح فقط لحسابات الليرة السورية', HTTP_STATUS.FORBIDDEN);
      }
    } else {
      // SYP user: strictly block Roya USD, Brand 1 Card
      const isProductUsd =
        product.source === 'roya_usd' ||
        product.source === 'sw_games' ||
        product.source === 'brand1card' ||
        product.currency === '$' ||
        (product.currency || '').toUpperCase() === 'USD';
      if (isProductUsd) {
        throw new ApiError('عذراً، هذا المنتج متاح فقط لحسابات الدولار ($)', HTTP_STATUS.FORBIDDEN);
      }
    }
  }

  // Helper to extract true min, max, qtyValues from package / rawPayload
  const resolvePackageCounts = (pkg) => {
    const raw = pkg.rawPayload || {};
    const rawMin =
      raw.min_count ??
      raw.minCount ??
      raw.min_qty ??
      raw.min ??
      (raw.qty_values && typeof raw.qty_values === 'object' && !Array.isArray(raw.qty_values)
        ? raw.qty_values.min
        : null);

    const rawMax =
      raw.max_count ??
      raw.maxCount ??
      raw.max_qty ??
      raw.max ??
      (raw.qty_values && typeof raw.qty_values === 'object' && !Array.isArray(raw.qty_values)
        ? raw.qty_values.max
        : null);

    const parsedRawMin =
      rawMin !== null && rawMin !== undefined && !isNaN(Number(rawMin))
        ? parseInt(rawMin, 10)
        : null;
    const parsedRawMax =
      rawMax !== null && rawMax !== undefined && !isNaN(Number(rawMax))
        ? parseInt(rawMax, 10)
        : null;

    let minCount = 1;
    if (pkg.minCount && Number(pkg.minCount) > 1) {
      minCount = Number(pkg.minCount);
    } else if (parsedRawMin && parsedRawMin > 0) {
      minCount = parsedRawMin;
    } else {
      minCount = pkg.minCount || 1;
    }

    let maxCount = null;
    if (pkg.maxCount !== null && pkg.maxCount !== undefined && Number(pkg.maxCount) > 0) {
      maxCount = Number(pkg.maxCount);
    } else if (parsedRawMax && parsedRawMax > 0) {
      maxCount = parsedRawMax;
    }

    const rawQtyValues = pkg.qtyValues || raw.qty_values || raw.qtyValues || null;
    const qtyValues = Array.isArray(rawQtyValues)
      ? rawQtyValues.map(Number).filter((v) => !isNaN(v))
      : null;

    return { minCount, maxCount, qtyValues };
  };

  // 1. If provider is SW Games (رؤيا - ROYA_USD / ROYA_SYP)
  if (
    product.source === 'roya_usd' ||
    product.source === 'roya_syp' ||
    product.source === 'sw_games'
  ) {
    const categoryQuery = {
      category: product.category,
      source: product.source, // Keep strictly within the exact source & currency
      isAvailable: { $ne: false },
    };
    if (product.subCategoryId) {
      categoryQuery.subCategoryId = product.subCategoryId;
    }

    const allCategoryProducts = await Product.find(categoryQuery)
      .sort({ price: 1, name: 1 })
      .lean();

    const hasCurrent = allCategoryProducts.some(
      (p) => p._id.toString() === product._id.toString()
    );
    const list = hasCurrent
      ? allCategoryProducts
      : [product, ...allCategoryProducts];

    const packages = list.map((pkg) => {
      const { minCount, maxCount, qtyValues } = resolvePackageCounts(pkg);

      // Clean package title like the legacy clean_name
      let packageTitle = cleanName(pkg.name);
      const categoryLower = (pkg.category || '').toLowerCase();
      if (categoryLower && packageTitle.toLowerCase().includes(categoryLower)) {
        packageTitle =
          packageTitle.replace(new RegExp(pkg.category, 'gi'), '').trim() ||
          cleanName(pkg.name);
      }

      const baseCost =
        pkg.originalPrice && pkg.originalPrice > 0
          ? pkg.originalPrice
          : pkg.sellingPrice && pkg.sellingPrice > 0
            ? pkg.sellingPrice
            : pkg.price || 0;

      const priceBeforeDiscount =
        profitPercentage > 0
          ? calcSmartPrice(baseCost * (1 + profitPercentage / 100))
          : baseCost;

      const discountPercent = pkg.discountPercent || product.discountPercent || 0;
      const floorPrice = (pkg.source === 'custom' || product.source === 'custom') ? baseCost : calcSmartPrice(baseCost * 1.004);
      let userPrice = priceBeforeDiscount;
      let effectiveDiscount = discountPercent;

      if (discountPercent > 0) {
        const discounted = calcSmartPrice(priceBeforeDiscount * (1 - discountPercent / 100));
        if (discounted < floorPrice) {
          userPrice = Math.max(discounted, floorPrice);
          effectiveDiscount = priceBeforeDiscount > floorPrice
            ? Number((((priceBeforeDiscount - userPrice) / priceBeforeDiscount) * 100).toFixed(2))
            : 0;
        } else {
          userPrice = discounted;
        }
      }

      return {
        id: pkg.externalId || pkg._id.toString(),
        productId: pkg._id.toString(),
        name: packageTitle || pkg.name,
        fullName: pkg.name,
        description: pkg.category,
        price: userPrice,
        priceBeforeDiscount: effectiveDiscount > 0 ? priceBeforeDiscount : null,
        discountPercent: effectiveDiscount,
        costPrice: baseCost,
        originalPrice: baseCost,
        currency: isUserSyp ? 'ل.س' : (pkg.currency || '$'),
        params: (pkg.requiredFields || []).map(
          (f) => f.label || f.key || 'ايدي اللاعب'
        ),
        categoryName: pkg.category,
        available: pkg.isAvailable,
        minCount,
        maxCount,
        qtyValues: qtyValues && qtyValues.length > 0 ? qtyValues : null,
      };
    });

    const rootCounts = resolvePackageCounts(product);
    return {
      product: {
        ...product,
        minCount: rootCounts.minCount,
        maxCount: rootCounts.maxCount,
        qtyValues: rootCounts.qtyValues,
      },
      source: product.source,
      packages,
    };
  }

  // 2. If provider is Brand One Card / Syria Card
  if (product.source === 'syria_card' || product.source === 'brand1card') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const token =
        process.env.BRAND1CARD_API_TOKEN ||
        '3cf13f069cf8786bc75ed75794641e9cf34e467f6fe6ed892a9ff227941ea0b8';

      const baseUrl = product.source === 'brand1card'
        ? (process.env.BRAND1CARD_API_URL || 'https://api.brand-one-card.com/client/api/products')
        : 'https://api.brand1-card.com/client/api/products';

      const res = await fetch(
        `${baseUrl}?products_id=${product.externalId}`,
        {
          headers: {
            'api-token': token,
            'User-Agent': BROWSER_USER_AGENT,
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : json?.data ? json.data : [json];
        const packages = items.map((pkg) => {
          let minCount =
            pkg.min_count || pkg.minCount
              ? parseInt(pkg.min_count || pkg.minCount)
              : product.minCount || 1;
          let maxCount =
            pkg.max_count || pkg.maxCount
              ? parseInt(pkg.max_count || pkg.maxCount)
              : product.maxCount || null;
          let qtyValues = product.qtyValues || null;

          if (
            pkg.qty_values &&
            typeof pkg.qty_values === 'object' &&
            !Array.isArray(pkg.qty_values)
          ) {
            minCount = pkg.qty_values.min ? parseInt(pkg.qty_values.min) : minCount;
            maxCount = pkg.qty_values.max ? parseInt(pkg.qty_values.max) : maxCount;
          } else if (Array.isArray(pkg.qty_values)) {
            qtyValues = pkg.qty_values.map(Number).filter((v) => !isNaN(v));
          }

          const baseCost =
            typeof pkg.price === 'number' && pkg.price > 0
              ? pkg.price
              : parseFloat(pkg.price || product.sellingPrice || product.price || product.originalPrice || 0);

          const priceBeforeDiscount =
            profitPercentage > 0
              ? calcSmartPrice(baseCost * (1 + profitPercentage / 100))
              : baseCost;

          const discountPercent = product.discountPercent || 0;
          const userPrice =
            discountPercent > 0
              ? calcSmartPrice(priceBeforeDiscount * (1 - discountPercent / 100))
              : priceBeforeDiscount;

          return {
            id: pkg.id?.toString() || product.externalId,
            productId: product._id.toString(),
            name: cleanName(pkg.name || product.name),
            fullName: pkg.name || product.name,
            description: pkg.description || product.category,
            price: userPrice,
            priceBeforeDiscount: discountPercent > 0 ? priceBeforeDiscount : null,
            discountPercent,
            costPrice: baseCost,
            originalPrice: product.originalPrice || baseCost,
            currency: isUserSyp ? '\u0644.\u0633' : '$',
            params:
              Array.isArray(pkg.params) && pkg.params.length > 0
                ? pkg.params
                : ['ايدي اللاعب'],
            categoryName: pkg.category_name || product.category,
            available: pkg.available !== false,
            minCount,
            maxCount,
            qtyValues,
          };
        });

        return {
          product,
          source: product.source || 'brand1card',
          packages,
        };
      }
    } catch (err) {
      console.warn('SyriaCard live details fetch error, using stored:', err.message);
    }
  }

  // 3. Fallback for stored products (custom products)
  const isCustom = product.source === 'custom';
  const regularSellingPrice = Number(product.sellingPrice && product.sellingPrice > 0 ? product.sellingPrice : (product.price || 0));
  let fallbackBaseCost = Number(product.originalPrice || 0);
  if (fallbackBaseCost <= 0) {
    if (profitPercentage > 0 && regularSellingPrice > 0) {
      fallbackBaseCost = Number((regularSellingPrice / (1 + profitPercentage / 100)).toFixed(4));
    } else {
      fallbackBaseCost = regularSellingPrice;
    }
  }

  const hasCustomUserProfit = (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit));
  let fallbackPriceBeforeDiscount;
  if (isCustom) {
    if (hasCustomUserProfit && fallbackBaseCost > 0) {
      const customCalculated = calcSmartPrice(fallbackBaseCost * (1 + profitPercentage / 100));
      fallbackPriceBeforeDiscount = Math.min(regularSellingPrice, customCalculated);
    } else {
      fallbackPriceBeforeDiscount = regularSellingPrice;
    }
  } else {
    fallbackPriceBeforeDiscount = profitPercentage > 0
      ? calcSmartPrice(fallbackBaseCost * (1 + profitPercentage / 100))
      : fallbackBaseCost;
  }

  const discountPercent = product.discountPercent || 0;
  const minProfitFloor = hasCustomUserProfit ? 0.4 : 0;
  const floorPrice = calcSmartPrice(fallbackBaseCost * (1 + minProfitFloor / 100));
  let fallbackUserPrice = fallbackPriceBeforeDiscount;
  let effectiveDiscount = discountPercent;
  if (discountPercent > 0 && fallbackBaseCost > 0) {
    const netProfit = Math.max(minProfitFloor, profitPercentage - discountPercent);
    const discounted = calcSmartPrice(fallbackBaseCost * (1 + netProfit / 100));
    fallbackUserPrice = Math.min(fallbackPriceBeforeDiscount, Math.max(discounted, floorPrice));
    effectiveDiscount = fallbackPriceBeforeDiscount > fallbackUserPrice
      ? Number((((fallbackPriceBeforeDiscount - fallbackUserPrice) / fallbackPriceBeforeDiscount) * 100).toFixed(2))
      : 0;
  }

  let resolvedCustomCurrency = (product.currency === 'BOTH' || product.currency === 'ALL' || !product.currency) ? '$' : product.currency;
  let customBaseCost = fallbackBaseCost;
  let customPriceBefore = fallbackPriceBeforeDiscount;
  let customUserPrice = fallbackUserPrice;

  if (isUserSyp) {
    resolvedCustomCurrency = 'ل.س';
    if (isCustom && (product.currency === '$' || product.currency === 'USD' || !product.currency || product.currency === 'BOTH' || product.currency === 'ALL')) {
      customBaseCost = Math.round(fallbackBaseCost * exchangeRate);
      customPriceBefore = Math.round(fallbackPriceBeforeDiscount * exchangeRate);
      const sypFloor = Math.round(customBaseCost * (1 + minProfitFloor / 100));
      const sypDiscounted = effectiveDiscount > 0
        ? Math.round(customPriceBefore * (1 - effectiveDiscount / 100))
        : customPriceBefore;
      customUserPrice = Math.max(sypDiscounted, sypFloor);
    }
  }

  const fallbackCounts = resolvePackageCounts(product);

  return {
    product: {
      ...(product.toObject ? product.toObject() : product),
      currency: resolvedCustomCurrency,
      price: customUserPrice,
      priceBeforeDiscount: discountPercent > 0 ? customPriceBefore : null,
      discountPercent,
      minCount: fallbackCounts.minCount,
      maxCount: fallbackCounts.maxCount,
      qtyValues: fallbackCounts.qtyValues,
    },
    source: product.source,
    packages: [
      {
        id: product.externalId,
        productId: product._id.toString(),
        name: cleanName(product.name),
        fullName: product.name,
        description: product.category,
        price: customUserPrice,
        priceBeforeDiscount: discountPercent > 0 ? customPriceBefore : null,
        discountPercent,
        costPrice: customBaseCost,
        originalPrice: customBaseCost,
        currency: resolvedCustomCurrency,
        params: (product.requiredFields || []).map((f) => f.label || f.key || 'Player_ID'),
        categoryName: product.category,
        available: product.isAvailable,
        minCount: fallbackCounts.minCount,
        maxCount: fallbackCounts.maxCount,
        qtyValues: fallbackCounts.qtyValues,
      },
    ],
  };
};

export const updateProductsDiscount = async (productIds, discountPercent) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ApiError('يرجى تحديد المنتجات المراد تعديل نسبة الخصم لها', HTTP_STATUS.BAD_REQUEST);
  }

  const discount = Math.max(0, Number(discountPercent) || 0);

  // Business logic constraint: discountPercent <= profitPercentage
  const settings = await getSettings();
  const profitPercentage = settings.profitPercentage || 0;

  if (discount > profitPercentage) {
    throw new ApiError(
      `نسبة الخصم (${discount}%) لا يمكن أن تتجاوز نسبة الربح المحددة في النظام (${profitPercentage}%) لمنع البيع بخسارة`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const result = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { discountPercent: discount } }
  );

  return {
    matchedCount: result.matchedCount,
    modifiedCount: result.modifiedCount,
    discountPercent: discount,
  };
};

// 13. Create Custom Product for "مزودي الخاص"
export const createCustomProduct = async (data) => {
  const {
    name,
    category,
    mainCategory,
    price,
    originalPrice,
    sellingPrice,
    currency,
    image,
    isAvailable = true,
    isVisible = true,
    minCount = 1,
    maxCount = null,
    qtyValues = null,
    requiredFields = [],
    note = '',
  } = data;

  if (!name || !name.trim()) {
    throw new ApiError('اسم المنتج مطلوب', HTTP_STATUS.BAD_REQUEST);
  }
  if (!category || !category.trim()) {
    throw new ApiError('فئة / لعبة المنتج مطلوبة', HTTP_STATUS.BAD_REQUEST);
  }

  const cost = Number(originalPrice ?? price) || 0;
  if (cost < 0) {
    throw new ApiError('السعر يجب أن يكون أكبر من أو يساوي الصفر', HTTP_STATUS.BAD_REQUEST);
  }

  const finalSellingPrice = sellingPrice !== undefined && sellingPrice !== null
    ? Number(sellingPrice)
    : Number(price ?? cost);

  const resolvedMainCat = mainCategory && mainCategory.trim()
    ? mainCategory.trim()
    : detectMainCategory(name, category, 'custom');

  // Format required dynamic fields
  let formattedFields = [];
  if (Array.isArray(requiredFields) && requiredFields.length > 0) {
    formattedFields = requiredFields.map((f, idx) => ({
      name: f.name?.trim() || `field_${idx}`,
      label: f.label?.trim() || f.name?.trim() || 'المعرف',
      type: f.type || 'text',
      placeholder: f.placeholder?.trim() || `يرجى إدخال ${f.label || f.name || 'المعرف'}`,
      required: f.required !== false,
    }));
  } else {
    formattedFields.push({
      name: 'Player_ID',
      label: 'ايدي اللاعب (Player ID)',
      type: 'text',
      placeholder: 'يرجى إدخال ايدي الحساب أو اللاعب',
      required: true,
    });
  }

  const externalId = `CUST-${Date.now().toString(36)}-${Math.floor(100 + Math.random() * 900)}`;

  let resolvedCurrency = '$';
  const currNorm = (currency || '').trim().toUpperCase();
  if (currNorm === 'SYP' || currNorm === 'ل.س' || currNorm === 'ليرة') {
    resolvedCurrency = 'ل.س';
  } else if (currNorm === 'USD' || currNorm === '$') {
    resolvedCurrency = '$';
  } else {
    resolvedCurrency = 'BOTH';
  }

  const product = await Product.create({
    externalId,
    source: 'custom',
    sourceName: 'مزودي الخاص',
    name: name.trim(),
    category: category.trim(),
    mainCategory: resolvedMainCat,
    isCategoryOverridden: true,
    originalPrice: cost,
    price: finalSellingPrice,
    sellingPrice: finalSellingPrice,
    currency: resolvedCurrency,
    image: image?.trim() || '',
    isAvailable: isAvailable !== false,
    isVisible: isVisible !== false,
    minCount: Number(minCount) || 1,
    maxCount: maxCount ? Number(maxCount) : null,
    qtyValues: Array.isArray(qtyValues) && qtyValues.length > 0 ? qtyValues.map(Number) : null,
    requiredFields: formattedFields,
    note: note?.trim() || '',
  });

  return product;
};

// 14. Update Custom Product
export const updateCustomProduct = async (id, data) => {
  const product = await Product.findOne({ _id: id, source: 'custom' });
  if (!product) {
    throw new ApiError('المنتج الخاص غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  const {
    name,
    category,
    mainCategory,
    price,
    originalPrice,
    sellingPrice,
    currency,
    image,
    isAvailable,
    isVisible,
    minCount,
    maxCount,
    qtyValues,
    requiredFields,
    note,
  } = data;

  if (name !== undefined) product.name = name.trim();
  if (category !== undefined) product.category = category.trim();
  if (mainCategory !== undefined) product.mainCategory = mainCategory.trim();
  if (originalPrice !== undefined) product.originalPrice = Number(originalPrice);
  if (price !== undefined) {
    product.price = Number(price);
    product.sellingPrice = Number(price);
  }
  if (sellingPrice !== undefined) product.sellingPrice = Number(sellingPrice);
  if (currency !== undefined) {
    const currNorm = (currency || '').trim().toUpperCase();
    if (currNorm === 'SYP' || currNorm === 'ل.س' || currNorm === 'ليرة') {
      product.currency = 'ل.س';
    } else if (currNorm === 'USD' || currNorm === '$') {
      product.currency = '$';
    } else {
      product.currency = '$';
    }
  }
  if (image !== undefined) product.image = image.trim();
  if (isAvailable !== undefined) product.isAvailable = Boolean(isAvailable);
  if (isVisible !== undefined) product.isVisible = Boolean(isVisible);
  if (minCount !== undefined) product.minCount = Number(minCount) || 1;
  if (maxCount !== undefined) product.maxCount = maxCount ? Number(maxCount) : null;
  if (qtyValues !== undefined) {
    product.qtyValues = Array.isArray(qtyValues) && qtyValues.length > 0 ? qtyValues.map(Number) : null;
  }
  if (Array.isArray(requiredFields)) {
    product.requiredFields = requiredFields.map((f, idx) => ({
      name: f.name?.trim() || `field_${idx}`,
      label: f.label?.trim() || f.name?.trim() || 'المعرف',
      type: f.type || 'text',
      placeholder: f.placeholder?.trim() || `يرجى إدخال ${f.label || f.name || 'المعرف'}`,
      required: f.required !== false,
    }));
  }
  if (note !== undefined) product.note = note.trim();

  await product.save();
  return product;
};

// 15. Delete Custom Product
export const deleteCustomProduct = async (id) => {
  const product = await Product.findOne({ _id: id, source: 'custom' });
  if (!product) {
    throw new ApiError('المنتج الخاص غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  await product.deleteOne();
  return { message: 'تم حذف المنتج بنجاح', id };
};

// 16. Update Product Custom Details (Name / Image Override)
export const updateProductCustomDetails = async (id, { name, image } = {}) => {
  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError('المنتج غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  // Preserve original provider name/image if not already saved
  if (!product.providerName) {
    product.providerName = product.name;
  }
  if (!product.providerImage) {
    product.providerImage = product.image;
  }

  if (name !== undefined && name !== null && name.trim()) {
    product.name = name.trim();
    product.customName = name.trim();
    product.isNameOverridden = true;
  }

  if (image !== undefined && image !== null) {
    product.image = image.trim();
    product.customImage = image.trim();
    product.isImageOverridden = true;
  }

  await product.save();
  serverCache.clearAll();
  return product;
};

// 17. Revert Product Custom Details to Original Provider Values
export const revertProductCustomDetails = async (id, { revertName = true, revertImage = true } = {}) => {
  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError('المنتج غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (revertName) {
    if (product.providerName) {
      product.name = product.providerName;
    }
    product.customName = null;
    product.isNameOverridden = false;
  }

  if (revertImage) {
    if (product.providerImage) {
      product.image = product.providerImage;
    }
    product.customImage = null;
    product.isImageOverridden = false;
  }

  await product.save();
  serverCache.clearAll();
  return product;
};

