import usageService from '../services/usageService.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';
const usageController = { getUsage: asyncHandler(async (req, res) => res.status(200).json({ success: true, data: await usageService.getRemainingFreeMessages(req.user._id) })) };
export default usageController;
