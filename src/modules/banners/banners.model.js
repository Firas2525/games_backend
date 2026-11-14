import mongoose from 'mongoose';

const bannerSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: [true, 'Image URL is required'],
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    link: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    placement: {
      type: String,
      enum: ['home', 'category', 'all'],
      default: 'home',
      index: true,
    },
    categoryKey: {
      type: String,
      default: '',
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

bannerSchema.index({ isActive: 1, placement: 1, categoryKey: 1, order: 1 });

export const Banner = mongoose.model('Banner', bannerSchema);

const bannerImageSchema = new mongoose.Schema(
  {
    data: {
      type: Buffer,
      required: false,
      default: null,
    },
    contentType: {
      type: String,
      default: 'image/jpeg',
    },
    secureUrl: {
      type: String,
      default: '',
      trim: true,
    },
    publicId: {
      type: String,
      default: '',
      trim: true,
    },
    format: {
      type: String,
      default: '',
    },
    bytes: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export const BannerImage = mongoose.model('BannerImage', bannerImageSchema);
