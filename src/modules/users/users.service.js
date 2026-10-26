import mongoose from 'mongoose';
import { User } from './users.model.js';
import { Transaction } from './transactions.model.js';
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

export const depositBalance = async ({ userId, amount, note = '', adminId }) => {
  const parsedAmount = Number(amount);
  if (!parsedAmount || parsedAmount <= 0) {
    throw new ApiError('Amount must be a positive number', HTTP_STATUS.BAD_REQUEST);
  }

  const user = await getUserById(userId);
  const previousBalance = user.balance || 0;
  const newBalance = Number((previousBalance + parsedAmount).toFixed(2));

  user.balance = newBalance;
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
  return await Transaction.find({ userId })
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 });
};

export const getAllTransactions = async (query = {}) => {
  const filter = {};
  if (query.type) filter.type = query.type;
  return await Transaction.find(filter)
    .populate('userId', 'name email avatar')
    .populate('adminId', 'name email')
    .sort({ createdAt: -1 });
};

