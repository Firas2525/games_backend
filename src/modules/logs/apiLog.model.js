import mongoose from 'mongoose';

const apiLogSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['INTERNAL_HTTP', 'PROVIDER_DISPATCH', 'SYSTEM'],
      default: 'INTERNAL_HTTP',
      index: true,
    },
    direction: {
      type: String,
      enum: ['INCOMING', 'OUTGOING'],
      default: 'INCOMING',
      index: true,
    },
    method: {
      type: String,
      default: 'GET',
    },
    endpoint: {
      type: String,
      required: true,
      index: true,
    },
    provider: {
      type: String,
      default: 'internal', // 'roya_usd', 'roya_syp', 'brand1card', 'syria_card', 'internal'
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    userName: {
      type: String,
      default: '',
    },
    userEmail: {
      type: String,
      default: '',
    },
    userRole: {
      type: String,
      default: '',
    },
    orderId: {
      type: String,
      default: '',
      index: true,
    },
    productName: {
      type: String,
      default: '',
    },
    requestHeaders: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    requestBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    queryParams: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    statusCode: {
      type: Number,
      default: 200,
      index: true,
    },
    responseBody: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    durationMs: {
      type: Number,
      default: 0,
    },
    isSuccess: {
      type: Boolean,
      default: true,
      index: true,
    },
    errorMessage: {
      type: String,
      default: '',
    },
    ip: {
      type: String,
      default: '',
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

apiLogSchema.index({ createdAt: -1 });

export const ApiLog = mongoose.model('ApiLog', apiLogSchema);
