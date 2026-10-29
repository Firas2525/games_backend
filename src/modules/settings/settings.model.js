import mongoose from 'mongoose';

const settingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: 'system_settings',
    },
    profitPercentage: {
      type: Number,
      default: 0,
      min: 0,
    },
    tickerText: {
      type: String,
      default: 'أهلاً بكم في متجر الألعاب! شحن فوري وآلي لكافة الألعاب والبطاقات الرقمية على مدار الساعة.',
      trim: true,
    },
    isTickerActive: {
      type: Boolean,
      default: true,
    },
    exchangeRateUsdToSyp: {
      type: Number,
      default: 15000,
      min: 1,
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

export const Settings = mongoose.model('Settings', settingsSchema);
