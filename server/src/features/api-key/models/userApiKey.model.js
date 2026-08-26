import mongoose from 'mongoose';

const userApiKeySchema = new mongoose.Schema({
  _id: {
    type: mongoose.Schema.Types.ObjectId,
    defaultValue: () => new mongoose.Types.ObjectId(),
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  provider: {
    type: String,
    required: true,
    // Example: 'openai', 'anthropic', etc.
  },
  encryptedKey: {
    type: String,
    required: true,
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
userApiKeySchema.index({ userId: 1 });

const UserApiKey = mongoose.model('UserApiKey', userApiKeySchema);

export default UserApiKey;