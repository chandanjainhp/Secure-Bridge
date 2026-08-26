import { apiKeyService } from '../services/apiKeyService.js';
import { asyncHandler } from '../../../utils/asyncHandler.js';

// Controller for API key feature
const apiKeyController = {
  // Save or update the user's API key
  saveApiKey: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { provider, key } = req.body;

    if (!provider || !key) {
      return res.status(400).json({ error: 'Provider and key are required' });
    }

    await apiKeyService.saveApiKey(userId, provider, key);
    res.status(200).json({ message: 'API key saved successfully' });
  }),

  // Get the user's API key (returns masked key and boolean hasKey)
  getApiKey: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    const { hasKey, maskedKey } = await apiKeyService.getApiKey(userId);
    res.status(200).json({ hasKey, maskedKey });
  }),

  // Delete the user's API key
  deleteApiKey: asyncHandler(async (req, res) => {
    const userId = req.user._id;
    await apiKeyService.deleteApiKey(userId);
    res.status(200).json({ message: 'API key deleted successfully' });
  }),
};

export default apiKeyController;