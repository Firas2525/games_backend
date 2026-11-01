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
    levelBadges: {
      type: Map,
      of: String,
      default: {},
    },
    verificationRequiredFields: {
      type: [String],
      default: ['الاسم الثلاثي'],
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        if (ret.levelBadges instanceof Map) {
          ret.levelBadges = Object.fromEntries(ret.levelBadges);
        } else if (!ret.levelBadges) {
          ret.levelBadges = {};
        }
        if (!ret.verificationRequiredFields || !Array.isArray(ret.verificationRequiredFields)) {
          ret.verificationRequiredFields = ['الاسم الثلاثي'];
        }
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

export const Settings = mongoose.model('Settings', settingsSchema);
