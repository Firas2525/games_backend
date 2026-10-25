import mongoose from 'mongoose';

const depositSchema = new mongoose.Schema(
  {
    depositId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    userName: {
      type: String,
      default: '',
      trim: true,
    },
    methodKey: {
      type: String,
      required: true,
      trim: true,
    },
    methodTitle: {
      type: String,
      required: true,
      trim: true,
    },
    account: {
      type: String,
      default: '',
    },
    address: {
      type: String,
      default: '',
    },
    amount: {
      type: Number,
      required: true,
      min: [0.0001, 'المبلغ يجب أن يكون أكبر من صفر'],
    },
    netAmount: {
      type: Number,
      required: true,
      min: [0.0001, 'المبلغ الصافي غير صحيح'],
    },
    feePercent: {
      type: Number,
      default: 0,
    },
    feeAmount: {
      type: Number,
      default: 0,
    },
    sourceCurrency: {
      type: String,
      enum: ['USD', 'SYP'],
      default: 'USD',
    },
    creditCurrency: {
      type: String,
      enum: ['USD', 'SYP'],
      default: 'USD',
    },
    exchangeRate: {
      type: Number,
      default: 1,
    },
    operationNumber: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    note: {
      type: String,
      default: '',
      trim: true,
    },
    receiptImage: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'rejected'],
      default: 'pending',
      index: true,
    },
    processedOnce: {
      type: Boolean,
      default: false,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    processedBy: {
      type: String,
      default: '',
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
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

export const Deposit = mongoose.model('Deposit', depositSchema);
