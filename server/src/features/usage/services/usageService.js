import UserUsage from '../models/userUsage.model.js';

const usageService = {
  // Get the user's usage record, create if not exists
  async getUsage(userId) {
    let usage = await UserUsage.findOne({ userId });
    if (!usage) {
      usage = await UserUsage.create({
        userId,
        freeMessagesUsed: 0,
      });
    }
    return usage;
  },

  // Increment the free message count by 1
  async incrementUsage(userId) {
    const usage = await this.getUsage(userId);
    usage.freeMessagesUsed += 1;
    await usage.save();
    return usage;
  },

  // Reset the free message count (for monthly reset, if needed)
  async resetUsage(userId) {
    const usage = await this.getUsage(userId);
    usage.freeMessagesUsed = 0;
    usage.resetAt = new Date();
    await usage.save();
    return usage;
  },

  // Get the remaining free messages (assuming a limit of 10)
  getRemainingFreeMessages(userId) {
    // This is a helper function that can be used without saving
    return async () => {
      const usage = await this.getUsage(userId);
      const limit = 10;
      const used = usage.freeMessagesUsed;
      const remaining = Math.max(0, limit - used);
      return { used, remaining, limit };
    };
  },
};

export default usageService;