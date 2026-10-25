import mongoose from 'mongoose';

const depositMethodSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    iconKey: {
      type: String,
      default: 'card',
      trim: true,
    },
    iconUrl: {
      type: String,
      default: '',
    },
    currency: {
      type: String,
      enum: ['USD', 'SYP'],
      default: 'USD',
    },
    account: {
      type: String,
      default: '',
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    fee: {
      type: Number,
      default: 0,
      min: 0,
    },
    minDeposit: {
      type: Number,
      default: 1,
      min: 0,
    },
    maxDeposit: {
      type: Number,
      default: 100000,
      min: 0,
    },
    exchangeRate: {
      type: Number,
      default: 1,
    },
    instructions: {
      type: String,
      default: '',
      trim: true,
    },
    badge: {
      type: String,
      default: '',
      trim: true,
    },
    color: {
      type: String,
      default: '#F59E0B',
    },
    isEnabled: {
      type: Boolean,
      default: true,
    },
    requiresReceiptImage: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const DepositMethod = mongoose.model('DepositMethod', depositMethodSchema);
