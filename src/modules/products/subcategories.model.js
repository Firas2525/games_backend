import mongoose from 'mongoose';

const subCategorySchema = new mongoose.Schema(
  {
    mainCategory: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isVisible: {
      type: Boolean,
      default: true,
      index: true,
    },
    profitPercentage: {
      type: Number,
      default: null,
      min: 0,
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

export const SubCategory = mongoose.model('SubCategory', subCategorySchema);
