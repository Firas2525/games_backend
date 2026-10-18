import { Product } from './products.model.js';
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

// 6. Admin: Update Main Category manually (Sets isCategoryOverridden = true)
export const updateProductMainCategory = async (id, mainCategory) => {
  const allowed = [
    'games',
    'apps',
    'social',
    'subscriptions',
    'numbers',
    'cards',
    'payment',
  ];
  if (!allowed.includes(mainCategory)) {
    throw new ApiError(
      `Invalid mainCategory. Allowed values: ${allowed.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const product = await Product.findById(id);
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  product.mainCategory = mainCategory;
  product.isCategoryOverridden = true;
  await product.save();
  return product;
};

// 6.1 Admin: Bulk update category for all items in a group
export const updateCategoryGroup = async (categoryName, mainCategory) => {
  const allowed = [
    'games',
    'apps',
    'social',
    'subscriptions',
    'numbers',
    'cards',
    'payment',
  ];
  if (!allowed.includes(mainCategory)) {
    throw new ApiError(
      `Invalid mainCategory. Allowed values: ${allowed.join(', ')}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const result = await Product.updateMany(
    { category: categoryName },
    { $set: { mainCategory, isCategoryOverridden: true } }
  );

  return {
    category: categoryName,
    mainCategory,
    modifiedCount: result.modifiedCount,
  };
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
    ];
  }

  const products = await Product.find(filter).sort({ category: 1, name: 1 });

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
