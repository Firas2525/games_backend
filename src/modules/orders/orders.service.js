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
import { sendAdminNotification, sendDirectUserNotification } from '../../config/firebaseAdmin.js';
import { formatGmt3String } from '../../utils/time.js';
import { ApiLog } from '../logs/apiLog.model.js';
import {
  dispatchProviderOrder,
  checkExternalOrderStatus,
  checkSwGamesOrdersBatch,
  mapProviderUserErrorMessage,
  extractOrderDeliveryDetails,
  extractOrderImages,
  formatDurationArabic,
  resolveOrderCompletionMeta,
  probeProviderOrderExistence,
  extractProviderOrderId,
} from './providerDispatch.service.js';

export const enrichOrderWithInvoiceMeta = (rawOrder) => {
  if (!rawOrder) return rawOrder;
  const o = typeof rawOrder.toJSON === 'function' ? rawOrder.toJSON() : { ...rawOrder };
  if (o._id && !o.id) {
    o.id = o._id;
  }

  const isCompleted = o.status === 'completed';
  let completedAt = o.completedAt || null;
  let executionDurationSeconds = o.executionDurationSeconds ?? null;
  let executionDurationText = o.executionDurationText || '';

  if (isCompleted) {
    if (!executionDurationSeconds || !executionDurationText || !completedAt) {
      const meta = resolveOrderCompletionMeta(o, o.providerResponse);
      completedAt = completedAt || meta.completedAt;
      executionDurationSeconds = executionDurationSeconds ?? meta.executionDurationSeconds;
      executionDurationText = executionDurationText || meta.executionDurationText;
    }
  }

  const deliveryDetails = extractOrderDeliveryDetails(o) || '';
  const responseImages = extractOrderImages(o);
  const qty = Math.max(1, Number(o.quantity) || 1);
  const totalUserPrice = Number(o.userPrice ?? o.price ?? 0);
  const unitPrice = Number((totalUserPrice / qty).toFixed(4));

  return {
    ...o,
    completedAt,
    createdAtGmt3: formatGmt3String(o.createdAt),
    completedAtGmt3: formatGmt3String(completedAt),
    executionDurationSeconds,
    executionDurationText,
    deliveryDetails,
    responseImages,
    unitPrice,
  };
};

const generateShortOrderId = async () => {
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
};

// High-precision in-memory order cooldown locks (prevents double-clicks & rapid consecutive purchases within 60s)
const activeOrderLocks = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [k, exp] of activeOrderLocks.entries()) {
    if (now >= exp) activeOrderLocks.delete(k);
  }
}, 15000);

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
  userPrice,
  price,
  amount,
  currency = '$',
}) => {
  // 0. Concurrency & Fast In-Memory 60s Cooldown Guard (Stops race condition double-taps immediately)
  const nowMs = Date.now();
  const userLockKey = `user_${userId}`;
  const targetLockKey = targetId && String(targetId).trim().length > 0 ? `target_${String(targetId).trim()}` : null;

  const userExp = activeOrderLocks.get(userLockKey);
  if (userExp && userExp > nowMs) {
    const remainingSec = Math.max(1, Math.ceil((userExp - nowMs) / 1000));
    throw new ApiError(
      `يرجى الانتظار (${remainingSec} ثانية) قبل إرسال طلب جديد لتفادي التكرار وحماية محفظتك ⏳.`,
      HTTP_STATUS.TOO_MANY_REQUESTS || 429
    );
  }

  if (targetLockKey) {
    const targetExp = activeOrderLocks.get(targetLockKey);
    if (targetExp && targetExp > nowMs) {
      const remainingSec = Math.max(1, Math.ceil((targetExp - nowMs) / 1000));
      throw new ApiError(
        `لا يمكن تكرار الشحن لنفس المعرف/الآيدي (${targetId}) خلال نفس الدقيقة لتجنب رفض المزود. يرجى الانتظار (${remainingSec} ثانية) ⏳.`,
        HTTP_STATUS.TOO_MANY_REQUESTS || 429
      );
    }
  }

  // Lock both immediately for 60 seconds
  const lockExpiry = nowMs + 60 * 1000;
  activeOrderLocks.set(userLockKey, lockExpiry);
  if (targetLockKey) activeOrderLocks.set(targetLockKey, lockExpiry);

  const startTime = Date.now();

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

  // 1.05 Anti-duplicate order check within 60 seconds (cooldown across DB)
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const targetProductId = product?._id || activeItem?._id || (mongoose.isValidObjectId(productId) ? productId : null);
  const normalizedTargetId = targetId ? String(targetId).trim() : '';

  const duplicateOr = [
    { userId: user._id, createdAt: { $gte: oneMinuteAgo } },
  ];
  if (normalizedTargetId.length > 0) {
    duplicateOr.push({ targetId: normalizedTargetId, createdAt: { $gte: oneMinuteAgo } });
  }

  const recentOrder = await Order.findOne({ $or: duplicateOr }).sort({ createdAt: -1 }).lean();
  if (recentOrder) {
    const elapsedSeconds = Math.floor((Date.now() - new Date(recentOrder.createdAt).getTime()) / 1000);
    const remainingSeconds = Math.max(1, 60 - elapsedSeconds);
    throw new ApiError(
      `هناك طلب تم إرساله بالفعل مؤخراً (${recentOrder.productName || 'طلب شحن'}). يرجى الانتظار (${remainingSeconds} ثانية) قبل إرسال طلب جديد لتفادي التكرار وحماية محفظتك ⏳.`,
      HTTP_STATUS.TOO_MANY_REQUESTS || 429
    );
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

  const isCustomProduct = source === 'custom' || product?.source === 'custom' || activeItem?.source === 'custom';
  if (isUserSyp && !isProductSyp && !isCustomProduct) {
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
  const isCustom = source === 'custom' || product?.source === 'custom' || activeItem?.source === 'custom';
  const settings = await getSettings();
  const globalProfitPercentage = settings.profitPercentage || 0;
  let nominalProfitPercentage = globalProfitPercentage;

  if (isCustom) {
    const cost = Number(activeItem?.originalPrice ?? product?.originalPrice ?? 0);
    const selling = Number(activeItem?.sellingPrice ?? activeItem?.price ?? product?.sellingPrice ?? product?.price ?? cost);
    if (cost > 0 && selling > cost) {
      nominalProfitPercentage = Number((((selling - cost) / cost) * 100).toFixed(2));
    } else {
      const subId = (activeItem?.subCategoryId || product?.subCategoryId)?.toString() || null;
      if (subId) {
        const subCat = await SubCategory.findById(subId).select('profitPercentage').lean();
        if (subCat && subCat.profitPercentage !== null && subCat.profitPercentage !== undefined && !isNaN(subCat.profitPercentage)) {
          nominalProfitPercentage = Number(subCat.profitPercentage);
        }
      }
      if (nominalProfitPercentage === globalProfitPercentage && (activeItem?.mainCategory || product?.mainCategory)) {
        const cat = await Category.findOne({ key: activeItem?.mainCategory || product?.mainCategory }).select('profitPercentage').lean();
        if (cat && cat.profitPercentage !== null && cat.profitPercentage !== undefined && !isNaN(cat.profitPercentage)) {
          nominalProfitPercentage = Number(cat.profitPercentage);
        }
      }
    }
  } else if (product) {
    if (product.subCategoryId) {
      const subCat = await SubCategory.findById(product.subCategoryId).select('profitPercentage').lean();
      if (subCat && subCat.profitPercentage !== null && subCat.profitPercentage !== undefined && !isNaN(subCat.profitPercentage)) {
        nominalProfitPercentage = Number(subCat.profitPercentage);
      }
    }
    if (nominalProfitPercentage === globalProfitPercentage && product.mainCategory) {
      const cat = await Category.findOne({ key: product.mainCategory }).select('profitPercentage').lean();
      if (cat && cat.profitPercentage !== null && cat.profitPercentage !== undefined && !isNaN(cat.profitPercentage)) {
        nominalProfitPercentage = Number(cat.profitPercentage);
      }
    }
  }

  // User Custom Profit Scaling Factor:
  let profitPercentage = nominalProfitPercentage;
  const userCustomProfit = (user.customProfitPercentage !== null && user.customProfitPercentage !== undefined && !isNaN(user.customProfitPercentage))
    ? Number(user.customProfitPercentage)
    : null;

  if (userCustomProfit !== null) {
    if (globalProfitPercentage > 0) {
      const userRatio = userCustomProfit / globalProfitPercentage;
      profitPercentage = Number((nominalProfitPercentage * userRatio).toFixed(2));
    } else {
      profitPercentage = userCustomProfit;
    }
    // Safety floor: profit margin must never drop below 0.4%
    if (profitPercentage < 0.4) {
      profitPercentage = 0.4;
    }
  }

  const discountPercent = activeItem?.discountPercent || product?.discountPercent || 0;
  const incomingClientPrice = Number(clientBasePrice || userPrice || price || amount || 0);

  const regularSellingPrice = Number(activeItem?.sellingPrice ?? activeItem?.price ?? product?.sellingPrice ?? product?.price ?? 0);
  let baseCost = isCustom
    ? Number(activeItem?.originalPrice ?? product?.originalPrice ?? 0)
    : (activeItem?.originalPrice && activeItem.originalPrice > 0
      ? activeItem.originalPrice
      : activeItem?.sellingPrice && activeItem.sellingPrice > 0
        ? activeItem.sellingPrice
        : activeItem?.price && activeItem.price > 0
          ? activeItem.price
          : (incomingClientPrice > 0 ? incomingClientPrice : 0));

  if (isCustom && baseCost <= 0) {
    if (profitPercentage > 0 && regularSellingPrice > 0) {
      baseCost = Number((regularSellingPrice / (1 + profitPercentage / 100)).toFixed(4));
    } else {
      baseCost = regularSellingPrice;
    }
  }

  const hasCustomUserProfit = (userCustomProfit !== null && userCustomProfit !== undefined && !isNaN(userCustomProfit));
  let priceBeforeDiscount;
  if (isCustom) {
    if (hasCustomUserProfit && baseCost > 0) {
      const customCalculated = profitPercentage > 0
        ? (baseCost >= 1 ? Number((baseCost * (1 + profitPercentage / 100)).toFixed(4)) : Number((baseCost * (1 + profitPercentage / 100)).toFixed(8)))
        : baseCost;
      priceBeforeDiscount = Math.min(regularSellingPrice, customCalculated);
    } else {
      priceBeforeDiscount = regularSellingPrice;
    }
  } else {
    priceBeforeDiscount = profitPercentage > 0
      ? (baseCost >= 1 ? Number((baseCost * (1 + profitPercentage / 100)).toFixed(4)) : Number((baseCost * (1 + profitPercentage / 100)).toFixed(8)))
      : baseCost;
  }

  // If user is SYP and custom product was created in USD, convert to SYP using exchange rate:
  const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;
  let exchangeAdjustedCost = baseCost;
  if (isUserSyp && isCustom && !isProductSyp) {
    baseCost = Math.round(baseCost * exchangeRate);
    exchangeAdjustedCost = Math.round(baseCost * exchangeRate);
    priceBeforeDiscount = Math.round(priceBeforeDiscount * exchangeRate);
  }

  const minProfitFloor = hasCustomUserProfit ? 0.4 : 0;
  let calculatedSellingPrice = priceBeforeDiscount;
  if (discountPercent > 0 && exchangeAdjustedCost > 0) {
    const netProfit = Math.max(minProfitFloor, profitPercentage - discountPercent);
    const discounted = (exchangeAdjustedCost >= 1
      ? Number((exchangeAdjustedCost * (1 + netProfit / 100)).toFixed(4))
      : Number((exchangeAdjustedCost * (1 + netProfit / 100)).toFixed(8)));
    calculatedSellingPrice = Math.min(priceBeforeDiscount, discounted);
  }

  // STOP-LOSS FLOOR PRICE: minimum profit guaranteed to admin in all circumstances
  const floorPrice = minProfitFloor > 0
    ? (exchangeAdjustedCost >= 1 ? Number((exchangeAdjustedCost * (1 + minProfitFloor / 100)).toFixed(4)) : Number((exchangeAdjustedCost * (1 + minProfitFloor / 100)).toFixed(8)))
    : exchangeAdjustedCost;

  const finalSellingPrice = Math.max(calculatedSellingPrice, floorPrice);

  // Unit selling price charged to user:
  const resolvedUnitSellingPrice = finalSellingPrice > 0
    ? finalSellingPrice
    : (incomingClientPrice > 0 ? incomingClientPrice : exchangeAdjustedCost);

  // Unit cost from provider
  let unitCost = exchangeAdjustedCost;
  if (!isCustom && unitCost <= 0 && resolvedUnitSellingPrice > 0) {
    unitCost =
      profitPercentage > 0
        ? (resolvedUnitSellingPrice >= 1 ? Number((resolvedUnitSellingPrice / (1 + profitPercentage / 100)).toFixed(4)) : Number((resolvedUnitSellingPrice / (1 + profitPercentage / 100)).toFixed(8)))
        : resolvedUnitSellingPrice;
  }

  const validQuantity = Math.max(1, Number(quantity) || 1);

  // Validate quantity against product/package minCount & maxCount
  const rawPayload = activeItem?.rawPayload || {};
  const rawMin =
    rawPayload.min_count ??
    rawPayload.minCount ??
    rawPayload.min_qty ??
    rawPayload.min ??
    (rawPayload.qty_values && typeof rawPayload.qty_values === 'object' && !Array.isArray(rawPayload.qty_values) ? rawPayload.qty_values.min : null);
  const rawMax =
    rawPayload.max_count ??
    rawPayload.maxCount ??
    rawPayload.max_qty ??
    rawPayload.max ??
    (rawPayload.qty_values && typeof rawPayload.qty_values === 'object' && !Array.isArray(rawPayload.qty_values) ? rawPayload.qty_values.max : null);

  const effectiveMin = rawMin && Number(rawMin) > 0
    ? parseInt(rawMin, 10)
    : (activeItem?.minCount && Number(activeItem.minCount) > 0 ? Number(activeItem.minCount) : 1);

  const effectiveMax = rawMax && Number(rawMax) > 0
    ? parseInt(rawMax, 10)
    : (activeItem?.maxCount && Number(activeItem.maxCount) > 0 ? Number(activeItem.maxCount) : null);

  const rawQtyValues = activeItem?.qtyValues || rawPayload.qty_values || rawPayload.qtyValues || null;
  if (Array.isArray(rawQtyValues) && rawQtyValues.length > 0) {
    const validValues = rawQtyValues.map(Number).filter((v) => !isNaN(v));
    if (validValues.length > 0 && !validValues.includes(validQuantity)) {
      throw new ApiError(
        `الكمية غير صحيحة. القيم المتاحة هي: ${validValues.join(', ')}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
  } else {
    if (validQuantity < effectiveMin) {
      throw new ApiError(
        `الكمية غير صحيحة. أقل كمية مسموح بها لهذا المنتج هي ${effectiveMin}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
    if (effectiveMax && validQuantity > effectiveMax) {
      throw new ApiError(
        `الكمية غير صحيحة. أقصى كمية مسموح بها لهذا المنتج هي ${effectiveMax}`,
        HTTP_STATUS.BAD_REQUEST
      );
    }
  }
  let totalUserPrice = Number((resolvedUnitSellingPrice * validQuantity).toFixed(4));
  let totalCost = Number((unitCost * validQuantity).toFixed(4));

  // Exchange / Drain product (منتج تصريف)
  const isExchangeProduct = Boolean(activeItem?.isExchange ?? product?.isExchange);
  const unitsPerDollar = Number(activeItem?.unitsPerDollar ?? product?.unitsPerDollar) || 1;
  const exchangeUnitName = (activeItem?.exchangeUnitName || product?.exchangeUnitName || 'وحدة').trim();

  if (isExchangeProduct && unitsPerDollar > 0) {
    const usdAmount = validQuantity / unitsPerDollar;
    if (isUserSyp) {
      totalUserPrice = Math.round(usdAmount * exchangeRate);
      totalCost = Math.round(usdAmount * exchangeRate);
    } else {
      totalUserPrice = Number(usdAmount.toFixed(4));
      totalCost = Number(usdAmount.toFixed(4));
    }
    finalProductName = `${finalProductName} (${validQuantity} ${exchangeUnitName})`;
  }
  const profit = Number(Math.max(0, totalUserPrice - totalCost).toFixed(4));
  const actualProfitPercentage = totalCost > 0
    ? Number((((totalUserPrice - totalCost) / totalCost) * 100).toFixed(2))
    : profitPercentage;

  // 3. Verify user balance
  const currentBalance = user.balance || 0;
  if (currentBalance < totalUserPrice) {
    throw new ApiError(
      `الرصيد غير كافٍ. رصيدك الحالي هو ${currentBalance.toFixed(2)} ${effectiveCurrency} والمطلوب ${totalUserPrice.toFixed(2)} ${effectiveCurrency}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  // 4. Atomically deduct user balance and update metrics (Prevents race conditions)
  const deductedUser = await User.findOneAndUpdate(
    { _id: user._id, balance: { $gte: totalUserPrice } },
    {
      $inc: {
        balance: -totalUserPrice,
        totalSpent: totalUserPrice,
        totalProfit: profit,
      },
    },
    { new: true }
  );

  if (!deductedUser) {
    const freshUser = await User.findById(user._id).select('balance');
    const actualBal = freshUser?.balance || 0;
    throw new ApiError(
      `الرصيد غير كافٍ. رصيدك الحالي هو ${actualBal.toFixed(2)} ${effectiveCurrency} والمطلوب ${totalUserPrice.toFixed(2)} ${effectiveCurrency}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const previousBalance = Number((deductedUser.balance + totalUserPrice).toFixed(4));
  const newBalance = deductedUser.balance;

  // 5. Generate clean 6 to 7 digit unique order ID
  const orderId = await generateShortOrderId();

  // Create initial Transaction record so every balance debit has a visible ledger entry
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
        errorMessage: mapProviderUserErrorMessage(dispErr.message),
      };
    }
  }

  // 7. Handle Provider Failure with Immediate Atomic Refund & Full Ledger Entry
  if (!dispatchResult.success) {
    // Atomically restore user balance deduction immediately (Atomic Refund)
    const refundedUser = await User.findByIdAndUpdate(
      user._id,
      {
        $inc: {
          balance: totalUserPrice,
          totalSpent: -totalUserPrice,
          totalProfit: -profit,
        },
      },
      { new: true }
    );

    const refundPrevBalance = Number((refundedUser.balance - totalUserPrice).toFixed(4));
    const refundNewBalance = refundedUser.balance;

    // Create a corresponding refund transaction so ledger is 100% balanced
    await Transaction.create({
      userId: user._id,
      type: 'refund',
      currency: user.currency || 'USD',
      amount: totalUserPrice,
      costPrice: totalCost,
      profit: 0,
      productName: finalProductName,
      targetId: targetId || '',
      orderId,
      previousBalance: refundPrevBalance,
      newBalance: refundNewBalance,
      note: `استرجاع فوري: فشل تنفيذ الطلب #${orderId} من المزود (${dispatchResult.failureReason || 'رفض المزود'})`,
    });

    // Create Order Record with 'failed' status and rich diagnostic evidence for transparency
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
      profitPercentage: actualProfitPercentage,
      discountPercent,
      currency: effectiveCurrency,
      status: 'failed',
      refunded: true,
      providerOrderId: dispatchResult.providerOrderId || '',
      providerPayload: dispatchResult.providerPayload || basePayload,
      providerResponse: dispatchResult.providerResponse || null,
      failureReason: dispatchResult.failureReason || dispatchResult.errorMessage || '',
      errorPhase: dispatchResult.errorPhase || '',
      errorDetails: dispatchResult.errorDetails || null,
      providerVerification: dispatchResult.providerVerification || '',
      httpStatusCode: dispatchResult.statusCode || null,
    });

    const userFacingError =
      dispatchResult.userMessage ||
      dispatchResult.errorMessage ||
      'حدث خطأ حاول لاحقا';
    throw new ApiError(userFacingError, HTTP_STATUS.BAD_REQUEST);
  }

  // 8. Create Order Record with full execution details (Successful / Processing Order)
  let order;
  const initialStatus = dispatchResult.status || 'processing';
  const isImmediatelyCompleted = initialStatus === 'completed';
  const purchaseSec = isImmediatelyCompleted
    ? Math.max(1, Math.round((Date.now() - (typeof startTime !== 'undefined' ? startTime : Date.now())) / 1000))
    : null;
  const purchaseText = purchaseSec ? formatDurationArabic(purchaseSec) : '';

  try {
    order = await Order.create({
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
      profitPercentage: actualProfitPercentage,
      discountPercent,
      currency: effectiveCurrency,
      status: initialStatus,
      completedAt: isImmediatelyCompleted ? new Date() : null,
      executionDurationSeconds: purchaseSec,
      executionDurationText: purchaseText,
      providerOrderId: dispatchResult.providerOrderId || '',
      providerPayload: dispatchResult.providerPayload || basePayload,
      providerResponse: dispatchResult.providerResponse || null,
    });
  } catch (orderCreateErr) {
    console.error('[CRITICAL ORDER CREATE ERROR]: Failed to persist full order after dispatch:', orderCreateErr);
    // Emergency rescue: create order with minimal valid schema to ensure order is NEVER lost
    try {
      order = await Order.create({
        orderId,
        userId: user._id,
        productName: finalProductName || 'طلب شراء ألعاب',
        category: finalCategory || 'ألعاب',
        targetId: targetId || '',
        quantity: validQuantity || 1,
        source: source || 'custom',
        costPrice: totalCost || 0,
        userPrice: totalUserPrice || 0,
        profit: profit || 0,
        currency: effectiveCurrency || '$',
        status: initialStatus,
        completedAt: isImmediatelyCompleted ? new Date() : null,
        providerOrderId: dispatchResult.providerOrderId || '',
        providerPayload: dispatchResult.providerPayload || basePayload,
        providerResponse: dispatchResult.providerResponse || null,
      });
    } catch (rescueErr) {
      console.error('[FATAL ORDER RESCUE ERROR]:', rescueErr);
    }
  }

  // Notify Admin if order is from custom provider or pending manual processing
  const shouldNotifyAdmin =
    isCustomProvider ||
    initialStatus === 'pending' ||
    dispatchResult?.status === 'pending' ||
    dispatchResult?.providerPayload?.isManual === true ||
    !['roya_usd', 'roya_syp', 'brand1card', 'sw_games'].includes(source);

  if (shouldNotifyAdmin) {
    sendAdminNotification({
      title: 'طلب جديد',
      body: `طلب ${finalProductName} #${orderId} - القيمة: ${totalUserPrice} ${effectiveCurrency}`,
      data: {
        orderId: String(orderId),
        type: 'custom_order',
        productName: String(finalProductName),
        userPrice: String(totalUserPrice),
        currency: String(effectiveCurrency),
      },
    }).catch((err) => console.error('[Order Notification Error]:', err));
  }

  // 9. Award Cashback Coins upon successful purchase
  let coinsAwarded = 0;
  try {
    const isCashbackActive = settings.isCashbackActive !== false;
    const cashbackPercentage = Number(settings.cashbackPercentage) || 0;
    const coinsPerDollar = Number(settings.coinsPerDollar) || 100;
    const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

    if (isCashbackActive && cashbackPercentage > 0) {
      let spentInUsd = totalUserPrice;
      if (effectiveCurrency === 'ل.س' || effectiveCurrency === 'SYP' || user.currency === 'SYP') {
        spentInUsd = totalUserPrice / exchangeRate;
      }
      const rawCoins = spentInUsd * (cashbackPercentage / 100);
      coinsAwarded = Number((Math.round(rawCoins * 10) / 10).toFixed(1));


      if (coinsAwarded > 0) {
        user.coins = Number(((user.coins || 0) + coinsAwarded).toFixed(1));
        await user.save();

        order.coinsEarned = coinsAwarded;
        await order.save();
      }
    }
  } catch (coinErr) {
    console.error('[Cashback Award Error]:', coinErr);
  }

  clearAdminOrdersCache();
  return {
    order: enrichOrderWithInvoiceMeta(order),
    transaction: transaction.toJSON(),
    user: {
      id: user._id,
      balance: user.balance,
      coins: user.coins || 0,
      totalSpent: user.totalSpent,
      totalProfit: user.totalProfit,
    },
    coinsAwarded,
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

  const targetUserId = order.userId?._id || order.userId;
  const user = await User.findById(targetUserId);
  if (!user) {
    console.error(`User ${targetUserId} not found for refunding order ${order.orderId}`);
    return false;
  }

  // Full refund: userPrice = costPrice + profit (everything deducted from user wallet)
  const refundAmount = Number((order.userPrice || 0).toFixed(4));
  const prevBal = Number((user.balance || 0).toFixed(4));
  const newBal = Number((prevBal + refundAmount).toFixed(4));

  user.balance = newBal;
  user.totalSpent = Number(Math.max(0, (user.totalSpent || 0) - refundAmount).toFixed(4));
  user.totalProfit = Number(Math.max(0, (user.totalProfit || 0) - (order.profit || 0)).toFixed(4));
  const coinsDeducted = Number(order.coinsEarned || 0);
  if (coinsDeducted > 0) {
    user.coins = Number(Math.max(0, (user.coins || 0) - coinsDeducted).toFixed(1));
  }
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
          (customNote ? (coinsDeducted > 0 ? `${customNote} (تم إلغاء ${coinsDeducted} كوينز كاش باك)` : customNote) : null) ||
          `استرجاع رصيد تلقائي لإلغاء/فشل الطلب (#${resultData?.providerOrderNumber || order.providerOrderId || order.orderId}): ${order.productName || ''} (تم استرجاع ${refundAmount} ${normalizedCurrency} متضمنة نسبة الربح كاملة${coinsDeducted > 0 ? ` وإلغاء ${coinsDeducted} كوينز كاش باك` : ''})`,
      });
    }
  } catch (txErr) {
    console.error('[refundOrderWallet] Transaction logging failed (non-fatal):', txErr.message);
  }
  // Notify User about refund
  const pushCoinsText = coinsDeducted > 0 ? ` وإلغاء ${coinsDeducted} كوينز كاش باك من حسابك.` : '.';
  sendDirectUserNotification(targetUserId, {
    title: 'تحديث بشأن طلبك: تم استرجاع المبلغ ↩️',
    body: `تم إلغاء/فشل طلب (${order.productName || 'طلب شحن'}) واسترجاع المبلغ (${refundAmount} ${normalizedCurrency}) إلى محفظتك${pushCoinsText}`,
    data: {
      type: 'order_refunded',
      orderId: String(order.orderId || order._id),
    },
  }).catch((err) => console.error('[Refund Push Error]:', err.message));

  clearAdminOrdersCache();
  return true;
};

/**
 * Batch syncs orders status with external providers (SW Games & Brand One Card)
 * Automatically triggers wallet refund for any order cancelled or failed by the provider.
 */
let isSyncBatchActive = false;
export const syncOrdersBatch = async (ordersList) => {
  if (!ordersList || ordersList.length === 0) return 0;
  if (isSyncBatchActive) return 0;
  isSyncBatchActive = true;

  try {
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
              order.refunded = false;
              if (res.rawData) order.providerResponse = res.rawData;
              if (res.providerOrderNumber) order.providerOrderId = res.providerOrderNumber;
              const meta = resolveOrderCompletionMeta(order, res.rawData);
              order.completedAt = meta.completedAt;
              order.executionDurationSeconds = meta.executionDurationSeconds;
              order.executionDurationText = meta.executionDurationText;
              await ensureOrderHasPurchaseTransaction(order, { deductBalanceIfRefunded: true });
              await order.save();
              sendDirectUserNotification(order.userId, {
                title: 'تم تنفيذ طلبك بنجاح! 🎮',
                body: `تم إكمال طلب شحن (${order.productName}) بنجاح. شكراً لتعاملك معنا!`,
                data: {
                  type: 'order_completed',
                  orderId: String(order.orderId || order._id),
                },
              }).catch((err) => console.error('[Batch Sync Complete Push Error]:', err.message));
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
              order.refunded = false;
              if (res.rawData) order.providerResponse = res.rawData;
              if (res.providerOrderNumber) order.providerOrderId = res.providerOrderNumber;
              const meta = resolveOrderCompletionMeta(order, res.rawData);
              order.completedAt = meta.completedAt;
              order.executionDurationSeconds = meta.executionDurationSeconds;
              order.executionDurationText = meta.executionDurationText;
              await ensureOrderHasPurchaseTransaction(order, { deductBalanceIfRefunded: true });
              await order.save();
              sendDirectUserNotification(order.userId, {
                title: 'تم تنفيذ طلبك بنجاح! 🎮',
                body: `تم إكمال طلب شحن (${order.productName}) بنجاح. شكراً لتعاملك معنا!`,
                data: {
                  type: 'order_completed',
                  orderId: String(order.orderId || order._id),
                },
              }).catch((err) => console.error('[Batch Sync Complete Push Error]:', err.message));
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
            order.refunded = false;
            if (checkResult.rawData) order.providerResponse = checkResult.rawData;
            const meta = resolveOrderCompletionMeta(order, checkResult.rawData);
            order.completedAt = meta.completedAt;
            order.executionDurationSeconds = meta.executionDurationSeconds;
            order.executionDurationText = meta.executionDurationText;
            await ensureOrderHasPurchaseTransaction(order, { deductBalanceIfRefunded: true });
            await order.save();
            sendDirectUserNotification(order.userId, {
              title: 'تم تنفيذ طلبك بنجاح! 🎮',
              body: `تم إكمال طلب شحن (${order.productName}) بنجاح. شكراً لتعاملك معنا!`,
              data: {
                type: 'order_completed',
                orderId: String(order.orderId || order._id),
              },
            }).catch((err) => console.error('[Batch Sync Complete Push Error]:', err.message));
            updatedCount++;
          }
        }
      } catch (e) {
        console.error(`Error checking order ${order.orderId}:`, e);
      }
    }

    return updatedCount;
  } finally {
    isSyncBatchActive = false;
  }
};

export const getUserOrders = async (userId) => {
  // Pure local DB lookup - ultra fast response in ~5-15ms without outbound network bottlenecks
  const orders = await Order.find({ userId }).sort({ createdAt: -1 }).lean();
  return orders.map(enrichOrderWithInvoiceMeta);
};

// Lightweight In-Memory Aggregate & Count Cache for Admin Orders
const adminAggCache = new Map();
const ADMIN_AGG_CACHE_TTL = 60 * 1000; // 60 seconds

export const clearAdminOrdersCache = () => {
  adminAggCache.clear();
};

export const getAllOrdersAdmin = async (query = {}) => {
  const filter = {};

  // 1. Filter by specific user ID
  if (query.userId && mongoose.isValidObjectId(query.userId)) {
    filter.userId = query.userId;
  }

  // 2. Filter by status
  if (query.status && query.status !== 'all') {
    if (query.status === 'pending') {
      filter.status = { $in: ['pending', 'processing'] };
    } else if (query.status === 'failed' || query.status === 'rejected') {
      filter.status = { $in: ['failed', 'cancelled'] };
    } else {
      filter.status = query.status;
    }
  }

  // 3. Filter by source (e.g. 'custom', 'sw_games', 'roya_usd', 'roya_syp', 'brand1card', etc.)
  if (query.source && query.source !== 'all') {
    if (query.source === 'custom') {
      filter.$or = [
        { source: 'custom' },
        { 'providerPayload.isManual': true },
        { 'providerPayload.provider': 'مزودي الخاص' },
        { source: { $in: ['', null] } },
      ];
    } else {
      filter.source = query.source;
    }
  }

  // 4. Filter by Date (today, yesterday, this_week, this_month, YYYY-MM-DD, or startDate & endDate)
  if (query.date && query.date !== 'all') {
    if (query.date === 'today') {
      const nowGmt3 = new Date(Date.now() + 3 * 3600 * 1000);
      const y = nowGmt3.getUTCFullYear();
      const m = nowGmt3.getUTCMonth();
      const d = nowGmt3.getUTCDate();
      const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - 3 * 3600 * 1000);
      const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - 3 * 3600 * 1000);
      filter.createdAt = { $gte: start, $lte: end };
    } else if (query.date === 'yesterday') {
      const yesterdayGmt3 = new Date(Date.now() - 24 * 3600 * 1000 + 3 * 3600 * 1000);
      const y = yesterdayGmt3.getUTCFullYear();
      const m = yesterdayGmt3.getUTCMonth();
      const d = yesterdayGmt3.getUTCDate();
      const start = new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - 3 * 3600 * 1000);
      const end = new Date(Date.UTC(y, m, d, 23, 59, 59, 999) - 3 * 3600 * 1000);
      filter.createdAt = { $gte: start, $lte: end };
    } else if (query.date === 'this_week' || query.date === 'last7days') {
      const start = new Date(Date.now() - 6 * 24 * 3600 * 1000);
      const end = new Date();
      filter.createdAt = { $gte: start, $lte: end };
    } else if (query.date === 'this_month') {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const end = new Date();
      filter.createdAt = { $gte: start, $lte: end };
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(query.date)) {
      const [y, m, d] = query.date.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 3 * 3600 * 1000);
      const end = new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 3 * 3600 * 1000);
      filter.createdAt = { $gte: start, $lte: end };
    }
  } else if (query.startDate && query.endDate) {
    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
      filter.createdAt = { $gte: start, $lte: end };
    }
  }

  // 5. Search by orderId, productName, targetId, providerOrderId, user (name, phone, email, userCode)
  if (query.search && query.search.trim()) {
    const s = query.search.trim();
    const matchedUsers = await User.find({
      $or: [
        { name: { $regex: s, $options: 'i' } },
        { email: { $regex: s, $options: 'i' } },
        { phone: { $regex: s, $options: 'i' } },
        { userCode: { $regex: s, $options: 'i' } },
      ],
    })
      .select('_id')
      .lean();

    const matchedUserIds = matchedUsers.map((u) => u._id);

    const searchConditions = [
      { orderId: { $regex: s, $options: 'i' } },
      { productName: { $regex: s, $options: 'i' } },
      { targetId: { $regex: s, $options: 'i' } },
      { providerOrderId: { $regex: s, $options: 'i' } },
    ];

    if (matchedUserIds.length > 0) {
      searchConditions.push({ userId: { $in: matchedUserIds } });
    }

    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  // 6. Pagination
  const page = parseInt(query.page, 10) || 1;
  const limit = query.limit === 'all' ? 1000 : (parseInt(query.limit, 10) || 50);
  const skip = (page - 1) * limit;

  // 7. Base filter for status counts (without status constraint)
  const baseFilterWithoutStatus = { ...filter };
  delete baseFilterWithoutStatus.status;

  const cacheKey = JSON.stringify({
    userId: query.userId || '',
    status: query.status || 'all',
    source: query.source || 'all',
    date: query.date || 'today',
    startDate: query.startDate || '',
    endDate: query.endDate || '',
    search: query.search ? query.search.trim().toLowerCase() : '',
  });

  const now = Date.now();
  const cachedMeta = adminAggCache.get(cacheKey);
  const isCacheValid = cachedMeta && (now - cachedMeta.timestamp < ADMIN_AGG_CACHE_TTL);

  // Direct, lean query using indexed sort - returns in ~10-30ms
  const orders = await Order.find(filter)
    .populate('userId', 'name email phone avatar balance currency userCode')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean();

  let total = orders.length;
  let counts = {
    all: 0,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };
  let stats = {
    usd: { revenue: 0, cost: 0, profit: 0, count: 0 },
    syp: { revenue: 0, cost: 0, profit: 0, count: 0 },
  };

  if (isCacheValid) {
    total = cachedMeta.total;
    counts = cachedMeta.counts;
    stats = cachedMeta.stats;
  } else if (page === 1 && orders.length < limit && !filter.status) {
    // Ultra fast in-memory aggregation in 0ms! No extra database queries needed
    total = orders.length;
    for (const o of orders) {
      if (counts[o.status] !== undefined) counts[o.status]++;
      counts.all++;
      const curr = String(o.currency || '').toUpperCase();
      const isSyp = curr === 'SYP' || curr === 'ل.س';
      const uPrice = Number(o.userPrice || o.price || 0);
      const cPrice = Number(o.costPrice || o.originalPrice || 0);
      const p = Number(o.profit || 0);
      if (isSyp) {
        stats.syp.revenue += Math.round(uPrice);
        stats.syp.cost += Math.round(cPrice);
        stats.syp.profit += Math.round(p);
        stats.syp.count++;
      } else {
        stats.usd.revenue += Number(uPrice.toFixed(2));
        stats.usd.cost += Number(cPrice.toFixed(2));
        stats.usd.profit += Number(p.toFixed(2));
        stats.usd.count++;
      }
    }

    if (adminAggCache.size > 200) {
      const oldestKey = adminAggCache.keys().next().value;
      adminAggCache.delete(oldestKey);
    }
    adminAggCache.set(cacheKey, { total, counts, stats, timestamp: now });
  } else {
    // Single consolidated facet query with maxTimeMS to guarantee zero server stalling
    try {
      const facetPipeline = [
        { $match: baseFilterWithoutStatus },
        {
          $facet: {
            statusAgg: [
              { $group: { _id: '$status', count: { $sum: 1 } } }
            ],
            financialAgg: [
              ...(filter.status ? [{ $match: { status: filter.status } }] : []),
              {
                $group: {
                  _id: '$currency',
                  totalRevenue: { $sum: '$userPrice' },
                  totalCost: { $sum: '$costPrice' },
                  totalProfit: { $sum: '$profit' },
                  count: { $sum: 1 },
                }
              }
            ],
            totalAgg: [
              ...(filter.status ? [{ $match: { status: filter.status } }] : []),
              { $count: 'count' }
            ]
          }
        }
      ];

      const facetResult = await Order.aggregate(facetPipeline)
        .option({ maxTimeMS: 3000 })
        .catch((err) => {
          console.warn('[Admin aggregate facet timeout/fallback]:', err.message);
          return null;
        });

      if (facetResult && facetResult[0]) {
        const { statusAgg, financialAgg, totalAgg } = facetResult[0];
        total = totalAgg?.[0]?.count ?? orders.length;

        if (Array.isArray(statusAgg)) {
          for (const item of statusAgg) {
            if (item._id && counts[item._id] !== undefined) {
              counts[item._id] = item.count;
            }
            counts.all += item.count || 0;
          }
        }

        if (Array.isArray(financialAgg)) {
          for (const f of financialAgg) {
            const curr = String(f._id || '').toUpperCase();
            const isSyp = curr === 'SYP' || curr === 'ل.س';
            if (isSyp) {
              stats.syp.revenue += Math.round(f.totalRevenue || 0);
              stats.syp.cost += Math.round(f.totalCost || 0);
              stats.syp.profit += Math.round(f.totalProfit || 0);
              stats.syp.count += f.count || 0;
            } else {
              stats.usd.revenue += Number((f.totalRevenue || 0).toFixed(2));
              stats.usd.cost += Number((f.totalCost || 0).toFixed(2));
              stats.usd.profit += Number((f.totalProfit || 0).toFixed(2));
              stats.usd.count += f.count || 0;
            }
          }
        }
      } else {
        total = orders.length;
      }
    } catch (_) {
      total = orders.length;
    }

    if (adminAggCache.size > 200) {
      const oldestKey = adminAggCache.keys().next().value;
      adminAggCache.delete(oldestKey);
    }
    adminAggCache.set(cacheKey, { total, counts, stats, timestamp: now });
  }

  const enrichedOrders = orders.map(enrichOrderWithInvoiceMeta);

  return {
    orders: enrichedOrders,
    total,
    pagination: {
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      total,
    },
    counts,
    stats,
  };








};

export const ensureOrderHasPurchaseTransaction = async (order, { deductBalanceIfRefunded = true } = {}) => {
  if (!order || !order.orderId) return null;

  const orderIdStr = String(order.orderId);
  const targetUserId = order.userId?._id || order.userId;
  if (!targetUserId) return null;

  try {
    // 1. Check if a purchase transaction already exists
    const existingPurchaseTx = await Transaction.findOne({
      $or: [{ orderId: orderIdStr }, { orderId: Number(orderIdStr) || 0 }],
      type: 'purchase',
    });

    if (existingPurchaseTx) {
      return existingPurchaseTx;
    }

    // 2. Check if a refund transaction exists
    const existingRefundTx = await Transaction.findOne({
      $or: [{ orderId: orderIdStr }, { orderId: Number(orderIdStr) || 0 }],
      type: 'refund',
    });

    const wasRefunded = order.refunded === true || Boolean(existingRefundTx);

    const user = await User.findById(targetUserId);
    if (!user) return null;

    const totalUserPrice = Number(order.userPrice) || 0;
    const totalCost = Number(order.costPrice) || 0;
    const profit = Number(order.profit) || 0;
    const currency = order.currency || user.currency || 'USD';

    let prevBal = user.balance;
    let newBal = user.balance;

    if (wasRefunded && deductBalanceIfRefunded && totalUserPrice > 0) {
      // Re-deduct user balance since order was confirmed completed by provider
      const updatedUser = await User.findByIdAndUpdate(
        targetUserId,
        {
          $inc: {
            balance: -totalUserPrice,
            totalSpent: totalUserPrice,
            totalProfit: profit,
          },
        },
        { new: true }
      );
      if (updatedUser) {
        newBal = updatedUser.balance;
        prevBal = Number((updatedUser.balance + totalUserPrice).toFixed(4));
      }
    } else {
      prevBal = Number((user.balance + totalUserPrice).toFixed(4));
      newBal = user.balance;
    }

    const tx = await Transaction.create({
      userId: targetUserId,
      type: 'purchase',
      currency,
      amount: totalUserPrice,
      costPrice: totalCost,
      profit,
      productName: order.productName || 'طلب شحن',
      targetId: order.targetId || '',
      orderId: orderIdStr,
      previousBalance: prevBal,
      newBalance: newBal,
      note: `شراء: ${order.productName || 'طلب شحن'} (${order.targetId || 'رقم الحساب'})`,
      createdAt: order.completedAt || order.createdAt || new Date(),
    });

    return tx;
  } catch (err) {
    console.error('[ensureOrderHasPurchaseTransaction Error]:', err.message);
    return null;
  }
};

export const checkSingleOrder = async (orderId, manualProviderOrderId = null) => {
  const order = await Order.findOne({
    $or: [{ orderId }, { _id: mongoose.isValidObjectId(orderId) ? orderId : null }],
  }).populate('userId', 'name email phone avatar balance currency userCode');

  if (!order) {
    throw new ApiError('الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (manualProviderOrderId && String(manualProviderOrderId).trim()) {
    order.providerOrderId = String(manualProviderOrderId).trim();
    await order.save();
  }

  if (order.status === 'failed') {
    // Admin checking provider verification for a failed order
    const orderUuid =
      order.providerOrderId ||
      order.providerPayload?.params?.order_uuid ||
      order.providerPayload?.params?.uuid ||
      order.orderId;
    try {
      const probe = await probeProviderOrderExistence({
        source: order.source,
        orderUuid,
        isSyp: order.source === 'roya_syp' || order.currency === 'SYP',
      });
      order.providerVerification = probe.message;
      if (probe.found && probe.orderObj) {
        order.providerResponse = probe.orderObj;
        const rawStatus = String(probe.orderObj.status || '').toLowerCase();
        const isSuccessStatus = ['accept', 'completed', 'done', 'success'].includes(rawStatus);

        if (isSuccessStatus) {
          order.status = 'completed';
          order.refunded = false;
          order.failureReason = '';
          order.completedAt = order.completedAt || new Date();
          order.executionDurationSeconds = order.executionDurationSeconds || 5;
          order.executionDurationText = order.executionDurationText || 'تنفيذ مباشر عبر المزود';

          // Guarantee user balance debit and purchase transaction in ledger
          await ensureOrderHasPurchaseTransaction(order, { deductBalanceIfRefunded: true });

          const targetUserId = order.userId?._id || order.userId;
          if (targetUserId) {
            sendDirectUserNotification(targetUserId, {
              title: 'تم تنفيذ طلبك بنجاح! 🎮',
              body: `تم تأكيد إكمال طلب شحن (${order.productName || 'طلب شحن'}) بنجاح من سيرفر المزود. شكراً لتعاملك معنا!`,
              data: {
                type: 'order_completed',
                orderId: String(order.orderId || order._id),
              },
            }).catch((err) => console.error('[Probe Completion Push Error]:', err.message));
          }
        }

        await order.save();
        clearAdminOrdersCache();
        return {
          order: enrichOrderWithInvoiceMeta(order),
          updated: true,
          status: order.status,
          message: `تم تأكيد وجود الطلب لدى المزود بنجاح! (${probe.message})`,
        };
      }
      await order.save();
      return {
        order: enrichOrderWithInvoiceMeta(order),
        updated: false,
        status: order.status,
        message: probe.message || 'تم فحص سيرفر المزود: الطلب غير موجود لدى المزود إطلاقاً',
      };
    } catch (probeErr) {
      return {
        order: enrichOrderWithInvoiceMeta(order),
        updated: false,
        status: order.status,
        message: `تعذر فحص المزود: ${probeErr.message}`,
      };
    }
  }

  let updated = false;
  const isSw = ['roya_usd', 'roya_syp', 'sw_games'].includes(order.source);
  const isBrand = ['brand1card', 'auto1card'].includes(order.source);
  const isCustom = order.source === 'custom' || (!isSw && !isBrand);

  if (isSw) {
    try {
      const isSyp = order.source === 'roya_syp' || order.currency === 'SYP';
      const batchRes = await checkSwGamesOrdersBatch([order], isSyp);
      const res = batchRes.get(order._id.toString());
      if (res) {
        if (res.status === 'failed' && !order.refunded) {
          await refundOrderWallet(order, res);
          updated = true;
        } else if (res.status === 'completed') {
          if (res.rawData) order.providerResponse = res.rawData;
          if (res.providerOrderNumber) order.providerOrderId = res.providerOrderNumber;
          if (order.status !== 'completed' || !order.executionDurationSeconds) {
            order.status = 'completed';
            order.refunded = false;
            const meta = resolveOrderCompletionMeta(order, res.rawData);
            order.completedAt = meta.completedAt;
            order.executionDurationSeconds = meta.executionDurationSeconds;
            order.executionDurationText = meta.executionDurationText;
            updated = true;
          }
          await ensureOrderHasPurchaseTransaction(order, { deductBalanceIfRefunded: true });
          await order.save();
        }
      }
    } catch (swErr) {
      console.error('[checkSingleOrder SW Error]:', swErr.message);
    }
  } else if (isBrand) {
    try {
      const checkResult = await checkExternalOrderStatus(order);
      if (checkResult.changed || checkResult.status === 'completed') {
        if (checkResult.status === 'failed' && !order.refunded) {
          await refundOrderWallet(order, checkResult);
          updated = true;
        } else if (checkResult.status === 'completed') {
          if (checkResult.rawData) order.providerResponse = checkResult.rawData;
          if (order.status !== 'completed' || !order.executionDurationSeconds) {
            order.status = 'completed';
            order.refunded = false;
            const meta = resolveOrderCompletionMeta(order, checkResult.rawData);
            order.completedAt = meta.completedAt;
            order.executionDurationSeconds = meta.executionDurationSeconds;
            order.executionDurationText = meta.executionDurationText;
            updated = true;
          }
          await ensureOrderHasPurchaseTransaction(order, { deductBalanceIfRefunded: true });
          await order.save();
        }
      }
    } catch (brandErr) {
      console.error('[checkSingleOrder Brand Error]:', brandErr.message);
    }
  }

  // Push notification delivery if completed
  if (order.status === 'completed') {
    const targetUserId = order.userId?._id || order.userId;
    if (targetUserId) {
      sendDirectUserNotification(targetUserId, {
        title: 'تم تنفيذ طلبك بنجاح! 🎮',
        body: `تم إكمال طلب شحن (${order.productName || 'طلب شحن'}) بنجاح. شكراً لتعاملك معنا!`,
        data: {
          type: 'order_completed',
          orderId: String(order.orderId || order._id),
        },
      }).catch((notifErr) => {
        console.error('[checkSingleOrder Push Error]:', notifErr.message);
      });
    }
  }

  let message = 'تم فحص حالة الطلب من المزود بنجاح';
  if (order.status === 'completed') {
    message = 'الطلب مكتمل وتم إرسال إشعار للمستخدم 🚀';
  } else if (order.status === 'failed') {
    message = 'الطلب ملغي/فاشل وتم استرجاع الرصيد للمستخدم';
  } else if (order.status === 'processing') {
    message = 'الطلب ما زال قيد المعالجة لدى المزود';
  } else if (isCustom) {
    message = 'طلب مزود خاص (معالجة يدوية)';
  }

  clearAdminOrdersCache();
  return {
    order: enrichOrderWithInvoiceMeta(order),
    updated,
    status: order.status,
    message,
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

  const formattedOrders = orders.map((o) => ({
    ...o,
    id: o._id,
    user: o.userId,
    price: o.userPrice ?? o.priceCharged ?? o.price ?? 0,
    priceCharged: o.userPrice ?? o.priceCharged ?? o.price ?? 0,
    originalPrice: o.costPrice ?? o.originalPrice ?? 0,
    userPrice: o.userPrice ?? o.priceCharged ?? o.price ?? 0,
    costPrice: o.costPrice ?? o.originalPrice ?? 0,
  }));

  return {
    orders: formattedOrders,
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
  order.completedAt = order.completedAt || new Date();
  const diffSec = Math.max(
    1,
    Math.round((order.completedAt.getTime() - new Date(order.createdAt).getTime()) / 1000)
  );
  order.executionDurationSeconds = diffSec;
  order.executionDurationText = formatDurationArabic(diffSec);
  order.providerResponse = {
    ...(order.providerResponse || {}),
    adminNote: adminNote ? adminNote.trim() : '',
    responseData,
    completedAt: order.completedAt,
    actionBy: 'admin',
  };

  await order.save();
  // Notify User about custom order completion
  sendDirectUserNotification(order.userId, {
    title: 'تم تنفيذ طلبك بنجاح! 🎮',
    body: `تم إكمال طلب شحن (${order.productName}) بنجاح.${adminNote ? ' ملاحظة: ' + adminNote : ' شكراً لتعاملك معنا!'}`,
    data: {
      type: 'order_completed',
      orderId: String(order.orderId || order._id),
    },
  }).catch((err) => console.error('[Order Complete Push Error]:', err.message));

  return enrichOrderWithInvoiceMeta(order);
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
  // Notify User about custom order cancellation/rejection
  const customCoinsDeducted = Number(order.coinsEarned || 0);
  const customCoinsText = customCoinsDeducted > 0 ? ` وإلغاء ${customCoinsDeducted} كوينز كاش باك.` : '.';
  sendDirectUserNotification(order.userId, {
    title: isReject ? 'تحديث بشأن طلبك: تم رفض الطلب ⚠️' : 'تحديث بشأن طلبك: تم إلغاء الطلب ↩️',
    body: `تم ${isReject ? 'رفض' : 'إلغاء'} طلب (${order.productName}) وإرجاع المبلغ (${order.userPrice} ${order.currency}) لمحفظتك${customCoinsText}${reason ? ' السبب: ' + reason : ''}`,
    data: {
      type: 'order_refunded',
      orderId: String(order.orderId || order._id),
      reason: reason ? String(reason) : '',
    },
  }).catch((err) => console.error('[Order Refund Push Error]:', err.message));

  return order.toJSON ? order.toJSON() : order;
};

/**
 * Admin: Delete all custom provider orders ("طلبات مزودي الخاص")
 */
export const deleteAllCustomOrders = async () => {
  const customMatch = {
    $or: [
      { source: 'custom' },
      { 'providerPayload.isManual': true },
      { 'providerPayload.provider': 'مزودي الخاص' },
      { source: { $in: ['', null] } },
    ],
  };

  const result = await Order.deleteMany(customMatch);
  return {
    success: true,
    message: `تم حذف جميع طلبات مزودي الخاص بنجاح (${result.deletedCount || 0} طلب)`,
    deletedCount: result.deletedCount || 0,
  };
};

/**
 * Admin: Delete a single custom provider order
 */
export const deleteSingleCustomOrder = async (orderId) => {
  const customMatch = {
    $or: [
      { source: 'custom' },
      { 'providerPayload.isManual': true },
      { 'providerPayload.provider': 'مزودي الخاص' },
      { source: { $in: ['', null] } },
    ],
  };

  const order = await Order.findOne({
    $and: [
      {
        $or: [
          { orderId: String(orderId) },
          ...(mongoose.isValidObjectId(orderId) ? [{ _id: orderId }] : []),
        ],
      },
      customMatch,
    ],
  });

  if (!order) {
    throw new ApiError('الطلب غير موجود أو ليس من طلبات مزودي الخاص', HTTP_STATUS.NOT_FOUND);
  }

  await order.deleteOne();
  return {
    success: true,
    message: 'تم حذف طلب مزودي الخاص بنجاح',
    orderId,
  };
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
    order.completedAt = order.completedAt || new Date();
    order.providerResponse = data;
    await order.save();
    console.log(`[Roya Webhook] Order #${order.orderId} successfully completed.`);
    sendDirectUserNotification(order.userId, {
      title: 'تم تنفيذ طلبك بنجاح! 🎮',
      body: `تم إكمال طلب شحن (${order.productName}) بنجاح عبر المزود. شكراً لتعاملك معنا!`,
      data: {
        type: 'order_completed',
        orderId: String(order.orderId || order._id),
      },
    }).catch((err) => console.error('[Roya Webhook Complete Push Error]:', err.message));
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

/**
 * Advanced Admin Profit & Financial Reports
 * Computes net profit, revenue, costs, margins, timeline, category distribution,
 * and top profitable products with multi-currency conversion (USD & SYP).
 */
export const getProfitReportsAdmin = async (query = {}) => {
  const period = query.period || 'monthly'; // 'weekly', 'monthly', 'yearly', 'all'
  const settings = await getSettings();
  const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;

  const now = new Date();
  let startDate;
  let endDate = new Date(now);
  let prevStartDate;
  let prevEndDate;
  let groupByFormat; // for MongoDB timeline $dateToString

  if (query.startDate && query.endDate) {
    startDate = new Date(query.startDate);
    endDate = new Date(query.endDate);
    const diff = endDate.getTime() - startDate.getTime();
    prevEndDate = new Date(startDate.getTime() - 1);
    prevStartDate = new Date(prevEndDate.getTime() - diff);
    groupByFormat = diff > 60 * 24 * 3600 * 1000 ? '%Y-%m' : '%Y-%m-%d';
  } else if (period === 'weekly') {
    // Last 7 full days
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);

    prevEndDate = new Date(startDate.getTime() - 1);
    prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - 6);
    prevStartDate.setHours(0, 0, 0, 0);

    groupByFormat = '%Y-%m-%d';
  } else if (period === 'yearly') {
    // Current year from Jan 1
    startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
    prevEndDate = new Date(startDate.getTime() - 1);
    prevStartDate = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);

    groupByFormat = '%Y-%m';
  } else if (period === 'all') {
    startDate = new Date(2020, 0, 1);
    prevStartDate = null;
    prevEndDate = null;
    groupByFormat = '%Y-%m';
  } else {
    // default: monthly (last 30 days)
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 29);
    startDate.setHours(0, 0, 0, 0);

    prevEndDate = new Date(startDate.getTime() - 1);
    prevStartDate = new Date(prevEndDate);
    prevStartDate.setDate(prevStartDate.getDate() - 29);
    prevStartDate.setHours(0, 0, 0, 0);

    groupByFormat = '%Y-%m-%d';
  }

  // Base filter for completed & non-refunded orders
  const baseMatch = {
    status: 'completed',
    refunded: { $ne: true },
  };

  const periodMatch = {
    ...baseMatch,
    createdAt: { $gte: startDate, $lte: endDate },
  };

  // Pure Currency Isolation: Separate USD and SYP without any exchange rate merging
  const projectFields = {
    currencyType: {
      $cond: [
        {
          $or: [
            { $eq: ['$currency', 'SYP'] },
            { $eq: ['$currency', 'syp'] },
            { $eq: ['$currency', 'ل.س'] },
          ],
        },
        'SYP',
        'USD',
      ],
    },
    userPrice: { $ifNull: ['$userPrice', 0] },
    costPrice: { $ifNull: ['$costPrice', 0] },
    profit: { $ifNull: ['$profit', 0] },
    productId: 1,
    productName: 1,
    category: 1,
    image: 1,
    createdAt: 1,
    currency: 1,
  };

  // 1. Current Period & Previous Period Summary Aggregation (Grouped strictly by Currency)
  const [currentSummaryAgg, prevSummaryAgg] = await Promise.all([
    Order.aggregate([
      { $match: periodMatch },
      { $project: projectFields },
      {
        $group: {
          _id: '$currencyType',
          totalRevenue: { $sum: '$userPrice' },
          totalCost: { $sum: '$costPrice' },
          totalProfit: { $sum: '$profit' },
          ordersCount: { $sum: 1 },
        },
      },
    ]),
    prevStartDate && prevEndDate
      ? Order.aggregate([
        {
          $match: {
            ...baseMatch,
            createdAt: { $gte: prevStartDate, $lte: prevEndDate },
          },
        },
        { $project: projectFields },
        {
          $group: {
            _id: '$currencyType',
            totalRevenue: { $sum: '$userPrice' },
            totalCost: { $sum: '$costPrice' },
            totalProfit: { $sum: '$profit' },
            ordersCount: { $sum: 1 },
          },
        },
      ])
      : Promise.resolve([]),
  ]);

  const usdCurr = currentSummaryAgg.find((s) => s._id === 'USD') || {
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    ordersCount: 0,
  };
  const sypCurr = currentSummaryAgg.find((s) => s._id === 'SYP') || {
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    ordersCount: 0,
  };

  const usdPrev = prevSummaryAgg.find((s) => s._id === 'USD') || {
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    ordersCount: 0,
  };
  const sypPrev = prevSummaryAgg.find((s) => s._id === 'SYP') || {
    totalRevenue: 0,
    totalCost: 0,
    totalProfit: 0,
    ordersCount: 0,
  };

  // USD Calculations (Pure USD figures)
  const totalRevenueUsd = Number((usdCurr.totalRevenue || 0).toFixed(2));
  const totalCostUsd = Number((usdCurr.totalCost || 0).toFixed(2));
  const totalProfitUsd = Number((usdCurr.totalProfit || 0).toFixed(2));
  const ordersCountUsd = usdCurr.ordersCount || 0;
  const profitMarginUsd = totalRevenueUsd > 0 ? Number(((totalProfitUsd / totalRevenueUsd) * 100).toFixed(1)) : 0;
  const avgProfitPerOrderUsd = ordersCountUsd > 0 ? Number((totalProfitUsd / ordersCountUsd).toFixed(2)) : 0;
  const profitGrowthUsd =
    usdPrev.totalProfit > 0
      ? Number((((totalProfitUsd - usdPrev.totalProfit) / usdPrev.totalProfit) * 100).toFixed(1))
      : totalProfitUsd > 0
        ? 100
        : 0;
  const revenueGrowthUsd =
    usdPrev.totalRevenue > 0
      ? Number((((totalRevenueUsd - usdPrev.totalRevenue) / usdPrev.totalRevenue) * 100).toFixed(1))
      : totalRevenueUsd > 0
        ? 100
        : 0;

  // SYP Calculations (Pure SYP figures - strictly NO exchange rate conversion)
  const totalRevenueSyp = Math.round(sypCurr.totalRevenue || 0);
  const totalCostSyp = Math.round(sypCurr.totalCost || 0);
  const totalProfitSyp = Math.round(sypCurr.totalProfit || 0);
  const ordersCountSyp = sypCurr.ordersCount || 0;
  const profitMarginSyp = totalRevenueSyp > 0 ? Number(((totalProfitSyp / totalRevenueSyp) * 100).toFixed(1)) : 0;
  const avgProfitPerOrderSyp = ordersCountSyp > 0 ? Math.round(totalProfitSyp / ordersCountSyp) : 0;
  const profitGrowthSyp =
    sypPrev.totalProfit > 0
      ? Number((((totalProfitSyp - sypPrev.totalProfit) / sypPrev.totalProfit) * 100).toFixed(1))
      : totalProfitSyp > 0
        ? 100
        : 0;
  const revenueGrowthSyp =
    sypPrev.totalRevenue > 0
      ? Number((((totalRevenueSyp - sypPrev.totalRevenue) / sypPrev.totalRevenue) * 100).toFixed(1))
      : totalRevenueSyp > 0
        ? 100
        : 0;

  // 2. Timeline Breakdown (Grouped by Date and Currency)
  const timelineAgg = await Order.aggregate([
    { $match: periodMatch },
    { $project: projectFields },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: groupByFormat, date: '$createdAt' } },
          currencyType: '$currencyType',
        },
        revenue: { $sum: '$userPrice' },
        cost: { $sum: '$costPrice' },
        profit: { $sum: '$profit' },
        ordersCount: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ]);

  const timelineUsd = timelineAgg
    .filter((i) => i._id.currencyType === 'USD')
    .map((item) => ({
      date: item._id.date,
      revenue: Number((item.revenue || 0).toFixed(2)),
      cost: Number((item.cost || 0).toFixed(2)),
      profit: Number((item.profit || 0).toFixed(2)),
      ordersCount: item.ordersCount || 0,
    }));

  const timelineSyp = timelineAgg
    .filter((i) => i._id.currencyType === 'SYP')
    .map((item) => ({
      date: item._id.date,
      revenue: Math.round(item.revenue || 0),
      cost: Math.round(item.cost || 0),
      profit: Math.round(item.profit || 0),
      ordersCount: item.ordersCount || 0,
    }));

  // 3. Top Profitable Products (Top 10 separated for USD and SYP)
  const [topProductsAggUsd, topProductsAggSyp] = await Promise.all([
    Order.aggregate([
      { $match: periodMatch },
      { $project: projectFields },
      { $match: { currencyType: 'USD' } },
      {
        $group: {
          _id: {
            productName: '$productName',
            productId: '$productId',
          },
          image: { $first: '$image' },
          category: { $first: '$category' },
          totalProfit: { $sum: '$profit' },
          totalRevenue: { $sum: '$userPrice' },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { totalProfit: -1 } },
      { $limit: 10 },
    ]),
    Order.aggregate([
      { $match: periodMatch },
      { $project: projectFields },
      { $match: { currencyType: 'SYP' } },
      {
        $group: {
          _id: {
            productName: '$productName',
            productId: '$productId',
          },
          image: { $first: '$image' },
          category: { $first: '$category' },
          totalProfit: { $sum: '$profit' },
          totalRevenue: { $sum: '$userPrice' },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { totalProfit: -1 } },
      { $limit: 10 },
    ]),
  ]);

  const topProductsUsd = topProductsAggUsd.map((item, index) => {
    const rev = Number((item.totalRevenue || 0).toFixed(2));
    const prf = Number((item.totalProfit || 0).toFixed(2));
    return {
      rank: index + 1,
      productId: item._id.productId,
      productName: item._id.productName || 'منتج غير محدد',
      image: item.image || '',
      category: item.category || 'عام',
      currency: 'USD',
      totalProfit: prf,
      totalRevenue: rev,
      ordersCount: item.ordersCount,
      profitMargin: rev > 0 ? Number(((prf / rev) * 100).toFixed(1)) : 0,
    };
  });

  const topProductsSyp = topProductsAggSyp.map((item, index) => {
    const rev = Math.round(item.totalRevenue || 0);
    const prf = Math.round(item.totalProfit || 0);
    return {
      rank: index + 1,
      productId: item._id.productId,
      productName: item._id.productName || 'منتج غير محدد',
      image: item.image || '',
      category: item.category || 'عام',
      currency: 'SYP',
      totalProfit: prf,
      totalRevenue: rev,
      ordersCount: item.ordersCount,
      profitMargin: rev > 0 ? Number(((prf / rev) * 100).toFixed(1)) : 0,
    };
  });

  // 4. Category Breakdown separated for USD and SYP
  const [categoryAggUsd, categoryAggSyp] = await Promise.all([
    Order.aggregate([
      { $match: periodMatch },
      { $project: projectFields },
      { $match: { currencyType: 'USD' } },
      {
        $group: {
          _id: '$category',
          totalProfit: { $sum: '$profit' },
          totalRevenue: { $sum: '$userPrice' },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { totalProfit: -1 } },
    ]),
    Order.aggregate([
      { $match: periodMatch },
      { $project: projectFields },
      { $match: { currencyType: 'SYP' } },
      {
        $group: {
          _id: '$category',
          totalProfit: { $sum: '$profit' },
          totalRevenue: { $sum: '$userPrice' },
          ordersCount: { $sum: 1 },
        },
      },
      { $sort: { totalProfit: -1 } },
    ]),
  ]);

  const categoriesUsd = categoryAggUsd.map((item) => {
    const catProfit = Number((item.totalProfit || 0).toFixed(2));
    const catRev = Number((item.totalRevenue || 0).toFixed(2));
    return {
      category: item._id || 'غير مصنف',
      totalProfit: catProfit,
      totalRevenue: catRev,
      ordersCount: item.ordersCount,
      profitShare: totalProfitUsd > 0 ? Number(((catProfit / totalProfitUsd) * 100).toFixed(1)) : 0,
    };
  });

  const categoriesSyp = categoryAggSyp.map((item) => {
    const catProfit = Math.round(item.totalProfit || 0);
    const catRev = Math.round(item.totalRevenue || 0);
    return {
      category: item._id || 'غير مصنف',
      totalProfit: catProfit,
      totalRevenue: catRev,
      ordersCount: item.ordersCount,
      profitShare: totalProfitSyp > 0 ? Number(((catProfit / totalProfitSyp) * 100).toFixed(1)) : 0,
    };
  });

  return {
    period,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    exchangeRate,
    summary: {
      totalRevenueUsd,
      totalCostUsd,
      totalProfitUsd,
      ordersCountUsd,
      profitMarginUsd,
      avgProfitPerOrderUsd,
      profitGrowthUsd,
      revenueGrowthUsd,
      totalRevenueSyp,
      totalCostSyp,
      totalProfitSyp,
      ordersCountSyp,
      profitMarginSyp,
      avgProfitPerOrderSyp,
      profitGrowthSyp,
      revenueGrowthSyp,
      ordersCount: ordersCountUsd + ordersCountSyp,
    },
    usd: {
      summary: {
        totalRevenue: totalRevenueUsd,
        totalCost: totalCostUsd,
        totalProfit: totalProfitUsd,
        ordersCount: ordersCountUsd,
        profitMargin: profitMarginUsd,
        avgProfitPerOrder: avgProfitPerOrderUsd,
        profitGrowth: profitGrowthUsd,
        revenueGrowth: revenueGrowthUsd,
      },
      timeline: timelineUsd,
      topProducts: topProductsUsd,
      categories: categoriesUsd,
    },
    syp: {
      summary: {
        totalRevenue: totalRevenueSyp,
        totalCost: totalCostSyp,
        totalProfit: totalProfitSyp,
        ordersCount: ordersCountSyp,
        profitMargin: profitMarginSyp,
        avgProfitPerOrder: avgProfitPerOrderSyp,
        profitGrowth: profitGrowthSyp,
        revenueGrowth: revenueGrowthSyp,
      },
      timeline: timelineSyp,
      topProducts: topProductsSyp,
      categories: categoriesSyp,
    },
    timeline: timelineUsd,
    topProducts: topProductsUsd,
    categories: categoriesUsd,
  };
};

let isBackgroundSyncRunning = false;

/**
 * Automatically repairs any orphaned provider orders where user balance was deducted and provider order dispatched,
 * but the Order document creation failed (e.g. due to server runtime error).
 * Restores the order to 'completed' / 'processing' and awards cashback coins to user.
 */
export const repairOrphanedProviderOrders = async () => {
  try {
    const recentLogs = await ApiLog.find({
      type: 'PROVIDER_DISPATCH',
      operation: 'PURCHASE',
      direction: 'OUTGOING',
      isSuccess: true,
      orderId: { $exists: true, $ne: '' },
      createdAt: { $gte: new Date(Date.now() - 72 * 60 * 60 * 1000) },
    }).sort({ createdAt: -1 }).limit(100);

    for (const log of recentLogs) {
      const orderId = String(log.orderId).trim();
      if (!orderId) continue;

      const existingOrder = await Order.findOne({ orderId });
      if (existingOrder) continue;

      console.log(`🛠️ [Auto-Repair]: Found orphaned provider dispatch for Order #${orderId}. Recovering...`);

      const tx = await Transaction.findOne({ orderId, type: 'purchase' });
      const user = await User.findById(log.userId);
      if (!user) continue;

      const resp = log.responseBody || {};
      const providerOrderId = extractProviderOrderId(resp) || log.orderId;
      const userPrice = tx?.amount || Number(resp?.data?.price) || 0;
      const costPrice = tx?.costPrice || Number(resp?.data?.price) || userPrice;
      const profit = tx?.profit || Math.max(0, userPrice - costPrice);

      const newOrder = await Order.create({
        orderId,
        userId: user._id,
        productName: log.productName || tx?.productName || 'طلب شحن ألعاب',
        category: 'ألعاب',
        targetId: tx?.targetId || resp?.data?.data?.playerId || resp?.data?.playerId || '',
        quantity: log.requestBody?.qty || 1,
        source: log.provider || 'brand1card',
        costPrice,
        userPrice,
        profit,
        currency: tx?.currency || user.currency || '$',
        status: 'completed',
        completedAt: log.createdAt || new Date(),
        executionDurationSeconds: Math.round((log.durationMs || 2500) / 1000),
        executionDurationText: formatDurationArabic(Math.round((log.durationMs || 2500) / 1000)),
        providerOrderId: String(providerOrderId),
        providerPayload: { targetUrl: log.endpoint, params: log.requestBody },
        providerResponse: resp,
      });

      console.log(`✅ [Auto-Repair]: Successfully restored Order #${orderId} as completed in DB!`);

      // Award cashback coins if not awarded yet
      try {
        const settings = await getSettings();
        const cashbackPercentage = Number(settings.cashbackPercentage) || 0;
        if (settings.isCashbackActive !== false && cashbackPercentage > 0) {
          const exchangeRate = Number(settings.exchangeRateUsdToSyp) || 15000;
          let spentInUsd = userPrice;
          if (user.currency === 'SYP' || user.currency === 'ل.س') {
            spentInUsd = userPrice / exchangeRate;
          }
          const rawCoins = spentInUsd * (cashbackPercentage / 100);
          const coinsAwarded = Number((Math.round(rawCoins * 10) / 10).toFixed(1));
          if (coinsAwarded > 0) {
            user.coins = Number(((user.coins || 0) + coinsAwarded).toFixed(1));
            await user.save();
            newOrder.coinsEarned = coinsAwarded;
            await newOrder.save();
            console.log(`🎁 [Auto-Repair]: Awarded ${coinsAwarded} cashback coins to user ${user.email} for restored order #${orderId}`);
          }
        }
      } catch (coinErr) {
        console.error('[Auto-Repair Cashback Error]:', coinErr);
      }
    }
  } catch (err) {
    console.error('[Auto-Repair Orphaned Orders Error]:', err);
  }
};

/**
 * Periodically polls external providers for pending/processing orders.
 * Runs every 60 seconds with strict concurrency control and small batches (15 items)
 * to maintain high performance and avoid event loop or network socket starvation.
 */
export const startBackgroundOrderSyncWorker = () => {
  console.log('🔄 [OrderSyncWorker] Started automatic background order sync (every 60s)');
  // Run repair on startup
  setTimeout(() => {
    repairOrphanedProviderOrders().catch((e) => console.error('[Startup Order Repair Warning]:', e.message));
  }, 5000);

  setInterval(async () => {
    if (isBackgroundSyncRunning) return;
    try {
      isBackgroundSyncRunning = true;
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000); // Last 24 hours
      const pendingOrders = await Order.find({
        status: { $in: ['processing', 'pending', 'wait'] },
        refunded: false,
        source: { $in: ['roya_usd', 'roya_syp', 'brand1card', 'auto1card', 'sw_games'] },
        createdAt: { $gte: cutoff },
      }).limit(15);

      if (pendingOrders.length > 0) {
        await syncOrdersBatch(pendingOrders);
      }
    } catch (err) {
      // background silent catch
    } finally {
      isBackgroundSyncRunning = false;
    }
  }, 60000);
};

