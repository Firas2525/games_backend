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

export const Order = mongoose.model('Order', orderSchema);
