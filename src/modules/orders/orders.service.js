import mongoose from 'mongoose';
import { Order } from './orders.model.js';
import { User } from '../users/users.model.js';
import { Transaction } from '../users/transactions.model.js';
import { Product } from '../products/products.model.js';
import { Category } from '../products/categories.model.js';
import { SubCategory } from '../products/subcategories.model.js';
import { getSettings } from '../settings/settings.service.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { dispatchProviderOrder, checkExternalOrderStatus, checkSwGamesOrdersBatch } from './providerDispatch.service.js';

export async function generateShortOrderId() {
  let isUnique = false;
  let code = '';
  let attempts = 0;
  while (!isUnique && attempts < 30) {
    attempts++;
    // Clean 6-digit unique order code (100000 - 999999)
    code = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await Order.findOne({ orderId: code }).select('_id');
    if (!existing) {
      isUnique = true;
    }
  }
  if (!isUnique) {
    // 7-digit fallback if high density
    code = Math.floor(1000000 + Math.random() * 9000000).toString();
  }
  return code;
}

export const executePurchase = async ({
  userId,
  productId,
  packageId,
  productName,
  category,
  image,
  targetId,
  extraFields = {},
  quantity = 1,
  clientBasePrice,
  currency = '$',
}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError('المستخدم غير موجود', HTTP_STATUS.NOT_FOUND);
  }
  if (!user.isActive) {
    throw new ApiError('الحساب غير نشط حالياً', HTTP_STATUS.FORBIDDEN);
  }

  // 1. Fetch exact product / package item
  let product = null;
  let packageProduct = null;
  let finalProductName = productName || 'طلب شحن ألعاب';
  let finalCategory = category || 'ألعاب';
  let finalImage = image || '';
  let source = 'custom';

  if (productId) {
    product = await Product.findById(productId);
  }

  if (packageId) {
    const pkgQuery = {
      $or: [
        { externalId: String(packageId) },
        ...(mongoose.isValidObjectId(packageId) ? [{ _id: packageId }] : []),
      ],
    };
    // Lock package search to the product's source so Brand packages never match a Roya item
    if (product?.source) {
      pkgQuery.source = product.source;
    }
    packageProduct = await Product.findOne(pkgQuery);
  }

  const activeItem = packageProduct || product;

  if (activeItem) {
    finalProductName = activeItem.name || finalProductName;
    finalCategory = activeItem.category || finalCategory;
    finalImage = activeItem.image || finalImage;
  }

  // The authoritative provider source
  source = product?.source || packageProduct?.source || activeItem?.source || 'custom';

  // 1.1 Strict Currency & Source Matching Check (Lira vs Dollar isolation)
  const userCurrency = (user.currency || 'USD').toUpperCase();
  const isUserSyp = userCurrency === 'SYP' || userCurrency === 'ل.س';
  const isProductSyp =
    activeItem?.source === 'roya_syp' ||
    activeItem?.currency === 'ل.س' ||
    (activeItem?.currency || '').toUpperCase() === 'SYP' ||
    currency === 'ل.س' ||
    (currency || '').toUpperCase() === 'SYP';

  if (isUserSyp && !isProductSyp) {
    throw new ApiError(
      'عذراً، حسابك بالليرة السورية ولا يمكنك شراء منتجات من مصدر الدولار ($)',
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (!isUserSyp && isProductSyp) {
    throw new ApiError(
      'عذراً، حسابك بالدولار ولا يمكنك شراء منتجات من مصدر الليرة السورية (ل.س)',
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const effectiveCurrency = isUserSyp ? 'ل.س' : '$';

  // 2. Resolve true base cost and selling price
  const settings = await getSettings();
  let profitPercentage = settings.profitPercentage || 0;
  if (product) {
    if (product.subCategoryId) {
      const subCat = await SubCategory.findById(product.subCategoryId).select('profitPercentage').lean();
      if (subCat && subCat.profitPercentage !== null && subCat.profitPercentage !== undefined && !isNaN(subCat.profitPercentage)) {
        profitPercentage = Number(subCat.profitPercentage);
      }
    }
    if (profitPercentage === (settings.profitPercentage || 0) && product.mainCategory) {
      const cat = await Category.findOne({ key: product.mainCategory }).select('profitPercentage').lean();
      if (cat && cat.profitPercentage !== null && cat.profitPercentage !== undefined && !isNaN(cat.profitPercentage)) {
        profitPercentage = Number(cat.profitPercentage);
      }
    }
  }
  const discountPercent = activeItem?.discountPercent || product?.discountPercent || 0;

  const baseCost =
    activeItem?.originalPrice && activeItem.originalPrice > 0
      ? activeItem.originalPrice
      : activeItem?.sellingPrice && activeItem.sellingPrice > 0
      ? activeItem.sellingPrice
      : activeItem?.price || 0;

  // Expected price with profit (Preserving full 8 decimals for fractional unit prices < 1 to prevent rounding errors)
  const priceBeforeDiscount =
    profitPercentage > 0
      ? (baseCost >= 1 ? Number((baseCost * (1 + profitPercentage / 100)).toFixed(4)) : Number((baseCost * (1 + profitPercentage / 100)).toFixed(8)))
      : baseCost;

  const calculatedSellingPrice =
    discountPercent > 0
      ? (priceBeforeDiscount >= 1 ? Number((priceBeforeDiscount * (1 - discountPercent / 100)).toFixed(4)) : Number((priceBeforeDiscount * (1 - discountPercent / 100)).toFixed(8)))
      : priceBeforeDiscount;

  // Unit selling price charged to user:
  let unitSellingPrice = calculatedSellingPrice > 0 ? calculatedSellingPrice : baseCost;

  // Unit cost from provider
  let unitCost = baseCost;
  if (unitCost <= 0 && unitSellingPrice > 0) {
    unitCost =
      profitPercentage > 0
        ? (unitSellingPrice >= 1 ? Number((unitSellingPrice / (1 + profitPercentage / 100)).toFixed(4)) : Number((unitSellingPrice / (1 + profitPercentage / 100)).toFixed(8)))
        : unitSellingPrice;
  }

  const validQuantity = Math.max(1, Number(quantity) || 1);
  const totalUserPrice = Number((unitSellingPrice * validQuantity).toFixed(4));
  const totalCost = Number((unitCost * validQuantity).toFixed(4));
  const profit = Number(Math.max(0, totalUserPrice - totalCost).toFixed(4));

  // 3. Verify user balance
  const currentBalance = user.balance || 0;
  if (currentBalance < totalUserPrice) {
    throw new ApiError(
      `الرصيد غير كافٍ. رصيدك الحالي هو ${currentBalance.toFixed(2)} ${effectiveCurrency} والمطلوب ${totalUserPrice.toFixed(2)} ${effectiveCurrency}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // 4. Deduct user balance and update metrics
  const previousBalance = currentBalance;
  const newBalance = Number((previousBalance - totalUserPrice).toFixed(4));
  user.balance = Math.max(0, newBalance);
  user.totalSpent = Number(((user.totalSpent || 0) + totalUserPrice).toFixed(4));
  user.totalProfit = Number(((user.totalProfit || 0) + profit).toFixed(4));
  await user.save();

  // 5. Generate clean 6 to 7 digit unique order ID
  const orderId = await generateShortOrderId();

  // 6. Dispatch order to external Provider API (SW Games / Brand1Card / Auto1Card)
  const basePayload = {
    externalId: activeItem?.externalId || packageId || product?.externalId,
    targetId: targetId || '',
    costPrice: totalCost,
    quantity: validQuantity,
    extraFields,
  };

  const isCustomProvider = source === 'custom' || activeItem?.source === 'custom';

  let dispatchResult = {
    success: true,
    status: isCustomProvider ? 'pending' : 'processing',
    providerPayload: isCustomProvider
      ? {
          isManual: true,
          provider: 'مزودي الخاص',
          targetId: targetId || '',
          quantity: validQuantity,
          extraFields,
        }
      : basePayload,
    providerResponse: isCustomProvider
      ? { message: 'طلب قيد المعالجة اليدوية من قبل إدارة المتجر', assignedAt: new Date() }
      : null,
    providerOrderId: isCustomProvider ? orderId : null,
  };

  if (!isCustomProvider) {
    try {
      dispatchResult = await dispatchProviderOrder({
        product: activeItem || product,
        orderId,
        targetId,
        quantity: validQuantity,
        extraFields,
        user,
      });
    } catch (dispErr) {
      console.error('Provider dispatch exception:', dispErr);
      dispatchResult = {
        success: false,
        status: 'failed',
        providerPayload: basePayload,
        providerResponse: { error: dispErr.message },
        providerOrderId: null,
        errorMessage: dispErr.message,
      };
    }
  }

  // 7. Handle Provider Failure with Immediate Refund & Exact Error Reporting
  if (!dispatchResult.success) {
    // Revert user balance deduction immediately (Automatic Refund)
    user.balance = previousBalance;
    user.totalSpent = Number(Math.max(0, (user.totalSpent || 0) - totalUserPrice).toFixed(4));
    user.totalProfit = Number(Math.max(0, (user.totalProfit || 0) - profit).toFixed(4));
    await user.save();

    // Create Order Record with 'failed' status for transparency
    await Order.create({
      orderId,
      userId: user._id,
      productId: activeItem?._id || product?._id || null,
      productName: finalProductName,
      category: finalCategory,
      image: finalImage,
      targetId: targetId || '',
      extraFields,
      quantity: validQuantity,
      source,
      costPrice: totalCost,
      userPrice: totalUserPrice,
      profit: 0,
      profitPercentage,
      discountPercent,
      currency: effectiveCurrency,
      status: 'failed',
      providerOrderId: dispatchResult.providerOrderId || '',
      providerPayload: dispatchResult.providerPayload || basePayload,
      providerResponse: dispatchResult.providerResponse || null,
    });

    const errorDetail = dispatchResult.errorMessage || 'رفض مزود الخدمة الطلب';
    throw new ApiError(
      `تعذر تنفيذ الشحن من المزود: ${errorDetail}. لم يتم خصم أي رصيد من حسابك وتمت إعادة الرصيد لمحفظتك.`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // 8. Create Order Record with full execution details (Successful / Processing Order)
  const order = await Order.create({
    orderId,
    userId: user._id,
    productId: activeItem?._id || product?._id || null,
    productName: finalProductName,
    category: finalCategory,
    image: finalImage,
    targetId: targetId || '',
    extraFields,
    quantity: validQuantity,
    source,
    costPrice: totalCost,
    userPrice: totalUserPrice,
    profit,
    profitPercentage,
    discountPercent,
    currency: effectiveCurrency,
    status: dispatchResult.status || 'processing',
    providerOrderId: dispatchResult.providerOrderId || '',
    providerPayload: dispatchResult.providerPayload || basePayload,
    providerResponse: dispatchResult.providerResponse || null,
  });

  // 9. Create Transaction Record (Successful Purchase)
  const transaction = await Transaction.create({
    userId: user._id,
    type: 'purchase',
    currency: user.currency || 'USD',
    amount: totalUserPrice,
    costPrice: totalCost,
    profit,
    productName: finalProductName,
    targetId: targetId || '',
    orderId,
    previousBalance,
    newBalance,
    note: `شراء: ${finalProductName} (${targetId || 'رقم الحساب'})`,
  });

  return {
    order: order.toJSON(),
    transaction: transaction.toJSON(),
    user: {
      id: user._id,
      balance: user.balance,
      totalSpent: user.totalSpent,
      totalProfit: user.totalProfit,
    },
  };
};

/**
 * Automatically refunds user wallet for a failed/cancelled order with full price (including profit margin).
 * Guaranteed to prevent double refunds via the `refunded` boolean flag.
 */
export const refundOrderWallet = async (order, resultData = null, customNote = '') => {
  if (order.refunded) {
    return false;
  }

  const user = await User.findById(order.userId);
  if (!user) {
    console.error(`User ${order.userId} not found for refunding order ${order.orderId}`);
    return false;
  }

  // Full refund: userPrice = costPrice + profit (everything deducted from user wallet)
  const refundAmount = Number((order.userPrice || 0).toFixed(4));
  const prevBal = Number((user.balance || 0).toFixed(4));
  const newBal = Number((prevBal + refundAmount).toFixed(4));

  user.balance = newBal;
  user.totalSpent = Number(Math.max(0, (user.totalSpent || 0) - refundAmount).toFixed(4));
  user.totalProfit = Number(Math.max(0, (user.totalProfit || 0) - (order.profit || 0)).toFixed(4));
  await user.save();

  order.status = 'failed';
  order.refunded = true;
  if (resultData?.rawData) {
    order.providerResponse = resultData.rawData;
  }
  if (resultData?.providerOrderNumber) {
    order.providerOrderId = resultData.providerOrderNumber;
  }
  await order.save();

  // Normalize currency to prevent Transaction schema validation failure
  const normalizedCurrency = (user?.currency === 'SYP' || order?.currency === 'SYP' || order?.currency === 'ل.س') ? 'SYP' : 'USD';

  try {
    if (refundAmount > 0) {
      await Transaction.create({
        userId: order.userId,
        type: 'refund',
        currency: normalizedCurrency,
        amount: Math.max(0.0001, refundAmount),
        costPrice: order.costPrice || 0,
        profit: order.profit || 0,
        productName: order.productName || 'طلب شحن',
        targetId: order.targetId || '',
        orderId: order.orderId,
        previousBalance: prevBal,
        newBalance: newBal,
        note:
          customNote ||
          `استرجاع رصيد تلقائي لإلغاء/فشل الطلب (#${resultData?.providerOrderNumber || order.providerOrderId || order.orderId}): ${order.productName || ''} (تم استرجاع ${refundAmount} ${normalizedCurrency} متضمنة نسبة الربح كاملة)`,
      });
    }
  } catch (txErr) {
    console.error('[refundOrderWallet] Transaction logging failed (non-fatal):', txErr.message);
  }

  return true;
};

/**
 * Batch syncs orders status with external providers (SW Games & Brand One Card)
 * Automatically triggers wallet refund for any order cancelled or failed by the provider.
 */
export const syncOrdersBatch = async (ordersList) => {
  if (!ordersList || ordersList.length === 0) return 0;

  let updatedCount = 0;
  const swUsdOrders = [];
  const swSypOrders = [];
  const otherOrders = [];

  for (const o of ordersList) {
    const isSw =
      o.source === 'roya_usd' ||
      o.source === 'roya_syp' ||
      o.source === 'sw_games' ||
      (!['brand1card', 'auto1card'].includes(o.source) && (o.providerOrderId || o.providerPayload));

    if (isSw) {
      if (o.source === 'roya_syp' || o.currency === 'SYP') {
        swSypOrders.push(o);
      } else {
        swUsdOrders.push(o);
      }
    } else {
      otherOrders.push(o);
    }
  }

  // 1. SW Games USD batch check (e.g. https://sw-games.net/api/fastapi/checkorders?order_ids=...)
  if (swUsdOrders.length > 0) {
    try {
      const swUsdResults = await checkSwGamesOrdersBatch(swUsdOrders, false);
      for (const order of swUsdOrders) {
        const res = swUsdResults.get(order._id.toString());
        if (res) {
          if (res.status === 'failed' && !order.refunded) {
            await refundOrderWallet(order, res);
            updatedCount++;
          } else if (res.status === 'completed' && order.status !== 'completed') {
            order.status = 'completed';
            if (res.rawData) order.providerResponse = res.rawData;
            if (res.providerOrderNumber) order.providerOrderId = res.providerOrderNumber;
            await order.save();
            updatedCount++;
          }
        }
      }
    } catch (e) {
      console.error('Error batch syncing SW Games USD orders:', e);
    }
  }

  // 2. SW Games SYP batch check
  if (swSypOrders.length > 0) {
    try {
      const swSypResults = await checkSwGamesOrdersBatch(swSypOrders, true);
      for (const order of swSypOrders) {
        const res = swSypResults.get(order._id.toString());
        if (res) {
          if (res.status === 'failed' && !order.refunded) {
            await refundOrderWallet(order, res);
            updatedCount++;
          } else if (res.status === 'completed' && order.status !== 'completed') {
            order.status = 'completed';
            if (res.rawData) order.providerResponse = res.rawData;
            if (res.providerOrderNumber) order.providerOrderId = res.providerOrderNumber;
            await order.save();
            updatedCount++;
          }
        }
      }
    } catch (e) {
      console.error('Error batch syncing SW Games SYP orders:', e);
    }
  }

  // 3. Other orders (e.g. Brand One Card)
  for (const order of otherOrders) {
    try {
      const checkResult = await checkExternalOrderStatus(order);
      if (checkResult.changed && checkResult.status !== order.status) {
        if (checkResult.status === 'failed' && !order.refunded) {
          await refundOrderWallet(order, checkResult);
          updatedCount++;
        } else if (checkResult.status === 'completed') {
          order.status = 'completed';
          if (checkResult.rawData) order.providerResponse = checkResult.rawData;
          await order.save();
          updatedCount++;
        }
      }
    } catch (e) {
      console.error(`Error checking order ${order.orderId}:`, e);
    }
  }

  return updatedCount;
};

export const getUserOrders = async (userId) => {
  // Sync candidate orders (not failed and not yet refunded, or processing) from the last 30 days
  const candidateOrders = await Order.find({
    userId,
    refunded: { $ne: true },
    status: { $ne: 'failed' },
    $or: [
      { providerOrderId: { $exists: true, $ne: '' } },
      { 'providerPayload.params.order_uuid': { $exists: true } },
      { 'providerPayload.params.uuid': { $exists: true } },
      { orderId: { $exists: true } },
    ],
  }).limit(50);

  if (candidateOrders.length > 0) {
    await syncOrdersBatch(candidateOrders);
  }

  return await Order.find({ userId }).sort({ createdAt: -1 });
};

export const getAllOrdersAdmin = async (query = {}) => {
  const filter = {};
  if (query.userId) filter.userId = query.userId;
  if (query.status) filter.status = query.status;
  if (query.source) filter.source = query.source;

  return await Order.find(filter)
    .populate('userId', 'name email avatar balance')
    .sort({ createdAt: -1 });
};

export const checkSingleOrder = async (orderId) => {
  const order = await Order.findOne({
    $or: [{ orderId }, { _id: mongoose.isValidObjectId(orderId) ? orderId : null }],
  });
  if (!order) {
    throw new ApiError('الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (order.status === 'failed' && order.refunded) {
    return { order: order.toJSON(), message: 'الطلب ملغي ومسترجع مسبقاً' };
  }

  let updated = false;
  const isSw =
    order.source === 'roya_usd' ||
    order.source === 'roya_syp' ||
    order.source === 'sw_games' ||
    (!['brand1card', 'auto1card'].includes(order.source));

  if (isSw) {
    const isSyp = order.source === 'roya_syp' || order.currency === 'SYP';
    const batchRes = await checkSwGamesOrdersBatch([order], isSyp);
    const res = batchRes.get(order._id.toString());
    if (res) {
      if (res.status === 'failed' && !order.refunded) {
        await refundOrderWallet(order, res);
        updated = true;
      } else if (res.status === 'completed' && order.status !== 'completed') {
        order.status = 'completed';
        if (res.rawData) order.providerResponse = res.rawData;
        if (res.providerOrderNumber) order.providerOrderId = res.providerOrderNumber;
        await order.save();
        updated = true;
      }
    }
  } else {
    const checkResult = await checkExternalOrderStatus(order);
    if (checkResult.changed) {
      if (checkResult.status === 'failed' && !order.refunded) {
        await refundOrderWallet(order, checkResult);
        updated = true;
      } else if (checkResult.status === 'completed') {
        order.status = 'completed';
        if (checkResult.rawData) order.providerResponse = checkResult.rawData;
        await order.save();
        updated = true;
      }
    }
  }

  return {
    order: order.toJSON(),
    updated,
    status: order.status,
  };
};

export const syncPendingOrders = async () => {
  const pendingOrders = await Order.find({
    refunded: { $ne: true },
    status: { $in: ['processing', 'pending'] },
  }).limit(50);

  const updatedCount = await syncOrdersBatch(pendingOrders);
  return { checkedCount: pendingOrders.length, updatedCount };
};

export const getFinancialStatsAdmin = async () => {
  const [orderTotals, userProfits] = await Promise.all([
    Order.aggregate([
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$userPrice' },
          totalCost: { $sum: '$costPrice' },
          totalProfit: { $sum: '$profit' },
          ordersCount: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $group: {
          _id: '$userId',
          totalSpent: { $sum: '$userPrice' },
          totalProfit: { $sum: '$profit' },
          ordersCount: { $sum: 1 },
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: '$user' },
      {
        $project: {
          userId: '$_id',
          userName: '$user.name',
          userEmail: '$user.email',
          totalSpent: 1,
          totalProfit: 1,
          ordersCount: 1,
        },
      },
      { $sort: { totalProfit: -1 } },
    ]),
  ]);

  const totals = orderTotals[0] || {
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    ordersCount: 0,
  };

  return {
    totals: {
      totalRevenue: Number((totals.totalRevenue || 0).toFixed(2)),
      totalCost: Number((totals.totalCost || 0).toFixed(2)),
      totalProfit: Number((totals.totalProfit || 0).toFixed(2)),
      ordersCount: totals.ordersCount || 0,
    },
    userProfits,
  };
};

/**
 * Admin: Get all orders for 'مزودي الخاص' (custom provider) with stats and filters
 */
export const getCustomOrdersAdmin = async (query = {}) => {
  const customMatch = {
    $or: [
      { source: 'custom' },
      { 'providerPayload.isManual': true },
      { 'providerPayload.provider': 'مزودي الخاص' },
      { source: { $in: ['', null] } },
    ],
  };

  const filter = { ...customMatch };

  if (query.status && query.status !== 'all') {
    if (query.status === 'rejected') {
      filter.status = 'failed';
    } else if (query.status === 'pending') {
      filter.status = { $in: ['pending', 'processing'] };
    } else {
      filter.status = query.status;
    }
  }

  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    filter.$and = [
      customMatch,
      {
        $or: [
          { orderId: { $regex: s, $options: 'i' } },
          { productName: { $regex: s, $options: 'i' } },
          { targetId: { $regex: s, $options: 'i' } },
        ],
      },
    ];
  }

  const page = parseInt(query.page, 10) || 1;
  const limit = parseInt(query.limit, 10) || 100;
  const skip = (page - 1) * limit;

  const [orders, total, countsAgg] = await Promise.all([
    Order.find(filter)
      .populate('userId', 'name email phone balance currency accountNumber')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Order.countDocuments(filter),
    Order.aggregate([
      { $match: customMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);

  const stats = {
    all: 0,
    pending: 0,
    completed: 0,
    cancelled: 0,
    failed: 0,
    rejected: 0,
  };

  for (const item of countsAgg) {
    if (item._id) {
      stats[item._id] = (stats[item._id] || 0) + item.count;
      stats.all += item.count;
    }
  }

  stats.pending = (stats.pending || 0) + (stats.processing || 0);
  stats.rejected = (stats.failed || 0);

  return {
    orders,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    },
    stats,
    counts: stats, // Frontend reads data['counts']
  };
};

/**
 * Admin: Complete custom provider order
 */
export const completeCustomOrder = async (orderId, { adminNote = '', responseData = null } = {}) => {
  const order = await Order.findOne({
    $or: [
      { orderId: String(orderId) },
      ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : []),
    ],
  });
  if (!order) {
    throw new ApiError('الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (order.status === 'completed') {
    return order.toJSON ? order.toJSON() : order;
  }

  if (order.refunded || order.status === 'cancelled') {
    throw new ApiError('لا يمكن إكمال طلب تم إلغاؤه واسترجاع قيمته للزبون مسبقاً', HTTP_STATUS.BAD_REQUEST);
  }

  order.status = 'completed';
  order.providerResponse = {
    ...(order.providerResponse || {}),
    adminNote: adminNote ? adminNote.trim() : '',
    responseData,
    completedAt: new Date(),
    actionBy: 'admin',
  };

  await order.save();
  return order.toJSON ? order.toJSON() : order;
};

/**
 * Admin: Reject / Cancel custom provider order and automatically refund user wallet
 */
export const cancelOrRejectCustomOrder = async (orderId, { reason = '', isReject = false } = {}) => {
  const order = await Order.findOne({
    $or: [
      { orderId: String(orderId) },
      ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : []),
    ],
  });
  if (!order) {
    throw new ApiError('الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  // If already refunded and marked, return cleanly to prevent false error alerts
  if (order.refunded && (order.status === 'failed' || order.status === 'cancelled')) {
    return order.toJSON ? order.toJSON() : order;
  }

  const actionText = isReject ? 'رفض الطلب' : 'إلغاء الطلب';
  const customNote = reason ? `${actionText}: ${reason}` : `${actionText} من قبل الإدارة وإرجاع الرصيد للمحفظة`;

  // Process full wallet refund
  await refundOrderWallet(order, null, customNote);

  order.status = isReject ? 'failed' : 'cancelled';
  order.providerResponse = {
    ...(order.providerResponse || {}),
    adminReason: reason ? reason.trim() : '',
    actionAt: new Date(),
    actionBy: 'admin',
    actionType: isReject ? 'rejected' : 'cancelled',
  };

  await order.save();
  return order.toJSON ? order.toJSON() : order;
};

/**
 * Handle incoming real-time Webhook notifications from Roya (SW Games)
 */
export const handleRoyaWebhook = async (data = {}) => {
  console.log('[Roya Webhook] Received payload:', JSON.stringify(data));
  const orderIdOrUuid =
    data.order_uuid || data.uuid || data.order_id || data.order_number || data.id;

  if (!orderIdOrUuid) {
    return { ok: true, message: 'No order identifier found, acknowledged.' };
  }

  const rawIdStr = String(orderIdOrUuid).trim();
  const cleanOrderId = rawIdStr.includes('-') ? rawIdStr.split('-')[0] : rawIdStr;

  const order = await Order.findOne({
    $or: [
      { providerOrderId: rawIdStr },
      { orderId: cleanOrderId },
      { orderId: rawIdStr },
    ],
  });

  if (!order) {
    console.warn(`[Roya Webhook] No matching order found for ID/UUID: ${orderIdOrUuid}`);
    return { ok: true, message: 'Order not found in database, acknowledged.' };
  }

  const rawStatus = String(
    data.status || data.order_status || data.status_name || ''
  ).toLowerCase();

  // 1. Success / Completed
  if (
    ['1', 'true', 'completed', 'complete', 'done', 'success', 'accepted', 'تم', 'منجز', 'مكتمل'].includes(
      rawStatus
    )
  ) {
    order.status = 'completed';
    order.providerResponse = data;
    await order.save();
    console.log(`[Roya Webhook] Order #${order.orderId} successfully completed.`);
    return { ok: true, status: 'completed' };
  }

  // 2. Failed / Cancelled -> auto refund wallet
  if (
    [
      '2',
      '3',
      'cancelled',
      'canceled',
      'cancel',
      'failed',
      'fail',
      'error',
      'rejected',
      'refused',
      'ملغي',
      'فشل',
      'مرفوض',
    ].includes(rawStatus) ||
    data.error ||
    data.ok === false
  ) {
    await refundOrderWallet(order, { rawData: data });
    console.log(`[Roya Webhook] Order #${order.orderId} failed, wallet refunded.`);
    return { ok: true, status: 'failed_and_refunded' };
  }

  // 3. In Progress / Processing
  if (order.status !== 'completed' && order.status !== 'failed') {
    order.status = 'processing';
    order.providerResponse = data;
    await order.save();
  }

  return { ok: true, status: order.status };
};

