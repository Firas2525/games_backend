import mongoose from 'mongoose';

const competitionSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: 'active_competition',
      unique: true,
      index: true,
    },
    imageUrl: {
      type: String,
      default: '',
      trim: true,
    },
    title: {
      type: String,
      default: '',
      trim: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: false,
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

export const Competition = mongoose.model('Competition', competitionSchema);
