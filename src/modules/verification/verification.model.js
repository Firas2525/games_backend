import mongoose from 'mongoose';

const verificationRequestSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
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
    userCode: {
      type: String,
      default: '',
      trim: true,
    },
    documentUrl: {
      type: String,
      default: '',
      trim: true,
    },
    fieldsData: {
      type: Map,
      of: String,
      default: {},
    },
    notes: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    rejectionReason: {
      type: String,
      default: '',
      trim: true,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    reviewedByName: {
      type: String,
      default: '',
    },
    reviewedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

export const VerificationRequest = mongoose.model(
  'VerificationRequest',
  verificationRequestSchema
);

