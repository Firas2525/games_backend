import { Order } from './orders.model.js';
import { User } from '../users/users.model.js';
import { Transaction } from '../users/transactions.model.js';
import { Product } from '../products/products.model.js';
import { getSettings } from '../settings/settings.service.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

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

  // 1. Fetch product to determine true base cost
  let product = null;
  let unitCost = 0;
  let finalProductName = productName || 'طلب شحن ألعاب';
  let finalCategory = category || 'ألعاب';
  let finalImage = image || '';
  let source = 'custom';

  if (productId) {
    product = await Product.findById(productId);
    if (product) {
      finalProductName = product.name;
      finalCategory = product.category;
      finalImage = product.image || finalImage;
      source = product.source;
      unitCost = product.originalPrice && product.originalPrice > 0 ? product.originalPrice : (product.price || 0);
    }
  }

  if ((!unitCost || unitCost <= 0) && clientBasePrice !== undefined && clientBasePrice !== null) {
    unitCost = Number(clientBasePrice) || 0;
  }

  // 1.1 Strict Currency & Source Matching Check (Lira vs Dollar isolation)
  const userCurrency = (user.currency || 'USD').toUpperCase();
  const isUserSyp = userCurrency === 'SYP' || userCurrency === 'ل.س';
  const isProductSyp =
    product?.source === 'roya_syp' ||
    product?.currency === 'ل.س' ||
    (product?.currency || '').toUpperCase() === 'SYP' ||
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

  const validQuantity = Math.max(1, Number(quantity) || 1);
  const totalCost = Number((unitCost * validQuantity).toFixed(4));

  // 2. Fetch current profit margin percentage from settings & product discount
  const settings = await getSettings();
  const profitPercentage = settings.profitPercentage || 0;
  const discountPercent = product?.discountPercent || 0;

  // 3. User Price = cost + profit margin - discount
  const normalPrice =
    profitPercentage > 0
      ? Number((totalCost * (1 + profitPercentage / 100)).toFixed(4))
      : totalCost;

  const totalUserPrice =
    discountPercent > 0
      ? Number((normalPrice * (1 - discountPercent / 100)).toFixed(4))
      : normalPrice;

  const profit = Number(Math.max(0, totalUserPrice - totalCost).toFixed(4));

  // 4. Verify user balance
  const currentBalance = user.balance || 0;
  if (currentBalance < totalUserPrice) {
    throw new ApiError(
      `الرصيد غير كافٍ. رصيدك الحالي هو ${currentBalance.toFixed(2)} ${effectiveCurrency} والمطلوب ${totalUserPrice.toFixed(2)} ${effectiveCurrency}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // 5. Deduct user balance and update metrics
  const previousBalance = currentBalance;
  const newBalance = Number((previousBalance - totalUserPrice).toFixed(4));
  user.balance = Math.max(0, newBalance);
  user.totalSpent = Number(((user.totalSpent || 0) + totalUserPrice).toFixed(4));
  user.totalProfit = Number(((user.totalProfit || 0) + profit).toFixed(4));
  await user.save();

  // 6. Generate unique order ID
  const orderId = `ORD-${Date.now().toString().slice(-6)}${Math.floor(1000 + Math.random() * 9000)}`;

  // 7. What is sent to provider API is the BASE cost and payload (NOT user price)
  const providerPayload = {
    externalId: product?.externalId || packageId,
    targetId: targetId || '',
    costPrice: totalCost, // Base price sent to provider
    quantity: validQuantity,
    extraFields,
  };

  // 8. Create Order Record
  const order = await Order.create({
    orderId,
    userId: user._id,
    productId: product?._id || null,
    productName: finalProductName,
    category: finalCategory,
    image: finalImage,
    targetId: targetId || '',
    extraFields,
    source,
    costPrice: totalCost,
    userPrice: totalUserPrice,
    profit,
    profitPercentage,
    discountPercent,
    currency: effectiveCurrency,
    status: 'completed',
    providerPayload,
  });

  // 9. Create Transaction Record
  const transaction = await Transaction.create({
    userId: user._id,
    type: 'purchase',
    currency: user.currency || 'USD',
    amount: totalUserPrice, // What the user paid
    costPrice: totalCost,   // Cost from provider
    profit,                 // Profit earned
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

export const getUserOrders = async (userId) => {
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
