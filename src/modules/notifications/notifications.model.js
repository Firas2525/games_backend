import mongoose from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'عنوان الإشعار مطلوب'],
      trim: true,
      maxlength: 150,
    },
    description: {
      type: String,
      required: [true, 'نص الإشعار مطلوب'],
      trim: true,
      maxlength: 1000,
    },
    type: {
      type: String,
      enum: ['broadcast', 'system', 'promo', 'order'],
      default: 'broadcast',
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Notification = mongoose.model('Notification', notificationSchema);
