import mongoose from 'mongoose';

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    adminId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    type: {
      type: String,
      enum: ['deposit', 'deduction', 'purchase', 'refund', 'deposit_request'],
      required: true,
    },
    currency: {
      type: String,
      enum: ['USD', 'SYP'],
      default: 'USD',
    },
    amount: {
      type: Number,
      required: true,
      min: [0.0001, 'Amount must be greater than zero'],
    },
    costPrice: {
      type: Number,
      default: 0,
    },
    profit: {
      type: Number,
      default: 0,
    },
    productName: {
      type: String,
      default: '',
      trim: true,
    },
    targetId: {
      type: String,
      default: '',
      trim: true,
    },
    orderId: {
      type: String,
      default: '',
      trim: true,
    },
    previousBalance: {
      type: Number,
      required: true,
    },
    newBalance: {
      type: Number,
      required: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
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

export const Transaction = mongoose.model('Transaction', transactionSchema);
