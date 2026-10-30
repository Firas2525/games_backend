import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { ROLES, ALL_ROLES } from '../../constants/roles.js';
import { calculateLevelInfo, LEVELS } from '../../constants/levels.js';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxlength: [50, 'Name must not exceed 50 characters'],
      default: function () {
        return this.email ? this.email.split('@')[0] : 'User';
      },
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address'],
    },
    phone: {
      type: String,
      default: '',
      trim: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default in queries
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: ROLES.USER,
    },
    currency: {
      type: String,
      enum: ['USD', 'SYP'],
      default: 'USD',
      immutable: true, // Currency cannot be changed after account creation
    },
    avatar: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    balance: {
      type: Number,
      default: 0,
      min: [0, 'Balance cannot be negative'],
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    totalDeposited: {
      type: Number,
      default: 0,
    },
    totalProfit: {
      type: Number,
      default: 0,
    },
    userCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      trim: true,
    },
    plainPassword: {
      type: String,
      default: '',
      trim: true,
    },
    manualLevel: {
      type: String,
      enum: ['auto', 'bronze', 'silver', 'gold', 'diamond', 'vip'],
      default: 'auto',
    },
    googleId: {
      type: String,
      default: '',
      trim: true,
    },
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      default: '',
      select: false,
    },
    twoFactorTempSecret: {
      type: String,
      default: '',
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        ret.userCode = ret.userCode || (ret._id ? ret._id.toString().slice(-6) : '');
        ret.twoFactorEnabled = Boolean(ret.twoFactorEnabled);
        const levelData = calculateLevelInfo(ret.totalSpent || 0, ret.manualLevel || 'auto');
        Object.assign(ret, levelData);
        delete ret._id;
        delete ret.__v;
        delete ret.password;
        delete ret.twoFactorSecret;
        delete ret.twoFactorTempSecret;
        return ret;
      },
    },
  }
);

// Hash password and assign short userCode before saving
userSchema.pre('save', async function () {
  // 1. Assign unique 6-digit user code if not present
  if (!this.userCode) {
    let isUnique = false;
    let code = '';
    let attempts = 0;
    while (!isUnique && attempts < 30) {
      attempts++;
      code = Math.floor(100000 + Math.random() * 900000).toString();
      const existing = await mongoose.model('User').findOne({ userCode: code }).select('_id');
      if (!existing) {
        isUnique = true;
      }
    }
    this.userCode = isUnique ? code : Math.floor(1000000 + Math.random() * 9000000).toString();
  }

  // 2. Hash password if modified
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

export const User = mongoose.model('User', userSchema);
