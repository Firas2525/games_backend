import jwt from 'jsonwebtoken';
import { User } from '../users/users.model.js';
import { ENV } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';

const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    ENV.JWT_SECRET,
    { expiresIn: ENV.JWT_EXPIRES_IN }
  );
};

export const registerUser = async ({ name, email, password, role }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError('Email is already registered', HTTP_STATUS.CONFLICT);
  }

  const user = await User.create({
    name,
    email,
    password,
    role: role || 'user',
  });

  const token = generateToken(user);

  return {
    user: user.toJSON(),
    token,
  };
};

export const loginUser = async ({ email, password }) => {
  // Need explicitly to select +password because password field is select: false
  const user = await User.findOne({ email }).select('+password');
  if (!user) {
    throw new ApiError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    throw new ApiError('Invalid email or password', HTTP_STATUS.UNAUTHORIZED);
  }

  if (!user.isActive) {
    throw new ApiError('This account has been deactivated', HTTP_STATUS.FORBIDDEN);
  }

  const token = generateToken(user);

  return {
    user: user.toJSON(),
    token,
  };
};

export const adminLogin = async ({ email, password }) => {
  const result = await loginUser({ email, password });
  if (result.user.role !== 'admin') {
    throw new ApiError('Access denied: Administrator privileges required', HTTP_STATUS.FORBIDDEN);
  }
  return result;
};
