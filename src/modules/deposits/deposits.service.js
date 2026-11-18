import mongoose from 'mongoose';
import { DepositMethod } from './depositMethods.model.js';
import { Deposit } from './deposits.model.js';
import { User } from '../users/users.model.js';
import { Transaction } from '../users/transactions.model.js';
import { getSettings, getEffectiveExchangeRates } from '../settings/settings.service.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import { sendAdminNotification, sendDirectUserNotification } from '../../config/firebaseAdmin.js';

const DEFAULT_METHODS = [
  {
    key: 'sham_syp',
    title: 'شام كاش (ليرة)',
    iconKey: 'sham',
    currency: 'SYP',
    account: 'Diamond perfume',
    address: '472d34418a70d3fa710316306d99d9ad',
    fee: 0,
    minDeposit: 10000,
    maxDeposit: 100000000,
    instructions: 'قم بالتحويل عبر تطبيق شام كاش إلى المعرف الموضح وأدخل رقم العملية لتأكيد الشحن فوراً.',
    badge: '',
    color: '#3B82F6',
    order: 1,
    isEnabled: true,
  },
  {
    key: 'sham_usd',
    title: 'شام كاش (دولار)',
    iconKey: 'sham',
    currency: 'USD',
    account: 'Diamond perfume',
    address: '472d34418a70d3fa710316306d99d9ad',
    fee: 0,
    minDeposit: 1,
    maxDeposit: 10000,
    instructions: 'قم بالتحويل بالدولار عبر تطبيق شام كاش إلى المعرف أعلاه مع كتابة رقم العملية.',
    badge: '',
    color: '#2563EB',
    order: 2,
    isEnabled: true,
  },
  {
    key: 'syriatel',
    title: 'سيريتل كاش',
    iconKey: 'syriatel',
    currency: 'SYP',
    account: 'تحويل يدوي فقط',
    address: '72706706',
    fee: 2,
    minDeposit: 10000,
    maxDeposit: 10000000,
    instructions: 'أرسل المبلغ المطلوب عبر كود سيريتل كاش *580# إلى الرقم الموضح، وسجل رقم العملية.',
    badge: '',
    color: '#EF4444',
    order: 3,
    isEnabled: true,
  },
  {
    key: 'binance_pay',
    title: 'Binance Pay',
    iconKey: 'binance',
    currency: 'USD',
    account: 'GOLD SM',
    address: '1122809026',
    fee: 0,
    minDeposit: 1,
    maxDeposit: 20000,
    instructions: 'أرسل المبلغ عبر منصة بينانس إلى Binance Pay ID الموضح وانسخ Order ID أو معرف المعاملة.',
    badge: '',
    color: '#F59E0B',
    order: 4,
    isEnabled: true,
  },
  {
    key: 'usdt_trc20',
    title: 'USDT TRC20',
    iconKey: 'usdt',
    currency: 'USD',
    account: 'محفظة USDT TRC20 المعتمدة',
    address: 'TFg7v8Z9SfCGFjxaM3dzaLT1Ho48az4gHF',
    fee: 0,
    minDeposit: 5,
    maxDeposit: 50000,
    instructions: 'أرسل عملة USDT عبر شبكة Tron (TRC-20) حصراً إلى العنوان أعلاه ثم الصق هاش المعاملة (TxID).',
    badge: '',
    color: '#10B981',
    order: 5,
    isEnabled: true,
  },
  {
    key: 'usdt_bep20',
    title: 'USDT BEP20',
    iconKey: 'usdt',
    currency: 'USD',
    account: 'محفظة USDT BEP20',
    address: '0x36cfc8d760b106b9724e7c76ca18645f7195bd99',
    fee: 0,
    minDeposit: 5,
    maxDeposit: 50000,
    instructions: 'أرسل USDT عبر شبكة BNB Smart Chain (BEP-20) وأدخل معرف العملية TxID.',
    badge: '',
    color: '#14B8A6',
    order: 6,
    isEnabled: true,
  },
  {
    key: 'coinex',
    title: 'CoinEx',
    iconKey: 'coinex',
    currency: 'USD',
    account: 'CoinEx ID',
    address: '4996880',
    fee: 0,
    minDeposit: 1,
    maxDeposit: 10000,
    instructions: 'قم بالتحويل الداخلي عبر منصة كوين إكس إلى CoinEx ID الموضح.',
    badge: '',
    color: '#6366F1',
    order: 7,
    isEnabled: true,
  },
  {
    key: 'kazawallet',
    title: 'Kazawallet',
    iconKey: 'kazawallet',
    currency: 'USD',
    account: 'Kazawallet Account',
    address: 'k7851572',
    fee: 0,
    minDeposit: 1,
    maxDeposit: 10000,
    instructions: 'قم بالتحويل عبر محفظة كازا إلى المعرف الموضح.',
    badge: '',
    color: '#8B5CF6',
    order: 8,
    isEnabled: true,
  },
  {
    key: 'al_haram',
    title: 'الهرم / الفؤاد',
    iconKey: 'haram',
    currency: 'SYP',
    account: 'حوالات داخلية سورية',
    address: 'دمشق - تواصل مع الدعم لأحدث اسم مستلم',
    fee: 0,
    minDeposit: 50000,
    maxDeposit: 50000000,
    instructions: 'أرسل الحوالة عبر أقرب فرع للهرم أو الفؤاد باسم المستلم المعتمد ثم أرفق رقم الإشعار.',
    badge: '',
    color: '#EC4899',
    order: 9,
    isEnabled: true,
  },
];

/**
 * Ensures default methods exist in database
 */
export const ensureDefaultMethods = async () => {
  const count = await DepositMethod.countDocuments();
  if (count === 0) {
    await DepositMethod.insertMany(DEFAULT_METHODS);
    console.log('✅ Seeded default deposit methods successfully');
  } else {
    // Clear any existing badges to keep payment method titles clean
    await DepositMethod.updateMany({ badge: { $ne: '' } }, { $set: { badge: '' } });
  }
};

/**
 * Returns active deposit methods for users
 */
export const getActiveDepositMethods = async () => {
  await ensureDefaultMethods();
  return await DepositMethod.find({ isEnabled: true }).sort({ order: 1, createdAt: 1 });
};

/**
 * User submits a deposit request
 */
export const createDepositRequest = async ({
  userId,
  methodKey,
  amount,
  operationNumber,
  fieldsData,
  note = '',
  receiptImage = '',
}) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError('المستخدم غير موجود', HTTP_STATUS.NOT_FOUND);
  }
  if (!user.isActive) {
    throw new ApiError('الحساب غير نشط حالياً', HTTP_STATUS.FORBIDDEN);
  }

  const cleanAmount = Number(amount);
  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    throw new ApiError('يرجى إدخال مبلغ صحيح أكبر من الصفر', HTTP_STATUS.BAD_REQUEST);
  }

  await ensureDefaultMethods();
  const method = await DepositMethod.findOne({ key: methodKey, isEnabled: true });
  if (!method) {
    throw new ApiError('طريقة الإيداع غير متاحة حالياً', HTTP_STATUS.NOT_FOUND);
  }

  // Validate custom required fields if specified by admin
  const submittedFields = fieldsData && typeof fieldsData === 'object' ? fieldsData : {};
  const methodRequiredFields = Array.isArray(method.requiredFields) && method.requiredFields.length > 0
    ? method.requiredFields
    : [];

  if (methodRequiredFields.length > 0) {
    for (const fieldName of methodRequiredFields) {
      let val = submittedFields[fieldName];
      if ((val === undefined || String(val).trim() === '') && (fieldName.includes('عملية') || fieldName.includes('إشعار'))) {
        val = operationNumber;
        submittedFields[fieldName] = operationNumber;
      }
      if (val === undefined || String(val).trim() === '') {
        throw new ApiError(`الحقل مطلوب: ${fieldName}`, HTTP_STATUS.BAD_REQUEST);
      }
    }
  }

  let cleanOperation = String(operationNumber || '').trim();
  if (!cleanOperation) {
    for (const [k, v] of Object.entries(submittedFields)) {
      if (k.includes('عملية') || k.includes('إشعار') || k.includes('رقم') || k.includes('معرف')) {
        cleanOperation = String(v).trim();
        break;
      }
    }
    if (!cleanOperation && Object.values(submittedFields).length > 0) {
      cleanOperation = String(Object.values(submittedFields)[0]).trim();
    }
    if (!cleanOperation) {
      cleanOperation = `OP-${Date.now().toString().slice(-6)}`;
    }
  }

  // Currency compatibility check:
  // If user currency is USD, user can deposit via USD methods or SYP methods
  if (cleanAmount < method.minDeposit) {
    throw new ApiError(
      `الحد الأدنى للإيداع عبر ${method.title} هو ${method.minDeposit} ${method.currency}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }
  if (method.maxDeposit > 0 && cleanAmount > method.maxDeposit) {
    throw new ApiError(
      `الحد الأقصى للإيداع عبر ${method.title} هو ${method.maxDeposit} ${method.currency}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  if (method.requiresReceiptImage && !String(receiptImage || '').trim()) {
    throw new ApiError('طريقة الإيداع هذه تتطلب إرفاق صورة إشعار التحويل', HTTP_STATUS.BAD_REQUEST);
  }

  if (method.requiresVerification) {
    const userDoc = await User.findById(userId);
    if (!userDoc || !userDoc.isVerified) {
      throw new ApiError(
        'طريقة الإيداع هذه مخصصة للحسابات الموثقة فقط. يرجى توثيق حسابك أولاً للاستفادة منها.',
        HTTP_STATUS.FORBIDDEN
      );
    }
  }

  // Check duplicate operation number for same method
  const existingOp = await Deposit.findOne({
    methodKey,
    operationNumber: cleanOperation,
  });
  if (existingOp) {
    throw new ApiError('رقم العملية هذا تم إرساله مسبقاً، يرجى التحقق من الرقم المدخل', HTTP_STATUS.CONFLICT);
  }

  // Get system daily exchange rates (Buy & Sell)
  let exchangeRateBuy = 15000;
  let exchangeRateSell = 15000;
  try {
    const settings = await getSettings();
    if (settings) {
      const rates = getEffectiveExchangeRates(settings);
      exchangeRateBuy = rates.buyRate;
      exchangeRateSell = rates.sellRate;
    }
  } catch (_) {}

  // Calculate fees & net amount
  const feePercent = Number(method.fee || 0);
  const feeAmount = Number(((cleanAmount * feePercent) / 100).toFixed(4));
  const rawNetAmount = Number((cleanAmount - feeAmount).toFixed(4));

  const userCurrency = (user.currency || 'USD').toUpperCase();
  const isCustom = method.currencyType === 'OTHER' || method.isCustomCurrency === true;
  const methodCurrency = isCustom
    ? (method.currencyUnit || method.currency || 'OTHER')
    : (method.currency || 'USD').toUpperCase();

  let netAmount = rawNetAmount;
  let creditCurrency = userCurrency;
  let appliedRate = 1;
  let amountInUsd = 0;

  if (isCustom) {
    // Custom Currency (e.g. Iraqi Dinar, Turkish Lira, etc.)
    // Formula: cleanAmount / ratePerUsd = USD equivalent
    const ratePerUsd = Number(method.ratePerUsd) > 0 ? Number(method.ratePerUsd) : 1;
    appliedRate = ratePerUsd;
    const netCustomAmount = rawNetAmount;
    const netAmountInUsd = Number((netCustomAmount / ratePerUsd).toFixed(4));
    amountInUsd = Number((cleanAmount / ratePerUsd).toFixed(2));

    if (userCurrency === 'USD') {
      netAmount = Number(netAmountInUsd.toFixed(2));
      creditCurrency = 'USD';
    } else {
      // User wallet is SYP: user receives SYP -> Buy Rate (سعر الشراء المنخفض)
      netAmount = Math.round(netAmountInUsd * exchangeRateBuy);
      creditCurrency = 'SYP';
      appliedRate = exchangeRateBuy;
    }
  } else if (userCurrency === 'USD' && methodCurrency === 'SYP') {
    // USD User depositing in SYP (buying USD with SYP):
    // Higher Sell Rate applies (سعر المبيع المرتفع)
    appliedRate = exchangeRateSell;
    netAmount = Number((rawNetAmount / exchangeRateSell).toFixed(2));
    amountInUsd = netAmount;
    creditCurrency = 'USD';
  } else if (userCurrency === 'SYP' && methodCurrency === 'USD') {
    // SYP User depositing in USD (receiving SYP in wallet):
    // Lower Buy Rate applies (سعر الشراء المنخفض)
    appliedRate = exchangeRateBuy;
    amountInUsd = rawNetAmount;
    netAmount = Math.round(rawNetAmount * exchangeRateBuy);
    creditCurrency = 'SYP';
  } else if (userCurrency === 'USD') {
    amountInUsd = rawNetAmount;
  } else if (userCurrency === 'SYP') {
    // User is SYP depositing SYP, reference amount in USD using sell rate
    amountInUsd = Number((rawNetAmount / exchangeRateSell).toFixed(2));
  }

  // Generate friendly unique 6-digit deposit ID
  let isUnique = false;
  let depositId = '';
  let attempts = 0;
  while (!isUnique && attempts < 30) {
    attempts++;
    depositId = Math.floor(100000 + Math.random() * 900000).toString();
    const existing = await Deposit.findOne({ depositId }).select('_id');
    if (!existing) {
      isUnique = true;
    }
  }
  if (!isUnique) {
    depositId = Math.floor(1000000 + Math.random() * 9000000).toString();
  }

  // Create deposit record with 'pending' status
  const deposit = await Deposit.create({
    depositId,
    userId: user._id,
    userEmail: user.email,
    userName: user.name,
    methodKey: method.key,
    methodTitle: method.title,
    account: method.account,
    address: method.address,
    amount: cleanAmount,
    netAmount,
    feePercent,
    feeAmount,
    sourceCurrency: isCustom ? (method.currencyUnit || method.currency || 'OTHER') : method.currency,
    currencyType: isCustom ? 'OTHER' : (method.currency === 'SYP' ? 'SYP' : 'USD'),
    currencyUnit: method.currencyUnit || '',
    ratePerUsd: Number(method.ratePerUsd) || 1,
    amountInUsd,
    creditCurrency,
    exchangeRate: appliedRate,
    operationNumber: cleanOperation,
    fieldsData: submittedFields,
    note: String(note || '').trim(),
    receiptImage: String(receiptImage || '').trim(),
    status: 'pending',
  });

  // Notify Admins about new deposit request
  sendAdminNotification({
    title: 'طلب إيداع جديد 💰',
    body: `أرسل الزبون ${user.name} طلب إيداع بقيمة ${cleanAmount} ${method.currency} عبر ${method.title}.`,
    data: {
      type: 'deposit_request',
      depositId: String(deposit._id),
      operationNumber: cleanOperation,
    },
  }).catch((err) => console.error('[Deposit Admin Notification Error]:', err.message));

  return deposit.toJSON();
};

/**
 * Returns deposit history for specific user
 */
export const getUserDeposits = async (userId) => {
  const [deposits, directTransactions] = await Promise.all([
    Deposit.find({ userId }).sort({ createdAt: -1 }).lean(),
    Transaction.find({
      userId,
      type: 'deposit',
      note: { $not: /قبول إيداع/ },
    })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  const mappedDirect = directTransactions.map((tx) => ({
    _id: tx._id,
    depositId: tx._id.toString().slice(-6).toUpperCase(),
    userId: tx.userId,
    methodKey: 'direct_admin',
    methodTitle: 'إيداع رصيد من الإدارة',
    amount: tx.amount,
    netAmount: tx.amount,
    feePercent: 0,
    feeAmount: 0,
    sourceCurrency: tx.currency || 'USD',
    creditCurrency: tx.currency || 'USD',
    operationNumber: tx._id.toString().slice(-8),
    note: tx.note || 'شحن رصيد مباشر من الإدارة',
    status: 'accepted',
    createdAt: tx.createdAt,
  }));

  const all = [...deposits, ...mappedDirect];
  all.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return all;
};

/**
 * Returns all deposits for admin review
 */
export const getAdminDeposits = async (query = {}) => {
  const filter = {};
  if (query.status && query.status !== 'all') {
    filter.status = query.status;
  }
  if (query.methodKey && query.methodKey !== 'all') {
    filter.methodKey = query.methodKey;
  }
  if (query.userId) {
    filter.userId = query.userId;
  }
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { depositId: { $regex: s, $options: 'i' } },
      { operationNumber: { $regex: s, $options: 'i' } },
      { userEmail: { $regex: s, $options: 'i' } },
      { userName: { $regex: s, $options: 'i' } },
      { methodTitle: { $regex: s, $options: 'i' } },
    ];
  }

  const deposits = await Deposit.find(filter)
    .populate('userId', 'name email phone balance avatar currency')
    .sort({ createdAt: -1 });

  const counts = {
    all: await Deposit.countDocuments(),
    pending: await Deposit.countDocuments({ status: 'pending' }),
    accepted: await Deposit.countDocuments({ status: 'accepted' }),
    rejected: await Deposit.countDocuments({ status: 'rejected' }),
  };

  return { deposits, counts };
};

/**
 * Admin accepts deposit request
 * Strictly idempotent: prevents double credit via `processedOnce` & `status === 'pending'`
 */
export const acceptDeposit = async ({ depositId, adminId, adminEmail = '' }) => {
  const deposit = await Deposit.findOne({
    $or: [{ depositId }, { _id: mongoose.isValidObjectId(depositId) ? depositId : null }],
  });

  if (!deposit) {
    throw new ApiError('طلب الإيداع غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (deposit.status !== 'pending' || deposit.processedOnce) {
    throw new ApiError('هذا الإيداع تمت معالجته سابقاً، وتم منع تكرار العملية', HTTP_STATUS.BAD_REQUEST);
  }

  const user = await User.findById(deposit.userId);
  if (!user) {
    throw new ApiError('المستخدم صاحب الطلب غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  const creditAmount = Number((deposit.netAmount || 0).toFixed(4));
  const prevBal = Number((user.balance || 0).toFixed(4));
  const newBal = Number((prevBal + creditAmount).toFixed(4));

  // Update user balance atomically
  user.balance = newBal;
  user.totalDeposited = Number(((user.totalDeposited || 0) + creditAmount).toFixed(4));
  await user.save();

  // Mark deposit accepted
  deposit.status = 'accepted';
  deposit.processedOnce = true;
  deposit.processedAt = new Date();
  deposit.processedBy = adminEmail || String(adminId || 'admin');
  await deposit.save();

  // Record audit transaction
  let acceptNote = '';
  if (deposit.currencyType === 'OTHER') {
    const unit = deposit.currencyUnit || deposit.sourceCurrency || 'وحدة';
    if (deposit.creditCurrency === 'USD') {
      acceptNote = `قبول إيداع (${deposit.depositId}) عبر ${deposit.methodTitle}: مدفوع ${deposit.amount} ${unit} = معادل ${creditAmount} $ (سعر صرف 1$ = ${deposit.ratePerUsd} ${unit}) - رقم العملية: ${deposit.operationNumber}`;
    } else {
      acceptNote = `قبول إيداع (${deposit.depositId}) عبر ${deposit.methodTitle}: مدفوع ${deposit.amount} ${unit} = معادل ${deposit.amountInUsd} $ = ${creditAmount} ل.س (سعر صرف 1$ = ${deposit.exchangeRate} ل.س) - رقم العملية: ${deposit.operationNumber}`;
    }
  } else if (deposit.sourceCurrency === 'SYP' && deposit.creditCurrency === 'USD') {
    acceptNote = `قبول إيداع (${deposit.depositId}) عبر ${deposit.methodTitle}: مدفوع ${deposit.amount} ل.س = معادل ${creditAmount} $ (سعر صرف 1$ = ${deposit.exchangeRate} ل.س) - رقم العملية: ${deposit.operationNumber}`;
  } else if (deposit.sourceCurrency === 'USD' && deposit.creditCurrency === 'SYP') {
    acceptNote = `قبول إيداع (${deposit.depositId}) عبر ${deposit.methodTitle}: مدفوع ${deposit.amount} $ = معادل ${creditAmount} ل.س (سعر صرف 1$ = ${deposit.exchangeRate} ل.س) - رقم العملية: ${deposit.operationNumber}`;
  } else {
    acceptNote = `قبول إيداع (${deposit.depositId}) عبر ${deposit.methodTitle} - رقم العملية: ${deposit.operationNumber}`;
  }

  const transaction = await Transaction.create({
    userId: user._id,
    adminId: mongoose.isValidObjectId(adminId) ? adminId : null,
    type: 'deposit',
    currency: user.currency || deposit.creditCurrency || 'USD',
    amount: creditAmount,
    previousBalance: prevBal,
    newBalance: newBal,
    note: acceptNote,
  });

  deposit.transactionId = transaction._id;
  await deposit.save();

  // Notify User about deposit approval
  sendDirectUserNotification(deposit.userId, {
    title: 'تمت الموافقة على طلب الإيداع ✅',
    body: `تمت إضافة ${creditAmount} ${deposit.creditCurrency === 'SYP' ? 'ل.س' : '$'} إلى محفظتك بنجاح! رصيدك الحالي: ${newBal} ${deposit.creditCurrency === 'SYP' ? 'ل.س' : '$'}.`,
    data: {
      type: 'deposit_accepted',
      depositId: String(deposit._id),
      amount: String(creditAmount),
    },
  }).catch((err) => console.error('[User Deposit Accepted Push Error]:', err.message));

  return {
    ok: true,
    message: `تم قبول الإيداع بنجاح وإضافة ${creditAmount} إلى رصيد الزبون.`,
    deposit: deposit.toJSON(),
    user: {
      id: user._id,
      balance: user.balance,
      totalDeposited: user.totalDeposited,
    },
  };
};

/**
 * Admin rejects deposit request
 */
export const rejectDeposit = async ({ depositId, rejectionReason, adminId, adminEmail = '' }) => {
  const deposit = await Deposit.findOne({
    $or: [{ depositId }, { _id: mongoose.isValidObjectId(depositId) ? depositId : null }],
  });

  if (!deposit) {
    throw new ApiError('طلب الإيداع غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  if (deposit.status !== 'pending' || deposit.processedOnce) {
    throw new ApiError('هذا الإيداع تمت معالجته سابقاً', HTTP_STATUS.BAD_REQUEST);
  }

  const cleanReason = String(rejectionReason || '').trim();
  if (cleanReason.length < 3) {
    throw new ApiError('يرجى كتابة سبب رفض واضح ومفصل (3 أحرف على الأقل)', HTTP_STATUS.BAD_REQUEST);
  }

  deposit.status = 'rejected';
  deposit.rejectionReason = cleanReason;
  deposit.processedOnce = true;
  deposit.processedAt = new Date();
  deposit.processedBy = adminEmail || String(adminId || 'admin');
  await deposit.save();

  // Notify User about deposit rejection
  sendDirectUserNotification(deposit.userId, {
    title: 'تم رفض طلب الإيداع ❌',
    body: `عذراً، تم رفض طلب الإيداع بقيمة ${deposit.amount} ${deposit.sourceCurrency}. السبب: ${cleanReason}`,
    data: {
      type: 'deposit_rejected',
      depositId: String(deposit._id),
      reason: cleanReason,
    },
  }).catch((err) => console.error('[User Deposit Rejected Push Error]:', err.message));

  return {
    ok: true,
    message: 'تم رفض طلب الإيداع وحفظ السبب بنجاح.',
    deposit: deposit.toJSON(),
  };
};

/**
 * Admin: Get all deposit methods
 */
export const getAllMethodsAdmin = async () => {
  await ensureDefaultMethods();
  return await DepositMethod.find().sort({ order: 1, createdAt: 1 });
};

/**
 * Admin: Create custom deposit method
 */
export const createDepositMethod = async (data) => {
  let key = String(data.key || data.title || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^\w]/g, '');

  if (!key) {
    key = `method_${Date.now()}`;
  }

  const existing = await DepositMethod.findOne({ key });
  if (existing) {
    key = `${key}_${Date.now().toString().slice(-4)}`;
  }

  const isCustom = data.currencyType === 'OTHER' || data.isCustomCurrency === true;
  const cleanFields = Array.isArray(data.requiredFields)
    ? data.requiredFields.map((f) => String(f).trim()).filter(Boolean)
    : ['رقم العملية / إشعار التحويل'];

  const method = await DepositMethod.create({
    ...data,
    key,
    requiredFields: cleanFields,
    currencyType: isCustom ? 'OTHER' : (data.currency === 'SYP' ? 'SYP' : 'USD'),
    isCustomCurrency: isCustom,
    currencyUnit: String(data.currencyUnit || '').trim(),
    ratePerUsd: Number(data.ratePerUsd) > 0 ? Number(data.ratePerUsd) : 1,
  });
  return method.toJSON();
};

/**
 * Admin: Update deposit method
 */
export const updateDepositMethod = async (id, data) => {
  const isCustom = data.currencyType === 'OTHER' || data.isCustomCurrency === true;
  const cleanFields = Array.isArray(data.requiredFields)
    ? data.requiredFields.map((f) => String(f).trim()).filter(Boolean)
    : undefined;

  const updatePayload = {
    ...data,
    ...(cleanFields !== undefined ? { requiredFields: cleanFields } : {}),
    ...(data.currencyType ? {
      currencyType: isCustom ? 'OTHER' : (data.currency === 'SYP' ? 'SYP' : 'USD'),
      isCustomCurrency: isCustom,
    } : {}),
    ...(data.currencyUnit !== undefined ? { currencyUnit: String(data.currencyUnit || '').trim() } : {}),
    ...(data.ratePerUsd !== undefined ? { ratePerUsd: Number(data.ratePerUsd) > 0 ? Number(data.ratePerUsd) : 1 } : {}),
  };
  const method = await DepositMethod.findByIdAndUpdate(id, updatePayload, { new: true });
  if (!method) {
    throw new ApiError('طريقة الإيداع غير موجودة', HTTP_STATUS.NOT_FOUND);
  }
  return method.toJSON();
};

/**
 * Admin: Toggle deposit method active/inactive
 */
export const toggleDepositMethod = async (id) => {
  const method = await DepositMethod.findById(id);
  if (!method) {
    throw new ApiError('طريقة الإيداع غير موجودة', HTTP_STATUS.NOT_FOUND);
  }
  method.isEnabled = !method.isEnabled;
  await method.save();
  return method.toJSON();
};

/**
 * Admin: Delete deposit method
 */
export const deleteDepositMethod = async (id) => {
  const method = await DepositMethod.findByIdAndDelete(id);
  if (!method) {
    throw new ApiError('طريقة الإيداع غير موجودة', HTTP_STATUS.NOT_FOUND);
  }
  return { ok: true, message: 'تم حذف طريقة الإيداع بنجاح' };
};
