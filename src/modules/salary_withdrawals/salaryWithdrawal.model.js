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
    // Admin receiver account ID in the external app (e.g. Bigo ID, TikTok ID)
    adminReceiverId: {
      type: String,
      default: '',
      trim: true,
    },
    // Type of withdrawal: 'coins' (points/diamonds/coins) or 'dollars' (direct USD)
    withdrawalType: {
      type: String,
      enum: ['coins', 'dollars'],
      default: 'coins',
    },
    // Coins conversion rate: every [coinsPerUnit] coins = [dollarsPerUnit] USD
    coinsPerUnit: {
      type: Number,
      default: 1000,
      min: [1, 'كمية الكوينزات يجب أن تكون 1 على الأقل'],
    },
    dollarsPerUnit: {
      type: Number,
      default: 1.0,
      min: [0.0001, 'قيمة الدولار يجب أن تكون أكبر من الصفر'],
    },
    // Fee / Commission percentage deducted from withdrawal (e.g. 5% fee)
    feePercentage: {
      type: Number,
      default: 0,
      min: [0, 'نسبة العمولة لا يمكن أن تكون سالبة'],
      max: [100, 'نسبة العمولة لا يمكن أن تتجاوز 100%'],
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
    unitName: {
      type: String,
      default: 'كوينز',
      trim: true,
    },
    adminReceiverId: {
      type: String,
      default: '',
      trim: true,
    },
    withdrawalType: {
      type: String,
      enum: ['coins', 'dollars'],
      default: 'coins',
    },
    coinsPerUnit: {
      type: Number,
      default: 1000,
    },
    dollarsPerUnit: {
      type: Number,
      default: 1.0,
    },
    feePercentage: {
      type: Number,
      default: 0,
    },
    grossDollars: {
      type: Number,
      default: 0,
    },
    feeDollars: {
      type: Number,
      default: 0,
    },
    netDollars: {
      type: Number,
      default: 0,
    },
    exchangeRate: {
      type: Number,
      default: 15000,
    },
    calculatedDollars: {
      type: Number,
      default: 0,
    },
    creditedAmount: {
      type: Number,
      default: 0,
    },
    creditedCurrency: {
      type: String,
      default: 'USD',
    },
    isCredited: {
      type: Boolean,
      default: false,
      index: true,
    },
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      default: null,
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

