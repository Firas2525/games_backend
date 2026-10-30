import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { User } from '../users/users.model.js';
import { ENV } from '../../config/env.js';
import { ApiError } from '../../utils/apiError.js';
import { HTTP_STATUS } from '../../constants/httpStatusCodes.js';
import {
  generateBase32Secret,
  verifyTotpToken,
  buildOtpAuthUri,
} from '../../utils/totp.js';

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

const generateTwoFactorTempToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      purpose: '2fa_login',
    },
    ENV.JWT_SECRET,
    { expiresIn: '10m' }
  );
};

export const registerUser = async ({ name, email, phone, password, currency, role }) => {
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ApiError('Email is already registered', HTTP_STATUS.CONFLICT);
  }

  const normalizedCurrency = currency === 'SYP' ? 'SYP' : 'USD';
  const resolvedName = (name && name.trim().length > 0) ? name.trim() : email.split('@')[0];

  const user = await User.create({
    name: resolvedName,
    email: email.trim().toLowerCase(),
    phone: phone ? phone.trim() : '',
    password,
    plainPassword: password,
    currency: normalizedCurrency,
    role: role || 'user',
  });

  const token = generateToken(user);

  return {
    user: user.toJSON(),
    token,
  };
};

export const loginUser = async ({ email, password, otpCode }) => {
  const user = await User.findOne({ email }).select('+password +twoFactorSecret');
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

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    if (!otpCode) {
      return {
        requiresTwoFactor: true,
        tempToken: generateTwoFactorTempToken(user),
        email: user.email,
      };
    }

    const valid = verifyTotpToken(user.twoFactorSecret, otpCode);
    if (!valid) {
      throw new ApiError('رمز المصادقة الثنائية (Google Authenticator) غير صحيح', HTTP_STATUS.UNAUTHORIZED);
    }
  }

  const token = generateToken(user);

  return {
    user: user.toJSON(),
    token,
  };
};

export const verifyTwoFactorLogin = async ({ tempToken, code }) => {
  if (!tempToken || !code) {
    throw new ApiError('يرجى إدخال رمز التحقق المكون من 6 أرقام', HTTP_STATUS.BAD_REQUEST);
  }

  let decoded;
  try {
    decoded = jwt.verify(tempToken, ENV.JWT_SECRET);
  } catch (_) {
    throw new ApiError('انتهت صلاحية الجلسة، يرجى تسجيل الدخول من جديد', HTTP_STATUS.UNAUTHORIZED);
  }

  if (decoded.purpose !== '2fa_login') {
    throw new ApiError('جلسة تحقق غير صالحة', HTTP_STATUS.UNAUTHORIZED);
  }

  const user = await User.findById(decoded.id).select('+twoFactorSecret');
  if (!user || !user.isActive) {
    throw new ApiError('المستخدم غير موجود أو الحساب معطل', HTTP_STATUS.UNAUTHORIZED);
  }

  const isValid = verifyTotpToken(user.twoFactorSecret, code);
  if (!isValid) {
    throw new ApiError('رمز Google Authenticator غير صحيح أو منتهي الصلاحية', HTTP_STATUS.UNAUTHORIZED);
  }

  const token = generateToken(user);
  return {
    user: user.toJSON(),
    token,
  };
};

export const googleAuthLogin = async ({ idToken, accessToken, currency }) => {
  let googlePayload = null;

  if (idToken) {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (res.ok) {
      googlePayload = await res.json();
    }
  }

  if (!googlePayload && accessToken) {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (res.ok) {
      googlePayload = await res.json();
    }
  }

  if (!googlePayload || !googlePayload.email) {
    throw new ApiError('فشل التحقق من حساب Google، يرجى المحاولة مرة أخرى', HTTP_STATUS.UNAUTHORIZED);
  }

  const email = String(googlePayload.email).trim().toLowerCase();
  const googleId = String(googlePayload.sub || '');
  const name = googlePayload.name || email.split('@')[0];
  const avatar = googlePayload.picture || '';

  let user = await User.findOne({ email }).select('+twoFactorSecret');

  if (!user) {
    const randomPassword = crypto.randomBytes(12).toString('hex');
    const normalizedCurrency = currency === 'SYP' ? 'SYP' : 'USD';
    user = await User.create({
      name,
      email,
      googleId,
      avatar,
      password: randomPassword,
      plainPassword: randomPassword,
      currency: normalizedCurrency,
      role: 'user',
    });
  } else {
    if (!user.isActive) {
      throw new ApiError('هذا الحساب محظور من قبل الإدارة', HTTP_STATUS.FORBIDDEN);
    }
    let changed = false;
    if (googleId && !user.googleId) {
      user.googleId = googleId;
      changed = true;
    }
    if (avatar && !user.avatar) {
      user.avatar = avatar;
      changed = true;
    }
    if (changed) {
      await user.save();
    }
  }

  if (user.twoFactorEnabled && user.twoFactorSecret) {
    return {
      requiresTwoFactor: true,
      tempToken: generateTwoFactorTempToken(user),
      email: user.email,
    };
  }

  const token = generateToken(user);
  return {
    user: user.toJSON(),
    token,
  };
};

export const setupTwoFactor = async (userId) => {
  const user = await User.findById(userId).select('+twoFactorSecret +twoFactorTempSecret');
  if (!user) {
    throw new ApiError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  const secret = generateBase32Secret(20);
  user.twoFactorTempSecret = secret;
  await user.save();

  const otpauthUrl = buildOtpAuthUri({
    secret,
    email: user.email,
    issuer: 'GamesStore',
  });

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(otpauthUrl)}`;

  return {
    secret,
    otpauthUrl,
    qrImageUrl,
  };
};

export const enableTwoFactor = async (userId, code) => {
  const user = await User.findById(userId).select('+twoFactorSecret +twoFactorTempSecret');
  if (!user) {
    throw new ApiError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  const candidateSecret = user.twoFactorTempSecret || user.twoFactorSecret;
  if (!candidateSecret) {
    throw new ApiError('يرجى بدء إعداد المصادقة الثنائية أولاً', HTTP_STATUS.BAD_REQUEST);
  }

  const isValid = verifyTotpToken(candidateSecret, code);
  if (!isValid) {
    throw new ApiError('الرمز المدخل غير صحيح، تأكد من تطبيق Google Authenticator', HTTP_STATUS.BAD_REQUEST);
  }

  user.twoFactorSecret = candidateSecret;
  user.twoFactorTempSecret = '';
  user.twoFactorEnabled = true;
  await user.save();

  return {
    user: user.toJSON(),
  };
};

export const disableTwoFactor = async (userId, code) => {
  const user = await User.findById(userId).select('+twoFactorSecret +twoFactorTempSecret');
  if (!user) {
    throw new ApiError('User not found', HTTP_STATUS.NOT_FOUND);
  }

  if (!user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new ApiError('المصادقة الثنائية غير مفعلة حالياً', HTTP_STATUS.BAD_REQUEST);
  }

  const isValid = verifyTotpToken(user.twoFactorSecret, code);
  if (!isValid) {
    throw new ApiError('رمز Google Authenticator غير صحيح، تعذر إيقاف المصادقة الثنائية', HTTP_STATUS.BAD_REQUEST);
  }

  user.twoFactorEnabled = false;
  user.twoFactorSecret = '';
  user.twoFactorTempSecret = '';
  await user.save();

  return {
    user: user.toJSON(),
  };
};

export const adminLogin = async ({ email, password }) => {
  const result = await loginUser({ email, password });
  if (result.user.role !== 'admin') {
    throw new ApiError('Access denied: Administrator privileges required', HTTP_STATUS.FORBIDDEN);
  }
  return result;
};
