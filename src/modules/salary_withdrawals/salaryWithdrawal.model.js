import mongoose from 'mongoose';

const salaryServiceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الخدمة أو اللعبة مطلوب'],
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    requiredFields: [
      {
        type: String,
        trim: true,
      },
    ],
    minQuantity: {
      type: Number,
      default: 1,
      min: [1, 'أقل كمية يجب أن تكون 1 على الأقل'],
    },
    maxQuantity: {
      type: Number,
      default: 10000,
      min: [1, 'أكبر كمية يجب أن تكون أكبر من أو تساوي 1'],
    },
    unitName: {
      type: String,
      default: 'كمية',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const salaryWithdrawalRequestSchema = new mongoose.Schema(
  {
    requestId: {
      type: String,
      unique: true,
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    userName: {
      type: String,
      default: '',
      trim: true,
    },
    userEmail: {
      type: String,
      default: '',
      trim: true,
    },
    userPhone: {
      type: String,
      default: '',
      trim: true,
    },
    userDisplayId: {
      type: String,
      default: '',
      trim: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalaryService',
      required: true,
    },
    serviceName: {
      type: String,
      required: true,
      trim: true,
    },
    serviceImage: {
      type: String,
      default: '',
      trim: true,
    },
    quantity: {
      type: Number,
      required: [true, 'الكمية مطلوبة'],
      min: [1, 'الكمية يجب أن تكون 1 على الأقل'],
    },
    fieldsData: {
      type: Map,
      of: String,
      default: {},
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    adminNotes: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

export const SalaryService = mongoose.model('SalaryService', salaryServiceSchema);
export const SalaryWithdrawalRequest = mongoose.model(
  'SalaryWithdrawalRequest',
  salaryWithdrawalRequestSchema
);

