import mongoose from 'mongoose';

const subCategorySchema = new mongoose.Schema(
  {
    mainCategory: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SubCategory',
      default: null,
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

subCategorySchema.index({ isVisible: 1, parentId: 1, mainCategory: 1, sortOrder: 1 });
subCategorySchema.index({ parentId: 1, isVisible: 1 });

export const SubCategory = mongoose.model('SubCategory', subCategorySchema);
