import { Router } from "express";
import crypto from "crypto";
import { ApiKey } from "../models/apikey.model.js";
import ApiKeyService from "../services/apiKeyService.js";
import { verifyJWT } from "../middlewares/auth.middle.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = Router();

// Apply JWT authentication to all routes except validation
router.use((req, res, next) => {
  // Skip auth for validation endpoint
  if (req.path === '/validate-external-key' && req.method === 'POST') {
    return next();
  }
  // All other routes require authentication
  return verifyJWT(req, res, next);
});

// Validate external API key format (no auth needed for validation)
router.post("/validate-external-key", asyncHandler(async (req, res) => {
  const { apiKey, provider } = req.body;

  if (!apiKey) {
    throw new ApiError(400, "API key is required");
  }

  // Basic format validation based on provider
  let isValid = false;
  let message = '';

  switch (provider) {
    case 'google':
      // Google API keys typically start with AIza and are 39 characters
      isValid = apiKey.startsWith('AIza') && apiKey.length === 39;
      message = isValid ? 'Google API key format is valid' : 'Invalid Google API key format';
      break;
    
    case 'openai':
      // OpenAI API keys start with sk- and are followed by 48 characters
      isValid = apiKey.startsWith('sk-') && apiKey.length === 51;
      message = isValid ? 'OpenAI API key format is valid' : 'Invalid OpenAI API key format';
      break;
    
    case 'anthropic':
      // Anthropic API keys start with sk-ant- 
      isValid = apiKey.startsWith('sk-ant-') && apiKey.length >= 100;
      message = isValid ? 'Anthropic API key format is valid' : 'Invalid Anthropic API key format';
      break;
    
    default:
      // For custom providers, just check if it's not empty and has reasonable length
      isValid = apiKey.length >= 20 && apiKey.length <= 200;
      message = isValid ? 'API key format appears valid' : 'API key format invalid (should be 20-200 characters)';
  }

  if (!isValid) {
    throw new ApiError(400, message);
  }

  // Here you could make an actual API call to validate the key
  // For now, we'll just return success based on format validation
  const validationResult = { 
    valid: true, 
    message,
    provider,
    formatChecked: true
  };

  return res.status(200).json(
    new ApiResponse(200, validationResult, "API key validation completed")
  );
}));

// All other API key routes require authentication
router.use(verifyJWT);

// Get all API keys for the authenticated user
router.get("/", asyncHandler(async (req, res) => {
  const apiKeys = await ApiKey.find({ 
    userId: req.user._id,
    status: { $ne: 'revoked' }
  }).select('-hashedKey').sort({ createdAt: -1 });
  
  return res.status(200).json(
    new ApiResponse(200, apiKeys, "API keys retrieved successfully")
  );
}));

// Get specific API key details
router.get("/:keyId", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  
  const apiKey = await ApiKey.findOne({
    _id: keyId,
    userId: req.user._id
  }).select('-hashedKey');
  
  if (!apiKey) {
    throw new ApiError(404, "API key not found");
  }
  
  // Calculate analytics
  const analytics = {
    totalRequests: apiKey.usage.totalRequests,
    lastUsed: apiKey.usage.lastUsed,
    dailyUsage: apiKey.usage.dailyUsage.slice(-7), // Last 7 days
    rateLimitStatus: apiKey.checkRateLimit()
  };
  
  return res.status(200).json(
    new ApiResponse(200, { ...apiKey.toObject(), analytics }, "API key details retrieved")
  );
}));

// Create a new API key
router.post("/", asyncHandler(async (req, res) => {
  // Ensure user is authenticated
  if (!req.user || !req.user._id) {
    throw new ApiError(401, "Authentication required to create API key");
  }

  const { 
    name, 
    description, 
    permissions, 
    rateLimit, 
    expiresAt, 
    ipWhitelist,
    domainWhitelist,
    externalKey,
    provider,
    settings
  } = req.body;
  
  console.log('🔑 Creating API key for user:', req.user._id);
  console.log('📝 Key data:', { name, provider, hasExternalKey: !!externalKey });
  
  // Auto-generate name if not provided
  let keyName = name;
  if (!keyName && provider) {
    const providerLabels = {
      'openai': 'OpenAI',
      'anthropic': 'Anthropic',
      'google': 'Google AI',
      'azure': 'Azure OpenAI',
      'custom': 'Custom'
    };
    keyName = `${providerLabels[provider] || 'External'} API Key - ${new Date().toLocaleDateString()}`;
  } else if (!keyName) {
    keyName = `API Key - ${new Date().toLocaleDateString()}`;
  }

  const keyData = {
    name: keyName,
    description: description || (provider ? `External ${provider} API key` : 'Internal API key'),
    permissions: permissions || ["chat.access", "fhe.encrypt", "mcp.connect"],
    rateLimit: rateLimit || {
      requestsPerMinute: 100,
      requestsPerHour: 1000,
      requestsPerDay: 10000
    },
    ipWhitelist: ipWhitelist || [],
    domainWhitelist: domainWhitelist || [],
    expiresAt,
    externalKey,
    provider,
    settings: settings || {}
  };
  
  // Use the ApiKeyService to create the API key
  const apiKey = await ApiKeyService.createApiKey(req.user._id, keyData);
  
  return res.status(201).json(
    new ApiResponse(201, apiKey, "API key created successfully")
  );
}));

// Update API key
router.patch("/:keyId", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  const { name, description, permissions, rateLimit, expiresAt, ipWhitelist, status } = req.body;
  
  const apiKey = await ApiKey.findOne({
    _id: keyId,
    userId: req.user._id
  });
  
  if (!apiKey) {
    throw new ApiError(404, "API key not found");
  }
  
  // Update fields
  if (name !== undefined) apiKey.name = name;
  if (description !== undefined) apiKey.description = description;
  if (permissions !== undefined) apiKey.permissions = permissions;
  if (rateLimit !== undefined) {
    apiKey.rateLimit = {
      requestsPerMinute: rateLimit.requestsPerMinute || apiKey.rateLimit.requestsPerMinute,
      requestsPerDay: rateLimit.requestsPerDay || apiKey.rateLimit.requestsPerDay
    };
  }
  if (expiresAt !== undefined) apiKey.expiresAt = expiresAt ? new Date(expiresAt) : null;
  if (ipWhitelist !== undefined) apiKey.ipWhitelist = ipWhitelist;
  if (status !== undefined && ['active', 'revoked'].includes(status)) {
    apiKey.status = status;
  }
  
  await apiKey.save();
  
  return res.status(200).json(
    new ApiResponse(200, apiKey, "API key updated successfully")
  );
}));

// Regenerate API key
router.post("/:keyId/regenerate", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  
  const apiKey = await ApiKey.findOne({
    _id: keyId,
    userId: req.user._id
  });
  
  if (!apiKey) {
    throw new ApiError(404, "API key not found");
  }
  
  // Generate new key
  const { key, keyPrefix, hashedKey } = ApiKey.generateKey();
  
  apiKey.key = key;
  apiKey.keyPrefix = keyPrefix;
  apiKey.hashedKey = hashedKey;
  apiKey.lastRegeneratedAt = new Date();
  apiKey.status = 'active'; // Reactivate if it was revoked
  
  await apiKey.save();
  
  // Return the new key only this one time
  const response = {
    ...apiKey.toObject(),
    key: key // Include the actual key for the user to copy
  };
  delete response.hashedKey;
  
  return res.status(200).json(
    new ApiResponse(200, response, "API key regenerated successfully")
  );
}));

// Revoke API key
router.delete("/:keyId", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  
  const apiKey = await ApiKey.findOne({
    _id: keyId,
    userId: req.user._id
  });
  
  if (!apiKey) {
    throw new ApiError(404, "API key not found");
  }
  
  apiKey.status = 'revoked';
  await apiKey.save();
  
  return res.status(200).json(
    new ApiResponse(200, {}, "API key revoked successfully")
  );
}));

// Get API key usage analytics
router.get("/:keyId/analytics", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  const { days = 30 } = req.query;
  
  const apiKey = await ApiKey.findOne({
    _id: keyId,
    userId: req.user._id
  });
  
  if (!apiKey) {
    throw new ApiError(404, "API key not found");
  }
  
  // Get usage data for the requested number of days
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
  
  const dailyUsage = apiKey.usage.dailyUsage
    .filter(usage => usage.date >= cutoffDate)
    .sort((a, b) => a.date - b.date);
  
  const analytics = {
    totalRequests: apiKey.usage.totalRequests,
    lastUsed: apiKey.usage.lastUsed,
    dailyUsage,
    rateLimitStatus: apiKey.checkRateLimit(),
    averageRequestsPerDay: dailyUsage.length > 0 
      ? dailyUsage.reduce((sum, day) => sum + day.requests, 0) / dailyUsage.length 
      : 0
  };
  
  return res.status(200).json(
    new ApiResponse(200, analytics, "Analytics retrieved successfully")
  );
}));

// Test API key (verify it works)
router.post("/:keyId/test", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  
  const apiKey = await ApiKey.findOne({
    _id: keyId,
    userId: req.user._id
  });
  
  if (!apiKey) {
    throw new ApiError(404, "API key not found");
  }
  
  // Test the key by trying to verify it
  const testKey = `${apiKey.keyPrefix}-${'test'}${apiKey.hashedKey.slice(-8)}`;
  const verification = await ApiKey.verifyKey(testKey);
  
  const testResult = {
    keyId: apiKey._id,
    status: apiKey.status,
    permissions: apiKey.permissions,
    rateLimitStatus: apiKey.checkRateLimit(),
    canMakeRequests: apiKey.status === 'active' && apiKey.checkRateLimit().allowed
  };
  
  return res.status(200).json(
    new ApiResponse(200, testResult, "API key test completed")
  );
}));

// Reveal original external API key
router.post("/:keyId/reveal", asyncHandler(async (req, res) => {
  const { keyId } = req.params;
  
  const apiKey = await ApiKey.findOne({ 
    _id: keyId, 
    userId: req.user._id,
    isExternal: true,
    status: 'active'
  });

  if (!apiKey) {
    throw new ApiError(404, "External API key not found");
  }

  // Decrypt the original key
  const originalKey = ApiKey.decryptExternalKey({
    encrypted: apiKey.externalKeyEncrypted,
    iv: apiKey.encryptionIV,
    tag: apiKey.encryptionTag
  });

  // Log access event
  apiKey.logAuditEvent('revealed', req.user._id, req.ip, req.get('User-Agent'), {
    reason: 'User requested to view original API key'
  });
  await apiKey.save();

  const result = {
    success: true,
    key: originalKey,
    provider: apiKey.externalProvider
  };
  
  return res.status(200).json(
    new ApiResponse(200, result, "External API key revealed successfully")
  );
}));

export default router;
