import { User } from './users.model.js';
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
