import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
  {
    orderId: {
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
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      default: null,
      index: true,
    },
    productName: {
      type: String,
      required: true,
    },
    category: {
      type: String,
      default: '',
    },
    image: {
      type: String,
      default: '',
    },
    targetId: {
      type: String,
      default: '',
    },
    extraFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    source: {
      type: String,
      default: 'custom',
    },
    quantity: {
      type: Number,
      required: true,
      default: 1,
    },
    // Financial details
    costPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    userPrice: {
      type: Number,
      required: true,
      default: 0,
    },
    profit: {
      type: Number,
      required: true,
      default: 0,
    },
    coinsEarned: {
      type: Number,
      default: 0,
    },
    profitPercentage: {
      type: Number,
      default: 0,
    },
    discountPercent: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: '$',
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'],
      default: 'completed',
      index: true,
    },
    providerOrderId: {
      type: String,
      default: '',
    },
    providerPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    refunded: {
      type: Boolean,
      default: false,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    executionDurationSeconds: {
      type: Number,
      default: null,
    },
    executionDurationText: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        ret.price = ret.userPrice ?? 0;
        ret.priceCharged = ret.userPrice ?? 0;
        ret.originalPrice = ret.costPrice ?? 0;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        ret.price = ret.userPrice ?? 0;
        ret.priceCharged = ret.userPrice ?? 0;
        ret.originalPrice = ret.costPrice ?? 0;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// High-performance compound indexes for Admin and User order queries
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ source: 1, createdAt: -1 });
orderSchema.index({ source: 1, status: 1, createdAt: -1 });
orderSchema.index({ providerOrderId: 1 });

export const Order = mongoose.model('Order', orderSchema);
