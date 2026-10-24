import mongoose from 'mongoose';
import { Order } from './orders.model.js';
import { User } from '../users/users.model.js';
import { Transaction } from '../users/transactions.model.js';
import { Product } from '../products/products.model.js';
import { getSettings } from '../settings/settings.service.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { dispatchProviderOrder, checkExternalOrderStatus, checkSwGamesOrdersBatch } from './providerDispatch.service.js';

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

  if (packageId) {
    packageProduct = await Product.findOne({
      $or: [
        { externalId: String(packageId) },
        ...(mongoose.isValidObjectId(packageId) ? [{ _id: packageId }] : []),
      ],
    });
  }

  if (productId) {
    product = await Product.findById(productId);
  }

  const activeItem = packageProduct || product;

  if (activeItem) {
    finalProductName = activeItem.name || finalProductName;
    finalCategory = activeItem.category || finalCategory;
    finalImage = activeItem.image || finalImage;
    source = activeItem.source || source;
  }

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
  const profitPercentage = settings.profitPercentage || 0;
  const discountPercent = activeItem?.discountPercent || product?.discountPercent || 0;

  const baseCost =
    activeItem?.originalPrice && activeItem.originalPrice > 0
      ? activeItem.originalPrice
      : activeItem?.sellingPrice && activeItem.sellingPrice > 0
      ? activeItem.sellingPrice
      : activeItem?.price || 0;

  // Expected price with profit
  const priceBeforeDiscount =
    profitPercentage > 0
      ? Number((baseCost * (1 + profitPercentage / 100)).toFixed(4))
      : baseCost;

  const calculatedSellingPrice =
    discountPercent > 0
      ? Number((priceBeforeDiscount * (1 - discountPercent / 100)).toFixed(4))
      : priceBeforeDiscount;

  // Unit selling price charged to user:
  // Must respect the price displayed on the user's screen (e.g. 2.50)
  let unitSellingPrice = Number(clientBasePrice) || 0;
  if (unitSellingPrice <= 0) {
    unitSellingPrice = calculatedSellingPrice > 0 ? calculatedSellingPrice : baseCost;
  }

  // Unit cost from provider
  let unitCost = baseCost;
  if (unitCost <= 0 && unitSellingPrice > 0) {
    unitCost =
      profitPercentage > 0
        ? Number((unitSellingPrice / (1 + profitPercentage / 100)).toFixed(4))
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

  // 5. Generate unique order ID
  const orderId = `ORD-${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;

  // 6. Dispatch order to external Provider API (SW Games / Brand1Card / Auto1Card)
  const basePayload = {
    externalId: activeItem?.externalId || packageId || product?.externalId,
    targetId: targetId || '',
    costPrice: totalCost,
    quantity: validQuantity,
    extraFields,
  };

  let dispatchResult = {
    success: true,
    status: 'processing',
    providerPayload: basePayload,
    providerResponse: null,
    providerOrderId: null,
  };

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

  await Transaction.create({
    userId: order.userId,
    type: 'refund',
    currency: user.currency || order.currency || 'USD',
    amount: refundAmount,
    costPrice: order.costPrice || 0,
    profit: order.profit || 0,
    productName: order.productName,
    targetId: order.targetId || '',
    orderId: order.orderId,
    previousBalance: prevBal,
    newBalance: newBal,
    note:
      customNote ||
      `استرجاع رصيد تلقائي لإلغاء/فشل الطلب من المزود (#${resultData?.providerOrderNumber || order.providerOrderId || order.orderId}): ${order.productName} (تم استرجاع ${refundAmount} ${order.currency || 'USD'} متضمنة نسبة الربح كاملة)`,
  });

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
