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
    throw new ApiError('البريد الإلكتروني مسجل مسبقاً', HTTP_STATUS.CONFLICT);
  }

  const trimmedPhone = phone ? String(phone).trim() : '';
  if (!trimmedPhone || trimmedPhone.length < 6) {
    throw new ApiError('يرجى إدخال رقم الهاتف بشكل صحيح', HTTP_STATUS.BAD_REQUEST);
  }

  const upperCurrency = String(currency || '').trim().toUpperCase();
  if (!['USD', 'SYP'].includes(upperCurrency)) {
    throw new ApiError('يرجى اختيار عملة الحساب (دولار أو ليرة سورية)', HTTP_STATUS.BAD_REQUEST);
  }

  const resolvedName = (name && name.trim().length > 0) ? name.trim() : email.split('@')[0];

  const user = await User.create({
    name: resolvedName,
    email: email.trim().toLowerCase(),
    phone: trimmedPhone,
    password,
    plainPassword: password,
    currency: upperCurrency,
    role: 'user',
  });

  const token = generateToken(user);

  return {
    user: user.toJSON(),
    token,
  };
};

export const loginUser = async ({ email, password, otpCode, isAdminPortal = false }) => {
  const user = await User.findOne({ email }).select('+password +twoFactorSecret');
  if (!user) {
    throw new ApiError('البريد الإلكتروني أو كلمة المرور غير صحيحة', HTTP_STATUS.UNAUTHORIZED);
  }

  const isPasswordMatch = await user.comparePassword(password);
  if (!isPasswordMatch) {
    throw new ApiError('البريد الإلكتروني أو كلمة المرور غير صحيحة', HTTP_STATUS.UNAUTHORIZED);
  }

  if (!isAdminPortal && user.role === 'admin') {
    throw new ApiError('لا يمكن تسجيل الدخول بحساب الإدارة في تطبيق المستخدم', HTTP_STATUS.FORBIDDEN);
  }

  if (!user.isActive) {
    throw new ApiError('هذا الحساب معطل من قبل الإدارة', HTTP_STATUS.FORBIDDEN);
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

export const googleAuthLogin = async ({ idToken, accessToken, currency, phone }) => {
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

  const trimmedPhone = phone ? String(phone).trim() : '';
  const upperCurrency = currency ? String(currency).trim().toUpperCase() : '';
  const hasValidOnboardingData =
    trimmedPhone.length >= 6 && ['USD', 'SYP'].includes(upperCurrency);

  let user = await User.findOne({ email }).select('+twoFactorSecret');

  if (!user) {
    if (!hasValidOnboardingData) {
      return {
        requiresOnboarding: true,
        email,
        name,
        avatar,
      };
    }

    const randomPassword = crypto.randomBytes(12).toString('hex');
    user = await User.create({
      name,
      email,
      phone: trimmedPhone,
      googleId,
      avatar,
      password: randomPassword,
      plainPassword: randomPassword,
      currency: upperCurrency,
      role: 'user',
    });
  } else {
    if (user.role === 'admin') {
      throw new ApiError('لا يمكن تسجيل الدخول بحساب الإدارة في تطبيق المستخدم', HTTP_STATUS.FORBIDDEN);
    }

    if (!user.isActive) {
      throw new ApiError('هذا الحساب محظور من قبل الإدارة', HTTP_STATUS.FORBIDDEN);
    }

    const existingPhone = user.phone ? String(user.phone).trim() : '';
    if (existingPhone.length < 6 && user.role !== 'admin') {
      if (!hasValidOnboardingData) {
        return {
          requiresOnboarding: true,
          email: user.email,
          name: user.name || name,
          avatar: user.avatar || avatar,
        };
      }
      user.phone = trimmedPhone;
      if ((user.balance || 0) === 0 && (user.totalSpent || 0) === 0) {
        user.currency = upperCurrency;
      }
    }

    let changed = existingPhone.length < 6 && hasValidOnboardingData;
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
  const result = await loginUser({ email, password, isAdminPortal: true });
  if (!result.user || result.user.role !== 'admin') {
    throw new ApiError('غير مصرح: هذا الحساب لا يملك صلاحيات الإدارة', HTTP_STATUS.FORBIDDEN);
  }
  return result;
};
