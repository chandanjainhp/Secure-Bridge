import usageService from '../services/usageService.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

const usageController = {
  // Get the user's usage (free messages used and remaining)
  getUsage: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const usage = await usageService.getUsage(userId);
    const limit = 10;
    const used = usage.freeMessagesUsed;
    const remaining = Math.max(0, limit - used);
    res.status(200).json({ used, remaining, limit });
  }),
};

export default usageController;