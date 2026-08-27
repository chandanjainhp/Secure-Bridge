import UserUsage from '../models/userUsage.model.js';

const FREE_MESSAGE_LIMIT = Number(process.env.FREE_MESSAGE_LIMIT || 10);
const usageService = {
  async getUsage(userId) {
    return UserUsage.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, freeMessagesUsed: 0 } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
  },
  async consumeFreeMessage(userId) {
    const usage = await this.getUsage(userId);
    const updated = await UserUsage.findOneAndUpdate(
      { userId, freeMessagesUsed: { $lt: FREE_MESSAGE_LIMIT } },
      { $inc: { freeMessagesUsed: 1 } },
      { new: true },
    );
    if (!updated) {
      const error = new Error('Free message limit reached. Add a BYOK API key for continued chat.');
      error.statusCode = 429;
      error.data = { used: usage.freeMessagesUsed, remaining: 0, limit: FREE_MESSAGE_LIMIT };
      throw error;
    }
    return updated;
  },
  async recordTokens(userId, usage = {}) {
    return UserUsage.findOneAndUpdate({ userId }, { $inc: { promptTokens: usage.promptTokens || 0, completionTokens: usage.completionTokens || 0, totalTokens: usage.totalTokens || 0 } }, { new: true, upsert: true, setDefaultsOnInsert: true });
  },
  async resetUsage(userId) { return UserUsage.findOneAndUpdate({ userId }, { $set: { freeMessagesUsed: 0, resetAt: new Date() } }, { new: true, upsert: true, setDefaultsOnInsert: true }); },
  async getRemainingFreeMessages(userId) { const usage = await this.getUsage(userId); return { used: usage.freeMessagesUsed, remaining: Math.max(0, FREE_MESSAGE_LIMIT - usage.freeMessagesUsed), limit: FREE_MESSAGE_LIMIT }; },
};
export { FREE_MESSAGE_LIMIT };
export default usageService;
