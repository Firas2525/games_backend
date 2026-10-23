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

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

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

// 2. Fetch from Brand 1 Card / Syria Card API (سيريا كارد - SYRIA_CARD)
export const fetchBrand1Card = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const token =
      process.env.BRAND1CARD_API_TOKEN ||
      'dc3df6e4e0da815834622859f6142e336cf1c553a627d213';

    const res = await fetch('https://api.brand1-card.com/client/api/products', {
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
        'Brand 1 Card (سيريا كارد) 401 Unauthorized. Server IP might need whitelisting in panel:',
        errJson?.msg || errJson || '401'
      );
      return [];
    }

    if (!res.ok) {
      console.warn(`Brand 1 Card API returned status ${res.status}`);
      return [];
    }

    const json = await res.json();
    if (json && json.status === 'ERROR') {
      console.warn('Brand 1 Card API message:', json.msg || json);
      return [];
    }

    const items = Array.isArray(json) ? json : json?.data || [];
    return items.map(normalizeBrand1CardProduct);
  } catch (error) {
    console.error('Brand 1 Card fetch error:', error.message);
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
      { source: { $in: ['auto1card', 'brand1card'] } },
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
            ...(isOverridden ? {} : { mainCategory: item.mainCategory }),
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
            mainCategory: detectMainCategory(p.name, p.category),
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
    syriaCardCount: brand1List.length + auto1List.length,
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
  } catch (err) {
    console.error('❌ [AutoSync] Failed on startup:', err.message);
  }
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

  const categories = await Product.distinct('category');
  const sources = await Product.distinct('sourceName');

  return {
    products,
    categories,
    sources,
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
  };
  for (const item of sourceAggregation) {
    if (item._id) {
      if (item._id === 'roya_usd' || item._id === 'sw_games') {
        sources.roya_usd = (sources.roya_usd || 0) + item.count;
      } else if (item._id === 'roya_syp') {
        sources.roya_syp = (sources.roya_syp || 0) + item.count;
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

// 6.0 Get all categories with product counts
export const getAllCategories = async () => {
  await ensureDefaultCategories();
  const categories = await Category.find({ isVisible: true }).sort({ sortOrder: 1, createdAt: 1 });

  // Count active products for each category
  const productCounts = await Product.aggregate([
    { $match: { isAvailable: { $ne: false }, isVisible: { $ne: false } } },
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
    productCount: countMap[cat.key] || 0,
  }));
};

// 6.01 Admin: Create new main category
export const createCategory = async (data) => {
  let { key, title, subtitle, icon, color, imageUrl } = data;
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
    sortOrder: Date.now() % 1000,
    isCustom: true,
    isVisible: true,
  });

  return category;
};

// 6.015 Admin: Update existing category (title, image, icon, color, etc.)
export const updateCategory = async (id, data) => {
  const category = await Category.findById(id);
  if (!category) {
    throw new ApiError('القسم غير موجود', HTTP_STATUS.NOT_FOUND);
  }
  const { title, subtitle, icon, color, imageUrl, isVisible, sortOrder } = data;
  if (title !== undefined) category.title = title.trim();
  if (subtitle !== undefined) category.subtitle = subtitle.trim();
  if (icon !== undefined) category.icon = icon.trim();
  if (color !== undefined) category.color = color.trim();
  if (imageUrl !== undefined) category.imageUrl = imageUrl.trim();
  if (isVisible !== undefined) category.isVisible = isVisible;
  if (sortOrder !== undefined) category.sortOrder = Number(sortOrder) || 0;

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
export const getSubCategories = async (mainCategory) => {
  const filter = { isVisible: true };
  if (mainCategory && mainCategory !== 'all') {
    filter.mainCategory = mainCategory;
  }
  const subCategories = await SubCategory.find(filter).sort({ sortOrder: 1, createdAt: -1 }).lean();

  const subCategoryIds = subCategories.map((s) => s._id);
  const products = await Product.find({
    subCategoryId: { $in: subCategoryIds },
    isAvailable: { $ne: false },
    isVisible: { $ne: false },
  }).select('id _id name image price originalPrice currency isAvailable isVisible subCategoryId subCategoryName').lean();

  const productsBySubId = {};
  for (const p of products) {
    const sId = p.subCategoryId?.toString();
    if (!productsBySubId[sId]) productsBySubId[sId] = [];
    productsBySubId[sId].push(p);
  }

  return subCategories.map((sc) => {
    const scProducts = productsBySubId[sc._id.toString()] || [];
    return {
      ...sc,
      id: sc._id,
      productCount: scProducts.length,
      products: scProducts,
      startingPrice: scProducts.length > 0 ? Math.min(...scProducts.map((p) => p.price || p.originalPrice || 0)) : 0,
      currency: scProducts.length > 0 ? scProducts[0].currency : '$',
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
export const getUserProducts = async (query = {}) => {
  const filter = {
    isAvailable: { $ne: false },
    isVisible: { $ne: false }, // Only hide if explicitly marked false
  };

  if (query.category && query.category !== 'all') {
    filter.category = query.category;
  }
  if (query.mainCategory && query.mainCategory !== 'all') {
    filter.mainCategory = query.mainCategory;
  }
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { category: { $regex: query.search, $options: 'i' } },
      { subCategoryName: { $regex: query.search, $options: 'i' } },
    ];
  }

  const products = await Product.find(filter).sort({ category: 1, name: 1 });

  // Fetch subcategories for this view if mainCategory provided
  let subCategories = [];
  try {
    subCategories = await getSubCategories(query.mainCategory || 'all');
  } catch (_) {}

  // Group by category for a cleaner store layout
  const grouped = {};
  for (const p of products) {
    if (!grouped[p.category]) {
      grouped[p.category] = [];
    }
    grouped[p.category].push(p);
  }

  return {
    products,
    grouped,
    categories: Object.keys(grouped),
    subCategories,
  };
};

// 8. Get Product Details (Packages & Pricing modeled after legacy site)
export const getProductDetails = async (id) => {
  const product = await Product.findById(id).lean();
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  // 1. If provider is SW Games (رؤيا - ROYA_USD / ROYA_SYP)
  if (
    product.source === 'roya_usd' ||
    product.source === 'roya_syp' ||
    product.source === 'sw_games'
  ) {
    const categoryQuery = {
      category: product.category,
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

      return {
        id: pkg.externalId || pkg._id.toString(),
        productId: pkg._id.toString(),
        name: packageTitle || pkg.name,
        fullName: pkg.name,
        description: pkg.category,
        price: pkg.price,
        originalPrice: pkg.originalPrice || pkg.price,
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

  // 2. If provider is Brand 1 Card / Syria Card
  if (product.source === 'syria_card' || product.source === 'brand1card') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const token =
        process.env.BRAND1CARD_API_TOKEN ||
        'dc3df6e4e0da815834622859f6142e336cf1c553a627d213';

      const res = await fetch(
        `https://api.brand1-card.com/client/api/products?products_id=${product.externalId}`,
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

          return {
            id: pkg.id?.toString() || product.externalId,
            productId: product._id.toString(),
            name: cleanName(pkg.name || product.name),
            fullName: pkg.name || product.name,
            description: pkg.description || product.category,
            price:
              typeof pkg.price === 'number'
                ? pkg.price
                : parseFloat(pkg.price || product.price),
            originalPrice: product.originalPrice,
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
  return {
    product,
    source: product.source,
    packages: [
      {
        id: product.externalId,
        productId: product._id.toString(),
        name: cleanName(product.name),
        fullName: product.name,
        description: product.category,
        price: product.price,
        originalPrice: product.originalPrice,
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
