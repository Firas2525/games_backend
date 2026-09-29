import { User } from './users.model.js';
import { Transaction } from './transactions.model.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

export const getAllUsers = async (query = {}) => {
  const filter = {};
  if (query.role) filter.role = query.role;
  return await User.find(filter).sort({ createdAt: -1 });
};

export const getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) {
    throw new ApiError('User not found', HTTP_STATUS.NOT_FOUND);
  }
  return user;
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
