import mongoose from 'mongoose';
import { User } from './users.model.js';
import { Transaction } from './transactions.model.js';
import { Deposit } from '../deposits/deposits.model.js';
import { Order } from '../orders/orders.model.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

export const getAllUsers = async (query = {}) => {
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.search) {
    const s = query.search.trim();
    filter.$or = [
      { name: { $regex: s, $options: 'i' } },
      { email: { $regex: s, $options: 'i' } },
      { phone: { $regex: s, $options: 'i' } },
      { userCode: { $regex: s, $options: 'i' } },
    ];
  }
  return await User.find(filter).sort({ createdAt: -1 });
};

export const getUserById = async (id) => {
  let user;
  if (mongoose.isValidObjectId(id)) {
    user = await User.findById(id);
  }
  if (!user) {
    user = await User.findOne({ userCode: id.toString().trim() });
  }
  if (!user) {
    throw new ApiError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  return user;
};

// Automatic startup migration to ensure all existing users have unique 6-digit userCodes
export const ensureShortUserCodes = async () => {
  try {
    const usersWithoutCode = await User.find({
      $or: [
        { userCode: { $exists: false } },
        { userCode: null },
        { userCode: '' },
      ],
    });

    if (usersWithoutCode.length > 0) {
      console.log(`[Users Migration] Generating 6-digit user codes for ${usersWithoutCode.length} users...`);
      for (const u of usersWithoutCode) {
        let isUnique = false;
        let code = '';
        let attempts = 0;
        while (!isUnique && attempts < 30) {
          attempts++;
          code = Math.floor(100000 + Math.random() * 900000).toString();
          const existing = await User.findOne({ userCode: code }).select('_id');
          if (!existing) {
            isUnique = true;
          }
        }
        u.userCode = isUnique ? code : Math.floor(1000000 + Math.random() * 9000000).toString();
        await u.save();
      }
      console.log(`[Users Migration] Successfully assigned 6-digit user codes.`);
    }
  } catch (err) {
    console.error('[Users Migration] Failed to populate user codes:', err.message);
  }
};

export const toggleUserStatus = async (id) => {
  const user = await getUserById(id);
  user.isActive = !user.isActive;
  await user.save();
  return user;
};

export const updateUserLevel = async (id, manualLevel) => {
  const allowed = ['auto', 'bronze', 'silver', 'gold', 'diamond', 'vip'];
  if (!allowed.includes(manualLevel)) {
    throw new ApiError('Invalid level value. Allowed: auto, bronze, silver, gold, diamond, vip', HTTP_STATUS.BAD_REQUEST);
  }
  const user = await getUserById(id);
  user.manualLevel = manualLevel;
  await user.save();
  return user;
};

export const depositBalance = async ({ userId, amount, note = '', adminId }) => {
  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    throw new ApiError('Amount must be a positive number', HTTP_STATUS.BAD_REQUEST);
  }

  const user = await getUserById(userId);
  const previousBalance = user.balance || 0;
  const newBalance = Number((previousBalance + parsedAmount).toFixed(2));

  user.balance = newBalance;
  user.totalDeposited = Number(((user.totalDeposited || 0) + parsedAmount).toFixed(4));
  await user.save();

  const transaction = await Transaction.create({
    userId: user._id,
    adminId,
    type: 'deposit',
    amount: parsedAmount,
    currency: user.currency || 'USD',
    previousBalance,
    newBalance,
    note,
  });

  return {
    user: user.toJSON(),
    transaction: transaction.toJSON(),
  };
};

export const deductBalance = async ({ userId, amount, note = '', adminId }) => {
  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    throw new ApiError('Amount must be a positive number', HTTP_STATUS.BAD_REQUEST);
  }

  const user = await getUserById(userId);
  const previousBalance = user.balance || 0;

  if (previousBalance < parsedAmount) {
    throw new ApiError(
      `Insufficient balance. User balance is ${previousBalance}, cannot deduct ${parsedAmount}`,
      HTTP_STATUS.BAD_REQUEST
    );
  }

  const newBalance = Number((previousBalance - parsedAmount).toFixed(2));

  user.balance = newBalance;
  await user.save();

  const transaction = await Transaction.create({
    userId: user._id,
    adminId,
    type: 'deduction',
    amount: parsedAmount,
    currency: user.currency || 'USD',
    previousBalance,
    newBalance,
    note,
  });

  return {
    user: user.toJSON(),
    transaction: transaction.toJSON(),
  };
};

export const getUserTransactions = async (userId) => {
  return await Transaction.find({ userId, type: { $ne: 'deposit_request' } })
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 });
};

export const getAllTransactions = async (query = {}) => {
  // Purge any lingering legacy unapproved deposit_request entries from Transaction ledger
  try {
    await Transaction.deleteMany({ type: 'deposit_request' });
  } catch (_) {}

  const filter = { type: { $ne: 'deposit_request' } };
  if (query.type && query.type !== 'all') {
    filter.type = query.type;
  }
  return await Transaction.find(filter)
    .populate('userId', 'name email avatar')
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 });
};

export const updateUserPassword = async (userId, newPassword) => {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    throw new ApiError('Password must be at least 6 characters', HTTP_STATUS.BAD_REQUEST);
  }

  const user = await getUserById(userId);
  user.password = newPassword.trim();
  user.plainPassword = newPassword.trim();
  await user.save();

  return user.toJSON();
};

/**
  * Calculate and retrieve user financial summary:
  * - Total deposits (sum of accepted deposits + manual deposits)
  * - Total spent / purchases (sum of purchases)
  * - Current available balance
  * - Count of operations
  */
export const getUserFinancialSummary = async (userId) => {
  const uid = mongoose.isValidObjectId(userId) ? new mongoose.Types.ObjectId(userId) : userId;
  const user = await User.findById(uid);
  if (!user) {
    throw new ApiError('المستخدم غير موجود', HTTP_STATUS.NOT_FOUND);
  }

  // 1. Calculate total accepted deposits & counts from Deposit collection
  const depositStats = await Deposit.aggregate([
    { $match: { userId: uid } },
    {
      $group: {
        _id: '$status',
        total: { $sum: '$netAmount' },
        count: { $sum: 1 },
      },
    },
  ]);

  let depositAcceptedTotal = 0;
  let pendingCount = 0;
  let acceptedCount = 0;
  let rejectedCount = 0;

  for (const s of depositStats) {
    if (s._id === 'accepted') {
      depositAcceptedTotal = s.total || 0;
      acceptedCount = s.count || 0;
    } else if (s._id === 'pending') {
      pendingCount = s.count || 0;
    } else if (s._id === 'rejected') {
      rejectedCount = s.count || 0;
    }
  }

  // 2. Also check Transaction collection for all deposit transactions
  const txDepositAgg = await Transaction.aggregate([
    { $match: { userId: uid, type: 'deposit' } },
    { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  const txDepositTotal = txDepositAgg[0]?.total || 0;

  // Total deposited is maximum of tracked user field, deposits aggregate, or transaction aggregate
  const totalDeposited = Number(
    Math.max(user.totalDeposited || 0, depositAcceptedTotal, txDepositTotal).toFixed(2)
  );

  // 3. Calculate total spent / purchases from Order collection
  const orderSpentAgg = await Order.aggregate([
    {
      $match: {
        userId: uid,
        status: { $in: ['completed', 'pending', 'processing'] },
        refunded: { $ne: true },
      },
    },
    { $group: { _id: null, total: { $sum: '$userPrice' }, count: { $sum: 1 } } },
  ]);
  const orderSpentTotal = orderSpentAgg[0]?.total || 0;

  // Total spent / purchases is max of user.totalSpent and orders aggregation
  const totalSpent = Number(Math.max(user.totalSpent || 0, orderSpentTotal).toFixed(2));

  return {
    balance: Number((user.balance || 0).toFixed(2)),
    currency: user.currency || 'USD',
    totalDeposited,
    totalSpent,
    totalOrders: orderSpentAgg[0]?.count || 0,
    depositsCount: {
      total: pendingCount + acceptedCount + rejectedCount,
      accepted: acceptedCount,
      pending: pendingCount,
      rejected: rejectedCount,
    },
  };
};



