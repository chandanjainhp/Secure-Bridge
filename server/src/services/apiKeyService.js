import { ApiKey } from "../models/apikey.model.js";
import { ApiError } from "../utils/ApiError.js";
import crypto from "crypto";
import axios from "axios";

class ApiKeyService {
  // Create a new API key (internal or external)
  static async createApiKey(userId, keyData) {
    try {
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
        settings = {}
      } = keyData;

      // Validate required fields
      if (!name || name.trim().length < 3) {
        throw new ApiError(400, "API key name must be at least 3 characters long");
      }

      // Check for duplicate names for this user
      const existingKey = await ApiKey.findOne({ 
        userId, 
        name: name.trim(), 
        status: { $ne: 'revoked' } 
      });
      
      if (existingKey) {
        throw new ApiError(400, "An API key with this name already exists");
      }

      let apiKeyData = {
        name: name.trim(),
        description: description?.trim() || '',
        userId,
        permissions: permissions || ["chat.access"],
        rateLimit: {
          requestsPerMinute: rateLimit?.requestsPerMinute || 60,
          requestsPerHour: rateLimit?.requestsPerHour || 1000,
          requestsPerDay: rateLimit?.requestsPerDay || 10000
        },
        ipWhitelist: ipWhitelist || [],
        domainWhitelist: domainWhitelist || [],
        settings,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      };

      if (externalKey && provider) {
        // Handle external API key
        const validation = ApiKey.validateExternalKeyFormat(externalKey, provider);
        if (!validation.valid) {
          throw new ApiError(400, validation.message);
        }

        // Check for duplicate external keys
        const encryptionResult = ApiKey.encryptExternalKey(externalKey);
        const duplicateCheck = await ApiKey.findOne({
          externalKeyEncrypted: encryptionResult.encrypted,
          status: { $ne: 'revoked' }
        });

        if (duplicateCheck) {
          throw new ApiError(400, "This external API key is already registered");
        }

        apiKeyData = {
          ...apiKeyData,
          isExternal: true,
          externalProvider: provider,
          externalKeyEncrypted: encryptionResult.encrypted,
          encryptionIV: encryptionResult.iv,
          encryptionTag: encryptionResult.tag,
          keyPrefix: `ext-${provider}`,
          hashedKey: crypto.createHash('sha256').update(encryptionResult.encrypted).digest('hex'),
          key: `ext-${provider}-****${encryptionResult.encrypted.slice(-8)}`
        };
      } else {
        // Generate new internal API key
        const keyGeneration = ApiKey.generateKey();
        apiKeyData = {
          ...apiKeyData,
          ...keyGeneration,
          isExternal: false
        };
      }

      const apiKey = await ApiKey.create(apiKeyData);
      
      // Log creation event
      apiKey.logAuditEvent('created', userId, null, null, { 
        provider: provider || 'internal',
        permissions: apiKeyData.permissions 
      });
      await apiKey.save();

      // Return without sensitive data
      const response = apiKey.toObject();
      delete response.hashedKey;
      delete response.externalKeyEncrypted;
      
      // Include the actual key only for internal keys and only once
      if (!apiKey.isExternal) {
        response.key = apiKeyData.key;
      }

      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to create API key: ${error.message}`);
    }
  }

  // Get all API keys for a user
  static async getUserApiKeys(userId, options = {}) {
    try {
      const {
        includeRevoked = false,
        search = '',
        provider = null,
        sortBy = 'createdAt',
        sortOrder = 'desc',
        page = 1,
        limit = 50
      } = options;

      // Build filter
      const filter = { userId };
      
      if (!includeRevoked) {
        filter.status = { $ne: 'revoked' };
      }

      if (search) {
        filter.$text = { $search: search };
      }

      if (provider) {
        filter.externalProvider = provider;
      }

      // Build sort
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      // Execute query with pagination
      const skip = (page - 1) * limit;
      const [apiKeys, total] = await Promise.all([
        ApiKey.find(filter)
          .select('-hashedKey -externalKeyEncrypted -encryptionIV -encryptionTag')
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        ApiKey.countDocuments(filter)
      ]);

      // Add usage statistics
      const enhancedKeys = apiKeys.map(key => ({
        ...key,
        usage: {
          ...key.usage,
          rateLimitStatus: this._calculateRateLimitStatus(key),
          recentActivity: this._getRecentActivity(key)
        }
      }));

      return {
        apiKeys: enhancedKeys,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      throw new ApiError(500, `Failed to retrieve API keys: ${error.message}`);
    }
  }

  // Get detailed API key information
  static async getApiKeyDetails(keyId, userId) {
    try {
      const apiKey = await ApiKey.findOne({
        _id: keyId,
        userId
      }).select('-hashedKey -externalKeyEncrypted -encryptionIV -encryptionTag');

      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      const details = apiKey.toObject();
      
      // Add calculated analytics
      details.analytics = {
        rateLimitStatus: this._calculateRateLimitStatus(apiKey),
        recentActivity: this._getRecentActivity(apiKey),
        usageTrends: this._calculateUsageTrends(apiKey),
        topEndpoints: this._getTopEndpoints(apiKey),
        errorRate: this._calculateErrorRate(apiKey)
      };

      return details;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to get API key details: ${error.message}`);
    }
  }

  // Update API key
  static async updateApiKey(keyId, userId, updateData, auditInfo = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });
      
      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      const allowedUpdates = [
        'name', 'description', 'permissions', 'rateLimit', 
        'expiresAt', 'ipWhitelist', 'domainWhitelist', 'status', 'settings'
      ];

      const updates = {};
      
      for (const field of allowedUpdates) {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      }

      // Validate name if provided
      if (updates.name && updates.name !== apiKey.name) {
        const existingKey = await ApiKey.findOne({
          userId,
          name: updates.name,
          _id: { $ne: keyId },
          status: { $ne: 'revoked' }
        });
        
        if (existingKey) {
          throw new ApiError(400, "An API key with this name already exists");
        }
      }

      // Apply updates
      Object.assign(apiKey, updates);
      
      // Log update event
      apiKey.logAuditEvent('updated', userId, auditInfo.ipAddress, auditInfo.userAgent, {
        updatedFields: Object.keys(updates),
        changes: updates
      });

      await apiKey.save();

      return apiKey.toObject();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to update API key: ${error.message}`);
    }
  }

  // Regenerate API key
  static async regenerateApiKey(keyId, userId, auditInfo = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });
      
      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      if (apiKey.isExternal) {
        throw new ApiError(400, "Cannot regenerate external API keys");
      }

      // Generate new key
      const keyGeneration = ApiKey.generateKey();
      
      apiKey.key = keyGeneration.key;
      apiKey.keyPrefix = keyGeneration.keyPrefix;
      apiKey.hashedKey = keyGeneration.hashedKey;
      apiKey.lastRegeneratedAt = new Date();
      apiKey.status = 'active';

      // Log regeneration event
      apiKey.logAuditEvent('regenerated', userId, auditInfo.ipAddress, auditInfo.userAgent);

      await apiKey.save();

      const response = apiKey.toObject();
      response.key = keyGeneration.key; // Include new key
      delete response.hashedKey;

      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to regenerate API key: ${error.message}`);
    }
  }

  // Revoke API key
  static async revokeApiKey(keyId, userId, auditInfo = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });
      
      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      apiKey.status = 'revoked';
      
      // Log revocation event
      apiKey.logAuditEvent('revoked', userId, auditInfo.ipAddress, auditInfo.userAgent);

      await apiKey.save();

      return { success: true, message: "API key revoked successfully" };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to revoke API key: ${error.message}`);
    }
  }

  // Test API key functionality
  static async testApiKey(keyId, userId, testOptions = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });
      
      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      let testResult;

      if (apiKey.isExternal) {
        testResult = await apiKey.testExternalKey();
      } else {
        // Test internal key functionality
        testResult = await this._testInternalKey(apiKey, testOptions);
      }

      // Log test event
      apiKey.logAuditEvent('tested', userId, null, null, {
        testResult: testResult.success,
        responseTime: testResult.responseTime
      });

      await apiKey.save();

      return testResult;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to test API key: ${error.message}`);
    }
  }

  // Get usage analytics for an API key
  static async getUsageAnalytics(keyId, userId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        granularity = 'day', // day, hour, month
        includeEndpoints = true
      } = options;

      const apiKey = await ApiKey.findOne({ _id: keyId, userId });
      
      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      const analytics = {
        summary: {
          totalRequests: apiKey.usage.totalRequests,
          firstUsed: apiKey.usage.firstUsed,
          lastUsed: apiKey.usage.lastUsed,
          averageRequestsPerDay: this._calculateAverageRequestsPerDay(apiKey),
          errorRate: this._calculateErrorRate(apiKey)
        },
        usage: this._getUsageData(apiKey, granularity, startDate, endDate),
        rateLimits: {
          current: this._calculateRateLimitStatus(apiKey),
          configuration: apiKey.rateLimit
        }
      };

      if (includeEndpoints) {
        analytics.endpoints = this._getEndpointAnalytics(apiKey);
      }

      return analytics;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, `Failed to get usage analytics: ${error.message}`);
    }
  }

  // Private helper methods
  static _calculateRateLimitStatus(apiKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayUsage = apiKey.usage.dailyUsage.find(
      usage => usage.date.getTime() === today.getTime()
    );
    
    const dailyRequests = todayUsage ? todayUsage.requests : 0;
    
    return {
      daily: {
        used: dailyRequests,
        limit: apiKey.rateLimit.requestsPerDay,
        remaining: Math.max(0, apiKey.rateLimit.requestsPerDay - dailyRequests),
        percentage: (dailyRequests / apiKey.rateLimit.requestsPerDay) * 100
      },
      resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000)
    };
  }

  static _getRecentActivity(apiKey) {
    return apiKey.usage.dailyUsage
      .slice(-7)
      .sort((a, b) => b.date - a.date)
      .map(day => ({
        date: day.date,
        requests: day.requests,
        errors: day.errors || 0
      }));
  }

  static _calculateUsageTrends(apiKey) {
    const recent = apiKey.usage.dailyUsage.slice(-7);
    const previous = apiKey.usage.dailyUsage.slice(-14, -7);
    
    const recentAvg = recent.reduce((sum, day) => sum + day.requests, 0) / recent.length || 0;
    const previousAvg = previous.reduce((sum, day) => sum + day.requests, 0) / previous.length || 0;
    
    const trend = previousAvg === 0 ? 0 : ((recentAvg - previousAvg) / previousAvg) * 100;
    
    return {
      trend: Math.round(trend),
      direction: trend > 0 ? 'up' : trend < 0 ? 'down' : 'stable'
    };
  }

  static _getTopEndpoints(apiKey) {
    const endpointCounts = {};
    
    apiKey.usage.dailyUsage.forEach(day => {
      day.endpoints?.forEach(endpoint => {
        const key = `${endpoint.method} ${endpoint.path}`;
        endpointCounts[key] = (endpointCounts[key] || 0) + endpoint.count;
      });
    });
    
    return Object.entries(endpointCounts)
      .map(([endpoint, count]) => ({ endpoint, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  static _calculateErrorRate(apiKey) {
    const totalErrors = apiKey.usage.dailyUsage.reduce((sum, day) => sum + (day.errors || 0), 0);
    const totalRequests = apiKey.usage.totalRequests;
    
    return totalRequests === 0 ? 0 : (totalErrors / totalRequests) * 100;
  }

  static _calculateAverageRequestsPerDay(apiKey) {
    const days = apiKey.usage.dailyUsage.length;
    return days === 0 ? 0 : apiKey.usage.totalRequests / days;
  }

  static async _testInternalKey(apiKey, options) {
    // Basic test for internal keys
    const rateLimitCheck = apiKey.checkRateLimit();
    
    return {
      success: apiKey.status === 'active' && rateLimitCheck.allowed,
      message: apiKey.status === 'active' 
        ? (rateLimitCheck.allowed ? 'Internal API key is working correctly' : rateLimitCheck.reason)
        : `API key is ${apiKey.status}`,
      statusCode: apiKey.status === 'active' ? 200 : 401,
      responseTime: 1 // Minimal time for internal test
    };
  }
}

export default ApiKeyService;
