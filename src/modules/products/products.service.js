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
        } catch (_) {}
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

// 3. Sync from all providers into MongoDB (preserving Admin Manual Overrides)
export const syncAllProducts = async () => {
  // First, migrate any legacy 'sw_games' source name to 'roya_usd'
  try {
    await Product.updateMany(
      { source: 'sw_games' },
      { $set: { source: 'roya_usd', sourceName: 'رؤيا دولار' } }
    );
    await Product.updateMany(
      { source: 'auto1card' },
      { $set: { source: 'syria_card', sourceName: 'سيريا كارد' } }
    );
    await Product.updateMany(
      { isVisible: false },
      { $set: { isVisible: true } }
    );
  } catch (e) {
    console.warn('Legacy source migration note:', e.message);
  }

  const [swUsdList, swSypList, auto1List, brand1List] = await Promise.all([
    fetchSwGamesUsd(),
    fetchSwGamesSyp(),
    fetchAuto1Card(),
    fetchBrand1Card(),
  ]);

  const allNormalized = [...swUsdList, ...swSypList, ...auto1List, ...brand1List];

  if (allNormalized.length === 0) {
    return {
      totalSynced: 0,
      royaUsdCount: 0,
      royaSypCount: 0,
      syriaCardCount: 0,
    };
  }

  // Load existing overridden products so their mainCategory is NOT overwritten
  const overridden = await Product.find({ isCategoryOverridden: true })
    .select('source externalId')
    .lean();
  const overriddenSet = new Set(overridden.map((p) => `${p.source}:${p.externalId}`));

  // Batch operations: Visible by default so user sees items immediately!
  const operations = allNormalized.map((item) => {
    const isOverridden = overriddenSet.has(`${item.source}:${item.externalId}`);
    const updateDoc = {
      name: item.name,
      category: item.category,
      price: item.price,
      originalPrice: item.originalPrice,
      currency: item.currency,
      image: item.image,
      isAvailable: item.isAvailable,
      isVisible: true, // Visible by default like legacy site
      minCount: item.minCount,
      maxCount: item.maxCount,
      qtyValues: item.qtyValues,
      requiredFields: item.requiredFields,
      sourceName: item.sourceName,
      rawPayload: item.rawPayload,
    };

    // Only update mainCategory if admin has not manually overridden it
    if (!isOverridden) {
      updateDoc.mainCategory = item.mainCategory;
    }

    return {
      updateOne: {
        filter: { source: item.source, externalId: item.externalId },
        update: {
          $set: updateDoc,
          $setOnInsert: {
            isCategoryOverridden: false,
          },
        },
        upsert: true,
      },
    };
  });

  const bulkResult = await Product.bulkWrite(operations, { ordered: false });

  // Update existing products in DB to ensure proper mainCategory and visibility
  const allExisting = await Product.find({ isCategoryOverridden: { $ne: true } }).lean();
  if (allExisting.length > 0) {
    const reclassOps = allExisting.map((p) => ({
      updateOne: {
        filter: { _id: p._id },
        update: {
          $set: {
            mainCategory: detectMainCategory(p.name, p.category, p.source),
            isVisible: true,
          },
        },
      },
    }));
    await Product.bulkWrite(reclassOps, { ordered: false });
  }

  const totalSynced =
    (bulkResult.upsertedCount || 0) +
    (bulkResult.modifiedCount || 0) +
    (bulkResult.matchedCount || 0);

  return {
    totalSynced,
    royaUsdCount: swUsdList.length,
    royaSypCount: swSypList.length,
    syriaCardCount: auto1List.length,
    brand1CardCount: brand1List.length,
  };
};

// Standalone function to reclassify all non-overridden products
export const reclassifyAllProducts = async () => {
  const allExisting = await Product.find({ isCategoryOverridden: { $ne: true } }).lean();
  if (allExisting.length === 0) {
    return { reclassifiedCount: 0, message: 'لا توجد منتجات بحاجة لإعادة الفرز' };
  }

  const reclassOps = allExisting.map((p) => ({
    updateOne: {
      filter: { _id: p._id },
      update: {
        $set: {
          mainCategory: detectMainCategory(p.name, p.category, p.source),
          isVisible: true,
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
    // Seed legacy admin overrides if present
    await seedLegacyOverrides().catch(() => {});
    const result = await syncAllProducts();
    console.log('✅ [AutoSync] Sync completed successfully:', result);

    // Auto-migrate any custom products created with '$' or null to 'BOTH' so all users see them
    try {
      const customMigrate = await Product.updateMany(
        { source: 'custom', currency: { $in: ['$', 'USD', null] } },
        { $set: { currency: 'BOTH' } }
      );
      if (customMigrate.modifiedCount > 0) {
        console.log(`✅ [AutoSync] Migrated ${customMigrate.modifiedCount} custom products to 'BOTH' currencies.`);
      }
    } catch (_) {}
  } catch (err) {
    console.error('❌ [AutoSync] Failed on startup:', err.message);
  }
};

// Helpers: Resolve category-specific profit percentage
export const getCategoryProfitMap = async () => {
  try {
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
    return { catMap, subCatMap };
  } catch (err) {
    console.warn('[getCategoryProfitMap] error:', err.message);
    return { catMap: {}, subCatMap: {} };
  }
};

export const resolveProductProfitPercentage = (product, globalProfit, catMap = {}, subCatMap = {}) => {
  if (product) {
    const subId = product.subCategoryId ? product.subCategoryId.toString() : null;
    if (subId && subCatMap[subId] !== undefined) {
      return subCatMap[subId];
    }
    if (product.mainCategory && catMap[product.mainCategory] !== undefined) {
      return catMap[product.mainCategory];
    }
  }
  return globalProfit || 0;
};

// 4. Admin: Get all normalized products with filters
export const getAdminProducts = async (query = {}) => {
  const filter = {};

  if (query.source && query.source !== 'all') {
    filter.source = query.source;
  }
  if (query.category && query.category !== 'all') {
    filter.category = query.category;
  }
  if (query.mainCategory && query.mainCategory !== 'all') {
    filter.mainCategory = query.mainCategory;
  }
  if (query.isVisible !== undefined && query.isVisible !== 'all') {
    filter.isVisible = query.isVisible === 'true';
  }
  if (query.hasDiscount === 'true' || query.discounted === 'true') {
    filter.discountPercent = { $gt: 0 };
  }
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { category: { $regex: query.search, $options: 'i' } },
    ];
  }

  const products = await Product.find(filter)
    .select('-rawPayload')
    .sort({ category: 1, name: 1 })
    .lean();

  const settings = await getSettings();
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = await getCategoryProfitMap();

  const mappedProducts = products.map((p) => {
    const baseCost = p.originalPrice && p.originalPrice > 0 ? p.originalPrice : (p.price || 0);
    const effectiveProfit = resolveProductProfitPercentage(p, globalProfitPercentage, catMap, subCatMap);
    const calculatedPrice = effectiveProfit > 0
      ? calcSmartPrice(baseCost * (1 + effectiveProfit / 100))
      : baseCost;
    const discountPercent = p.discountPercent || 0;
    const finalPrice = discountPercent > 0
      ? calcSmartPrice(calculatedPrice * (1 - discountPercent / 100))
      : calculatedPrice;
    return {
      ...p,
      costPrice: baseCost,
      calculatedPrice,
      priceBeforeDiscount: calculatedPrice,
      price: finalPrice,
      discountPercent,
      profitPercentage: effectiveProfit,
    };
  });

  const categories = await Product.distinct('category');
  const sources = await Product.distinct('sourceName');

  return {
    products: mappedProducts,
    categories,
    sources,
    profitPercentage: globalProfitPercentage,
    totalCount: products.length,
  };
};

// 4.1 Live Verified Catalog Statistics
export const getCatalogStats = async () => {
  const [totalProducts, activeProducts, categoryAggregation, sourceAggregation] = await Promise.all([
    Product.countDocuments(),
    Product.countDocuments({ isVisible: true }),
    Product.aggregate([
      { $group: { _id: '$mainCategory', count: { $sum: 1 } } },
    ]),
    Product.aggregate([
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
    syria_card: 0,
    custom: 0,
  };
  for (const item of sourceAggregation) {
    if (item._id) {
      if (item._id === 'roya_usd' || item._id === 'sw_games') {
        sources.roya_usd = (sources.roya_usd || 0) + item.count;
      } else if (item._id === 'roya_syp') {
        sources.roya_syp = (sources.roya_syp || 0) + item.count;
      } else if (item._id === 'custom') {
        sources.custom = (sources.custom || 0) + item.count;
      } else {
        sources.syria_card = (sources.syria_card || 0) + item.count;
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
};

// Helper: Build query filter matching user currency (Lira vs Dollar separation)
export const buildCurrencyProductFilter = (currencyStr) => {
  if (!currencyStr) return null;
  const c = String(currencyStr).trim().toUpperCase();
  if (c === 'SYP' || c === 'ل.س' || c === 'ليرة' || c === 'SYRIAN POUND') {
    // SYP USER: Strict isolation for providers, but include custom provider products if SYP or BOTH/ALL
    return {
      $or: [
        {
          $and: [
            { source: { $nin: ['roya_usd', 'sw_games'] } },
            { currency: { $nin: ['$', 'USD', 'usd'] } },
            {
              $or: [
                { source: 'roya_syp' },
                { currency: { $in: ['ل.س', 'SYP', 'syp', 'BOTH', 'ALL'] } },
                { sourceName: { $regex: 'ليرة', $options: 'i' } },
              ],
            },
          ],
        },
        {
          source: 'custom',
          currency: { $in: ['ل.س', 'SYP', 'syp', 'BOTH', 'ALL', 'both', 'all'] },
        },
      ],
    };
  }
  if (c === 'USD' || c === '$' || c === 'دولار') {
    // USD USER: Strict isolation for providers, but include custom provider products if USD or BOTH/ALL
    return {
      $or: [
        {
          $and: [
            { source: { $ne: 'roya_syp' } },
            { currency: { $nin: ['ل.س', 'SYP', 'syp'] } },
            { sourceName: { $not: { $regex: 'ليرة', $options: 'i' } } },
          ],
        },
        {
          source: 'custom',
          currency: { $in: ['$', 'USD', 'usd', 'BOTH', 'ALL', 'both', 'all'] },
        },
      ],
    };
  }
  return null;
};

// 6.0 Get all categories with product counts (filtered by user currency)
export const getAllCategories = async (userCurrency = null) => {
  await ensureDefaultCategories();
  const categories = await Category.find({ isVisible: true }).sort({ sortOrder: 1, createdAt: 1 });

  const currencyFilter = buildCurrencyProductFilter(userCurrency);
  const matchFilter = { isAvailable: { $ne: false }, isVisible: { $ne: false } };
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

  return categories.map((cat) => ({
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
  return { message: 'تم حذف القسم بنجاح وإعادة تعيين المنتجات التابعة له', id };
};

// 6. Admin: Update Main Category manually (Sets isCategoryOverridden = true)
export const updateProductMainCategory = async (id, mainCategory) => {
  if (!mainCategory || !mainCategory.trim()) {
    throw new ApiError('التصنيف الرئيسي مطلوب', HTTP_STATUS.BAD_REQUEST);
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  product.mainCategory = mainCategory.trim();
  product.isCategoryOverridden = true;
  await product.save();
  return product;
};

// 6.1 Admin: Bulk update category for selected items (Batch Move)
export const bulkUpdateProductsCategory = async (productIds, mainCategory) => {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ApiError('يجب تحديد عنصر واحد على الأقل لنقله', HTTP_STATUS.BAD_REQUEST);
  }
  if (!mainCategory || !mainCategory.trim()) {
    throw new ApiError('يجب اختيار القسم الهدف', HTTP_STATUS.BAD_REQUEST);
  }

  const result = await Product.updateMany(
    { _id: { $in: productIds } },
    { $set: { mainCategory: mainCategory.trim(), isCategoryOverridden: true } }
  );

  return {
    modifiedCount: result.modifiedCount,
    mainCategory: mainCategory.trim(),
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

// 6.3 Sub-Categories Management (Groups within a Main Category)
export const getSubCategories = async (mainCategory, userCurrency = null) => {
  const filter = { isVisible: true };
  if (mainCategory && mainCategory !== 'all') {
    filter.mainCategory = mainCategory;
  }
  const subCategories = await SubCategory.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();

  const subCategoryIds = subCategories.map((s) => s._id);
  const productMatch = {
    subCategoryId: { $in: subCategoryIds },
    isAvailable: { $ne: false },
    isVisible: { $ne: false },
  };

  const currencyFilter = buildCurrencyProductFilter(userCurrency);
  if (currencyFilter) {
    productMatch.$and = [currencyFilter];
  }

  const products = await Product.find(productMatch).select(
    'id _id name image price originalPrice currency isAvailable isVisible subCategoryId subCategoryName source'
  ).lean();

  const productsBySubId = {};
  for (const p of products) {
    const sId = p.subCategoryId?.toString();
    if (!productsBySubId[sId]) productsBySubId[sId] = [];
    productsBySubId[sId].push(p);
  }

  return subCategories.map((sc) => {
    const scProducts = productsBySubId[sc._id.toString()] || [];
    const validPrices = scProducts
      .map((p) => (p.sellingPrice && p.sellingPrice > 0 ? p.sellingPrice : (p.price && p.price > 0 ? p.price : (p.originalPrice || 0))))
      .filter((pr) => pr > 0);
    const startingPrice = validPrices.length > 0 ? Math.min(...validPrices) : 0;

    return {
      ...sc,
      id: sc._id,
      productCount: scProducts.length,
      products: scProducts,
      startingPrice,
      currency: scProducts.length > 0 ? scProducts[0].currency : (userCurrency === 'SYP' ? 'ل.س' : '$'),
    };
  });
};

export const createSubCategory = async (data) => {
  let { mainCategory, name, imageUrl, productIds } = data;
  if (!name || !name.trim()) {
    throw new ApiError('اسم التصنيف الفرعي مطلوب', HTTP_STATUS.BAD_REQUEST);
  }
  if (!mainCategory || !mainCategory.trim()) {
    throw new ApiError('القسم الرئيسي مطلوب', HTTP_STATUS.BAD_REQUEST);
  }

  const subCategory = await SubCategory.create({
    mainCategory: mainCategory.trim(),
    name: name.trim(),
    imageUrl: imageUrl?.trim() || '',
    isVisible: true,
  });

  if (Array.isArray(productIds) && productIds.length > 0) {
    await Product.updateMany(
      { _id: { $in: productIds } },
      {
        $set: {
          mainCategory: mainCategory.trim(),
          subCategoryId: subCategory._id,
          subCategoryName: subCategory.name,
          subCategoryImage: subCategory.imageUrl,
          isCategoryOverridden: true,
        },
      }
    );
  }

  return subCategory;
};

export const updateSubCategory = async (id, data) => {
  const subCategory = await SubCategory.findById(id);
  if (!subCategory) {
    throw new ApiError('التصنيف الفرعي غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  const { name, imageUrl, mainCategory, productIds, isVisible } = data;
  if (name !== undefined) subCategory.name = name.trim();
  if (imageUrl !== undefined) subCategory.imageUrl = imageUrl.trim();
  if (mainCategory !== undefined) subCategory.mainCategory = mainCategory.trim();
  if (isVisible !== undefined) subCategory.isVisible = isVisible;
  await subCategory.save();

  await Product.updateMany(
    { subCategoryId: subCategory._id },
    {
      $set: {
        subCategoryName: subCategory.name,
        subCategoryImage: subCategory.imageUrl,
        ...(mainCategory ? { mainCategory: subCategory.mainCategory } : {}),
      },
    }
  );

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
          isCategoryOverridden: true,
        },
      }
    );
  }

  return subCategory;
};

export const deleteSubCategory = async (id) => {
  const subCategory = await SubCategory.findById(id);
  if (!subCategory) {
    throw new ApiError('التصنيف الفرعي غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  await Product.updateMany(
    { subCategoryId: subCategory._id },
    { $set: { subCategoryId: null, subCategoryName: '', subCategoryImage: '' } }
  );

  await subCategory.deleteOne();
  return { message: 'تم حذف التصنيف الفرعي بنجاح وإلغاء تجميع المنتجات التابعة له', id };
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

  return { modifiedCount: result.modifiedCount };
};

// 7. User: Get visible products grouped by Category (All active products visible by default)
export const getUserProducts = async (query = {}, userCurrency = null) => {
  const andClauses = [
    { isAvailable: { $ne: false } },
    { isVisible: { $ne: false } },
  ];

  const currencyFilter = buildCurrencyProductFilter(userCurrency || query.currency);
  if (currencyFilter) {
    andClauses.push(currencyFilter);
  }

  if (query.category && query.category !== 'all') {
    andClauses.push({ category: query.category });
  }
  if (query.mainCategory && query.mainCategory !== 'all') {
    andClauses.push({ mainCategory: query.mainCategory });
  }
  if (query.search) {
    andClauses.push({
      $or: [
        { name: { $regex: query.search, $options: 'i' } },
        { category: { $regex: query.search, $options: 'i' } },
        { subCategoryName: { $regex: query.search, $options: 'i' } },
      ],
    });
  }

  const filter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };

  const settings = await getSettings();
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = await getCategoryProfitMap();

  const products = await Product.find(filter).sort({ category: 1, name: 1 });
  const mappedProducts = products.map((p) => {
    const doc = p.toObject ? p.toObject() : { ...p };
    const effectiveProfit = resolveProductProfitPercentage(doc, globalProfitPercentage, catMap, subCatMap);
    const baseCost =
      doc.sellingPrice !== null && doc.sellingPrice !== undefined && doc.sellingPrice > 0
        ? doc.sellingPrice
        : doc.price && doc.price > 0
        ? doc.price
        : doc.originalPrice || 0;
    const priceBeforeDiscount =
      effectiveProfit > 0
        ? calcSmartPrice(baseCost * (1 + effectiveProfit / 100))
        : baseCost;
    const discountPercent = doc.discountPercent || 0;
    const finalPrice =
      discountPercent > 0
        ? calcSmartPrice(priceBeforeDiscount * (1 - discountPercent / 100))
        : priceBeforeDiscount;
    return {
      ...doc,
      costPrice: baseCost,
      price: finalPrice,
      priceBeforeDiscount: discountPercent > 0 ? priceBeforeDiscount : null,
      discountPercent,
      profitPercentage: effectiveProfit,
    };
  });

  // Fetch subcategories for this view if mainCategory provided (with user currency)
  let subCategories = [];
  try {
    subCategories = await getSubCategories(query.mainCategory || 'all', userCurrency);
  } catch (_) {}

  // Group by category for a cleaner store layout
  const grouped = {};
  for (const p of mappedProducts) {
    if (!grouped[p.category]) {
      grouped[p.category] = [];
    }
    grouped[p.category].push(p);
  }

  return {
    products: mappedProducts,
    grouped,
    categories: Object.keys(grouped),
    subCategories,
  };
};

// 8. Get Product Details (Packages & Pricing modeled after legacy site)
export const getProductDetails = async (id, userCurrency = null) => {
  const product = await Product.findById(id).lean();
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  const settings = await getSettings();
  const globalProfitPercentage = settings.profitPercentage || 0;
  const { catMap, subCatMap } = await getCategoryProfitMap();
  const profitPercentage = resolveProductProfitPercentage(product, globalProfitPercentage, catMap, subCatMap);

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

    const allCategoryProducts = await Product.find(categoryQuery)
      .sort({ price: 1, name: 1 })
      .lean();

    const list = allCategoryProducts.length > 0 ? allCategoryProducts : [product];

    const packages = list.map((pkg) => {
      const raw = pkg.rawPayload || {};
      const minCount = pkg.minCount || (raw.minCount ? parseInt(raw.minCount) : 1);
      const maxCount =
        pkg.maxCount !== undefined && pkg.maxCount !== null
          ? pkg.maxCount
          : raw.maxCount
          ? parseInt(raw.maxCount)
          : null;
      const rawQtyValues = pkg.qtyValues || raw.qty_values || raw.qtyValues || null;
      const qtyValues = Array.isArray(rawQtyValues)
        ? rawQtyValues.map(Number).filter((v) => !isNaN(v))
        : null;

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
      const userPrice =
        discountPercent > 0
          ? calcSmartPrice(priceBeforeDiscount * (1 - discountPercent / 100))
          : priceBeforeDiscount;

      return {
        id: pkg.externalId || pkg._id.toString(),
        productId: pkg._id.toString(),
        name: packageTitle || pkg.name,
        fullName: pkg.name,
        description: pkg.category,
        price: userPrice,
        priceBeforeDiscount: discountPercent > 0 ? priceBeforeDiscount : null,
        discountPercent,
        costPrice: baseCost,
        originalPrice: baseCost,
        currency: pkg.currency || (pkg.source === 'roya_syp' ? 'ل.س' : '$'),
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

    return {
      product,
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
            currency: '$',
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
          source: 'syria_card',
          packages,
        };
      }
    } catch (err) {
      console.warn('SyriaCard live details fetch error, using stored:', err.message);
    }
  }

  // 3. Fallback for stored products
  const fallbackBaseCost =
    product.originalPrice && product.originalPrice > 0
      ? product.originalPrice
      : product.sellingPrice && product.sellingPrice > 0
      ? product.sellingPrice
      : product.price || 0;

  const fallbackPriceBeforeDiscount =
    profitPercentage > 0
      ? calcSmartPrice(fallbackBaseCost * (1 + profitPercentage / 100))
      : fallbackBaseCost;

  const discountPercent = product.discountPercent || 0;
  const fallbackUserPrice =
    discountPercent > 0
      ? calcSmartPrice(fallbackPriceBeforeDiscount * (1 - discountPercent / 100))
      : fallbackPriceBeforeDiscount;

  return {
    product: {
      ...(product.toObject ? product.toObject() : product),
      price: fallbackUserPrice,
      priceBeforeDiscount: discountPercent > 0 ? fallbackPriceBeforeDiscount : null,
      discountPercent,
    },
    source: product.source,
    packages: [
      {
        id: product.externalId,
        productId: product._id.toString(),
        name: cleanName(product.name),
        fullName: product.name,
        description: product.category,
        price: fallbackUserPrice,
        priceBeforeDiscount: discountPercent > 0 ? fallbackPriceBeforeDiscount : null,
        discountPercent,
        costPrice: fallbackBaseCost,
        originalPrice: fallbackBaseCost,
        currency: product.currency || '$',
        params: product.requiredFields.map((f) => f.label || f.key || 'ايدي اللاعب'),
        categoryName: product.category,
        available: product.isAvailable,
        minCount: product.minCount || 1,
        maxCount: product.maxCount || null,
        qtyValues: product.qtyValues || null,
      },
    ],
  };
};

// 12. Batch or Single Product Discount Update
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

  let resolvedCurrency = 'BOTH';
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
      product.currency = 'BOTH';
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

