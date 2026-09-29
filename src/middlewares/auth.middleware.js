import jwt from 'jsonwebtoken';
import { ENV } from '../config/env.js';
import { ApiError } from '../utils/apiError.js';
import { HTTP_STATUS } from '../constants/httpStatusCodes.js';
import { User } from '../modules/users/users.model.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('Authorization token is missing', HTTP_STATUS.UNAUTHORIZED);
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, ENV.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      throw new ApiError('User not found or account is deactivated', HTTP_STATUS.UNAUTHORIZED);
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

export const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Unauthenticated', HTTP_STATUS.UNAUTHORIZED));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new ApiError(
          'Forbidden: You do not have permission to access this resource',
          HTTP_STATUS.FORBIDDEN
        )
      );
    }

    next();
  };
};
