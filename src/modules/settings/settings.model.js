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
      type: [mongoose.Schema.Types.Mixed],
      default: [
        { id: 'full_name', name: 'الاسم الثلاثي', type: 'text', required: true }
      ],
    },
    whatsappSupport: {
      type: String,
      default: '',
      trim: true,
    },
    telegramChannel: {
      type: String,
      default: '',
      trim: true,
    },
    cashbackPercentage: {
      type: Number,
      default: 100, // 100% = 1 coin per $1 USD
      min: 0,
      max: 10000,
    },
    coinsPerDollar: {
      type: Number,
      default: 100, // 100 coins = $1 USD
      min: 1,
    },
    isCashbackActive: {
      type: Boolean,
      default: true,
    },
    isMaintenance: {
      type: Boolean,
      default: false,
    },
    maintenanceTitle: {
      type: String,
      default: 'أعمال صيانة وتحديث',
      trim: true,
    },
    maintenanceMessage: {
      type: String,
      default: 'نقوم حالياً ببعض أعمال الصيانة والتحسينات الدورية لنقدم لكم تجربة أفضل وأسرع. سنعود للعمل قريباً جداً، نشكر تفهمكم!',
      trim: true,
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
