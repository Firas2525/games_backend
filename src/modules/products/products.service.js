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

  let syncedCount = 0;
  for (const item of allNormalized) {
    await Product.findOneAndUpdate(
      { source: item.source, externalId: item.externalId },
      {
        $set: {
          name: item.name,
          category: item.category,
          originalPrice: item.originalPrice,
          currency: item.currency,
          image: item.image,
          isAvailable: item.isAvailable,
          requiredFields: item.requiredFields,
          sourceName: item.sourceName,
          rawPayload: item.rawPayload,
        },
        $setOnInsert: {
          isVisible: false, // Keep disabled by default until admin reviews
        },
      },
      { upsert: true, new: true }
    );
    syncedCount++;
  }

  return {
    totalSynced: syncedCount,
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

  const products = await Product.find(filter).sort({ category: 1, name: 1 });

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
