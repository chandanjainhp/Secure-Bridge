import mongoose from 'mongoose';

const userUsageSchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    default: () => new mongoose.Types.ObjectId(),
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  freeMessagesUsed: { type: Number, required: true, default: 0, min: 0 },
  promptTokens: { type: Number, default: 0, min: 0 },
  completionTokens: { type: Number, default: 0, min: 0 },
  totalTokens: { type: Number, default: 0, min: 0 },
  resetAt: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true,
  toJSON: {
    virtuals: true,
    transform: (_, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    }
  },
  toObject: {
    virtuals: true,
    transform: (_, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      return ret;
    }
  }
});

// Index for faster lookups by userId
userUsageSchema.index({ userId: 1 }, { unique: true });

const UserUsage = mongoose.model('UserUsage', userUsageSchema);

export default UserUsage;