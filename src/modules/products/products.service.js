import { Product } from './products.model.js';
import { normalizeSwGamesProduct } from './adapters/swGames.adapter.js';
import { normalizeAuto1CardProduct } from './adapters/auto1card.adapter.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

// 1. Fetch from SW Games API
export const fetchSwGames = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch('https://sw-games.net/api/fastapi/products', {
      headers: {
        ApiToken: 'i1zz8ajhxca9419asucqcmj6z6',
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GamesHub/1.0',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`SW Games API returned status ${res.status}`);
      return [];
    }

    const data = await res.json();
    const items = data?.data?.products || [];
    return items.map(normalizeSwGamesProduct);
  } catch (error) {
    console.error('SW Games fetch error:', error.message);
    return [];
  }
};

// 2. Fetch from Auto 1 Card API
export const fetchAuto1Card = async () => {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const res = await fetch('https://api.auto1card.com/client/api/products', {
      headers: {
        'api-token': 'vXxwuG4VVYkw9XGS7FCoOjshKTxr4-xV_Wfd7mPp4Sw-p_Q6h8T7hbxSeO11148N',
        Cookie: 'auto1card_v1=a5prjhmv2kpou405uj1bbua91b',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GamesHub/1.0',
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`Auto 1 Card API returned status ${res.status}`);
      return [];
    }

    const items = await res.json();
    if (!Array.isArray(items)) return [];
    return items.map(normalizeAuto1CardProduct);
  } catch (error) {
    console.error('Auto 1 Card fetch error:', error.message);
    return [];
  }
};

// 3. Sync from all providers into MongoDB
export const syncAllProducts = async () => {
  const [swList, auto1List] = await Promise.all([fetchSwGames(), fetchAuto1Card()]);
  const allNormalized = [...swList, ...auto1List];

  if (allNormalized.length === 0) {
    return {
      totalSynced: 0,
      swGamesCount: 0,
      auto1CardCount: 0,
    };
  }

  // High-performance batch upsert in one roundtrip
  const operations = allNormalized.map((item) => ({
    updateOne: {
      filter: { source: item.source, externalId: item.externalId },
      update: {
        $set: {
          name: item.name,
          category: item.category,
          price: item.price,
          originalPrice: item.originalPrice,
          currency: item.currency,
          image: item.image,
          isAvailable: item.isAvailable,
          minCount: item.minCount,
          maxCount: item.maxCount,
          qtyValues: item.qtyValues,
          requiredFields: item.requiredFields,
          sourceName: item.sourceName,
          rawPayload: item.rawPayload,
        },
        $setOnInsert: {
          isVisible: false, // Keep disabled by default until admin reviews
        },
      },
      upsert: true,
    },
  }));

  const bulkResult = await Product.bulkWrite(operations, { ordered: false });

  const totalSynced =
    (bulkResult.upsertedCount || 0) +
    (bulkResult.modifiedCount || 0) +
    (bulkResult.matchedCount || 0);

  return {
    totalSynced,
    swGamesCount: swList.length,
    auto1CardCount: auto1List.length,
  };
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
  if (query.isVisible !== undefined && query.isVisible !== 'all') {
    filter.isVisible = query.isVisible === 'true';
  }
  if (query.search) {
    filter.$or = [
      { name: { $regex: query.search, $options: 'i' } },
      { category: { $regex: query.search, $options: 'i' } },
    ];
  }

  // Exclude rawPayload to keep response lightweight (~60KB instead of 2.5MB)
  const products = await Product.find(filter)
    .select('-rawPayload')
    .sort({ category: 1, name: 1 })
    .lean();

  // Get distinct categories and sources for the admin filter chips
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

// 6. User: Get visible products grouped by Category
export const getUserProducts = async (query = {}) => {
  const filter = { isVisible: true, isAvailable: true };

  if (query.category && query.category !== 'all') {
    filter.category = query.category;
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

// 7. Get Product Details (Auto1Card live query or SW Games category packages)
export const getProductDetails = async (id) => {
  const product = await Product.findById(id).lean();
  if (!product) {
    throw new ApiError('Product not found', HTTP_STATUS.NOT_FOUND);
  }

  // 1. If provider is Auto1Card
  if (product.source === 'auto1card') {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);

      const res = await fetch(
        `https://api.auto1card.com/client/api/products?products_id=${product.externalId}`,
        {
          headers: {
            'api-token':
              process.env.AUTO1CARD_API_TOKEN ||
              'vXxwuG4VVYkw9XGS7FCoOjshKTxr4-xV_Wfd7mPp4Sw-p_Q6h8T7hbxSeO11148N',
            Cookie:
              process.env.AUTO1CARD_COOKIE ||
              'auto1card_v1=a5prjhmv2kpou405uj1bbua91b',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) GamesHub/1.0',
            Accept: 'application/json',
          },
          signal: controller.signal,
        }
      );
      clearTimeout(timeout);

      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];
        const packages = items.map((pkg) => ({
          id: pkg.id?.toString() || product.externalId,
          name: pkg.name || product.name,
          description: pkg.description || '',
          price: typeof pkg.price === 'number' ? pkg.price : parseFloat(pkg.price || product.price),
          currency: '$',
          params: Array.isArray(pkg.params) ? pkg.params : ['ايدي اللاعب'],
          categoryName: pkg.category_name || product.category,
          available: pkg.available !== false,
          minCount: pkg.min_count || pkg.minCount ? parseInt(pkg.min_count || pkg.minCount) : (product.minCount || 1),
          maxCount: pkg.max_count || pkg.maxCount ? parseInt(pkg.max_count || pkg.maxCount) : (product.maxCount || null),
          qtyValues: Array.isArray(pkg.qty_values)
            ? pkg.qty_values.map(Number).filter((v) => !isNaN(v))
            : (product.qtyValues || null),
        }));

        return {
          product,
          source: 'auto1card',
          packages,
        };
      }
    } catch (err) {
      console.warn('Auto1Card live details fetch error, using stored:', err.message);
    }

    // Fallback to stored Auto1Card package
    return {
      product,
      source: 'auto1card',
      packages: [
        {
          id: product.externalId,
          name: product.name,
          description: product.category,
          price: product.price,
          currency: product.currency || '$',
          params: product.requiredFields.map((f) => f.label || f.key),
          categoryName: product.category,
          available: product.isAvailable,
          minCount: product.minCount || 1,
          maxCount: product.maxCount || null,
          qtyValues: product.qtyValues || null,
        },
      ],
    };
  }

  // 2. If provider is SW Games (https://sw-games.net)
  // Retrieve all packages for this game/category so user can scroll and choose with prices!
  const sameCategoryProducts = await Product.find({
    source: 'sw_games',
    category: product.category,
    isVisible: true,
  }).lean();

  const list = sameCategoryProducts.length > 0 ? sameCategoryProducts : [product];

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

    return {
      id: pkg.externalId || pkg._id.toString(),
      productId: pkg._id.toString(),
      name: pkg.name,
      description: pkg.note || pkg.category,
      price: pkg.price,
      currency: pkg.currency || '$',
      params: (pkg.requiredFields || []).map((f) => f.label || f.key),
      categoryName: pkg.category,
      available: pkg.isAvailable,
      minCount,
      maxCount,
      qtyValues: qtyValues && qtyValues.length > 0 ? qtyValues : null,
    };
  });

  return {
    product,
    source: 'sw_games',
    packages,
  };
};
