import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    subtitle: {
      type: String,
      default: '',
      trim: true,
    },
    icon: {
      type: String,
      default: 'grid_view_rounded',
      trim: true,
    },
    color: {
      type: String,
      default: '#6366F1',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    isCustom: {
      type: Boolean,
      default: true,
    },
    isVisible: {
      type: Boolean,
      default: true,
      index: true,
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

export const Category = mongoose.model('Category', categorySchema);
