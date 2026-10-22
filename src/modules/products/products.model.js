import mongoose from 'mongoose';

const requiredFieldSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'Player_ID' },
    label: { type: String, default: 'ايدي اللاعب' },
    type: { type: String, default: 'text' },
    placeholder: { type: String, default: '' },
    required: { type: Boolean, default: true },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    externalId: {
      type: String,
      required: true,
      index: true,
    },
    source: {
      type: String,
      required: true,
      enum: ['roya_usd', 'roya_syp', 'syria_card', 'sw_games', 'auto1card', 'brand1card', 'custom'],
      index: true,
    },
    sourceName: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    category: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    mainCategory: {
      type: String,
      default: 'games',
      trim: true,
      index: true,
    },
    isCategoryOverridden: {
      type: Boolean,
      default: false,
      index: true,
    },
    originalPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    sellingPrice: {
      type: Number,
      default: null, // If null, uses originalPrice
    },
    currency: {
      type: String,
      default: '$',
    },
    image: {
      type: String,
      default: '',
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
      index: true,
    },
    minCount: {
      type: Number,
      default: 1,
    },
    maxCount: {
      type: Number,
      default: null,
    },
    qtyValues: {
      type: [Number],
      default: null,
    },
    requiredFields: [requiredFieldSchema],
    rawPayload: {
      type: mongoose.Schema.Types.Mixed,
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
        delete ret.rawPayload;
        return ret;
      },
    },
  }
);

// Unique compound index: One product per external ID and source
productSchema.index({ source: 1, externalId: 1 }, { unique: true });

export const Product = mongoose.model('Product', productSchema);
