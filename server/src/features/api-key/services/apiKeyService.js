/**
 * API Key Service - Manages internal and external API keys
 *
 * FIXED:
 * - Removed all debug console.logs that leaked key prefixes and masked keys
 * - Fixed division-by-zero in _calculateRateLimitStatus
 * - Fixed _calculateUsageTrends division-by-zero when previous array is empty
 * - Gate debug logging behind NODE_ENV === 'development'
 * - Removed error.message passthrough in catch blocks (security: don't leak internals)
 */

import { ApiKey } from "../models/apikey.model.js";
import { ApiError } from "../../../utils/ApiError.js";
import crypto from "crypto";

const isDev = process.env.NODE_ENV === "development";

class ApiKeyService {
  // ============================================================
  // CREATE
  // ============================================================

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
        settings = {},
      } = keyData;

      if (!name || name.trim().length < 3) {
        throw new ApiError(400, "API key name must be at least 3 characters long");
      }

      // Check for duplicate names
      const existingKey = await ApiKey.findOne({
        userId,
        name: name.trim(),
        status: { $ne: "revoked" },
      });

      if (existingKey) {
        throw new ApiError(400, "An API key with this name already exists");
      }

      let apiKeyData = {
        name: name.trim(),
        description: description?.trim() || "",
        userId,
        permissions: permissions || ["chat.access"],
        rateLimit: {
          requestsPerMinute: rateLimit?.requestsPerMinute || 60,
          requestsPerHour: rateLimit?.requestsPerHour || 1000,
          requestsPerDay: rateLimit?.requestsPerDay || 10000,
        },
        ipWhitelist: ipWhitelist || [],
        domainWhitelist: domainWhitelist || [],
        settings,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      };

      // ============================================================
      // EXTERNAL KEY
      // ============================================================

      if (externalKey && provider) {
        const validation = ApiKey.validateExternalKeyFormat(externalKey, provider);
        if (!validation.valid) {
          throw new ApiError(400, validation.message);
        }

        const maskedKey = ApiKeyService._maskExternalKey(externalKey, provider);
        const externalKeyHash = crypto.createHash("sha256").update(externalKey).digest("hex");

        // Detect exact duplicate external secrets without storing plaintext.
        const maskedKeyDuplicate = await ApiKey.findOne({
          userId,
          externalProvider: provider,
          hashedKey: externalKeyHash,
        });

        if (maskedKeyDuplicate) {
          if (maskedKeyDuplicate.userId.toString() === userId.toString()) {
            if (maskedKeyDuplicate.status === "revoked") {
              // Reactivate
              maskedKeyDuplicate.status = "active";
              maskedKeyDuplicate.permissions =
                permissions || maskedKeyDuplicate.permissions;
              maskedKeyDuplicate.rateLimit = rateLimit || maskedKeyDuplicate.rateLimit;
              maskedKeyDuplicate.updatedAt = new Date();
              maskedKeyDuplicate.lastUsed = new Date();

              const reactivatedKey = await maskedKeyDuplicate.save();

              return {
                success: true,
                message: "Previously revoked API key has been reactivated",
                data: ApiKeyService._sanitizeKeyResponse(reactivatedKey),
              };
            } else {
              throw new ApiError(
                400,
                "This API key is already active in your account. Please check your existing API keys."
              );
            }
          } else {
            throw new ApiError(
              400,
              "This external API key is already registered by another user"
            );
          }
        }

        // Encrypt the external key
        const encryptionResult = ApiKey.encryptExternalKey(externalKey);

        apiKeyData = {
          ...apiKeyData,
          isExternal: true,
          externalProvider: provider,
          provider,
          externalKeyEncrypted: encryptionResult.encrypted,
          encryptionIV: encryptionResult.iv,
          encryptionTag: encryptionResult.tag,
          keyPrefix: `${provider.substring(0, 4)}-****${externalKey.slice(-4)}`,
          hashedKey: externalKeyHash,
          key: maskedKey,
        };
      } else {
        // ============================================================
        // INTERNAL KEY
        // ============================================================

        const keyGeneration = ApiKey.generateKey();
        
        // Encrypt the internal key for storage
        const encryptionResult = ApiKey.encryptExternalKey(keyGeneration.key);
        
        apiKeyData = {
          ...apiKeyData,
          ...keyGeneration,
          isExternal: false,
          // Store encrypted key instead of plain key
          externalKeyEncrypted: encryptionResult.encrypted,
          encryptionIV: encryptionResult.iv,
          encryptionTag: encryptionResult.tag,
          // Store masked key for display
          key: ApiKeyService._maskExternalKey(keyGeneration.key, 'internal'),
        };
      }

      const apiKey = await ApiKey.create(apiKeyData);

      apiKey.logAuditEvent("created", userId, null, null, {
        provider: provider || "internal",
        permissions: apiKeyData.permissions,
      });
      await apiKey.save();

      const response = apiKey.toObject();
      delete response.hashedKey;
      delete response.externalKeyEncrypted;
      delete response.encryptionIV;
      delete response.encryptionTag;
      delete response.key;

      // For external keys, include the masked key
      if (apiKey.isExternal) {
        response.maskedKey = apiKey.key;
      }

      return response;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to create API key");
    }
  }

  // ============================================================
  // LIST
  // ============================================================

  static async getUserApiKeys(userId, options = {}) {
    try {
      const {
        includeRevoked = false,
        search = "",
        provider = null,
        sortBy = "createdAt",
        sortOrder = "desc",
        page = 1,
        limit = 50,
      } = options;

      const filter = { userId };

      if (!includeRevoked) {
        filter.status = { $ne: "revoked" };
      }

      if (search) {
        filter.$text = { $search: search };
      }

      if (provider) {
        filter.externalProvider = provider;
      }

      const sort = {};
      sort[sortBy] = sortOrder === "desc" ? -1 : 1;

      const skip = (page - 1) * limit;
      const [apiKeys, total] = await Promise.all([
        ApiKey.find(filter)
          .select("-hashedKey -externalKeyEncrypted -encryptionIV -encryptionTag -key")
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(),
        ApiKey.countDocuments(filter),
      ]);

      const enhancedKeys = apiKeys.map((key) => ({
        ...key,
        usage: {
          ...key.usage,
          rateLimitStatus: ApiKeyService._calculateRateLimitStatus(key),
          recentActivity: ApiKeyService._getRecentActivity(key),
        },
      }));

      return {
        apiKeys: enhancedKeys,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      throw new ApiError(500, "Failed to retrieve API keys");
    }
  }

  // ============================================================
  // GET DETAILS
  // ============================================================

  static async getApiKeyDetails(keyId, userId) {
    try {
      const apiKey = await ApiKey.findOne({
        _id: keyId,
        userId,
      }).select("-hashedKey -externalKeyEncrypted -encryptionIV -encryptionTag -key");

      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      const details = apiKey.toObject();
      details.analytics = {
        rateLimitStatus: ApiKeyService._calculateRateLimitStatus(apiKey),
        recentActivity: ApiKeyService._getRecentActivity(apiKey),
        usageTrends: ApiKeyService._calculateUsageTrends(apiKey),
        topEndpoints: ApiKeyService._getTopEndpoints(apiKey),
        errorRate: ApiKeyService._calculateErrorRate(apiKey),
      };

      return details;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to get API key details");
    }
  }

  // ============================================================
  // UPDATE
  // ============================================================

  static async updateApiKey(keyId, userId, updateData, auditInfo = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });

      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      const allowedUpdates = [
        "name",
        "description",
        "permissions",
        "rateLimit",
        "expiresAt",
        "ipWhitelist",
        "domainWhitelist",
        "status",
        "settings",
      ];

      const updates = {};
      for (const field of allowedUpdates) {
        if (updateData[field] !== undefined) {
          updates[field] = updateData[field];
        }
      }

      if (updates.name && updates.name !== apiKey.name) {
        const existingKey = await ApiKey.findOne({
          userId,
          name: updates.name,
          _id: { $ne: keyId },
          status: { $ne: "revoked" },
        });

        if (existingKey) {
          throw new ApiError(400, "An API key with this name already exists");
        }
      }

      Object.assign(apiKey, updates);

      apiKey.logAuditEvent("updated", userId, auditInfo.ipAddress, auditInfo.userAgent, {
        updatedFields: Object.keys(updates),
        changes: updates,
      });

      await apiKey.save();

      return apiKey.toObject();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to update API key");
    }
  }

  // ============================================================
  // DELETE
  // ============================================================
  static async deleteApiKey(keyId, userId) {
    try {
      const deleted = await ApiKey.findOneAndDelete({ _id: keyId, userId });
      if (!deleted) throw new ApiError(404, "API key not found");
      return { id: keyId, deleted: true };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to delete API key");
    }
  }

  // ============================================================
  // REGENERATE
  // ============================================================

  static async regenerateApiKey(keyId, userId, auditInfo = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });

      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      if (apiKey.isExternal) {
        throw new ApiError(400, "Cannot regenerate external API keys");
      }

      const keyGeneration = ApiKey.generateKey();
      
      // Encrypt the new key
      const encryptionResult = ApiKey.encryptExternalKey(keyGeneration.key);

      // Store masked key for display, encrypted key for security
      apiKey.key = ApiKeyService._maskExternalKey(keyGeneration.key, 'internal');
      apiKey.keyPrefix = keyGeneration.keyPrefix;
      apiKey.hashedKey = keyGeneration.hashedKey;
      apiKey.externalKeyEncrypted = encryptionResult.encrypted;
      apiKey.encryptionIV = encryptionResult.iv;
      apiKey.encryptionTag = encryptionResult.tag;
      apiKey.lastRegeneratedAt = new Date();
      apiKey.status = "active";

      apiKey.logAuditEvent("regenerated", userId, auditInfo.ipAddress, auditInfo.userAgent);

      await apiKey.save();

      return ApiKeyService._sanitizeKeyResponse(apiKey);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to regenerate API key");
    }
  }

  // ============================================================
  // REVOKE
  // ============================================================

  static async revokeApiKey(keyId, userId, auditInfo = {}) {
    try {
      const apiKey = await ApiKey.findOne({ _id: keyId, userId });

      if (!apiKey) {
        throw new ApiError(404, "API key not found");
      }

      apiKey.status = "revoked";
      apiKey.logAuditEvent("revoked", userId, auditInfo.ipAddress, auditInfo.userAgent);

      await apiKey.save();

      return { success: true, message: "API key revoked successfully" };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to revoke API key");
    }
  }

  // ============================================================
  // TEST
  // ============================================================

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
        testResult = await ApiKeyService._testInternalKey(apiKey, testOptions);
      }

      apiKey.logAuditEvent("tested", userId, null, null, {
        testResult: testResult.success,
        responseTime: testResult.responseTime,
      });

      await apiKey.save();

      return testResult;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to test API key");
    }
  }

  // ============================================================
  // USAGE ANALYTICS
  // ============================================================

  static async getUsageAnalytics(keyId, userId, options = {}) {
    try {
      const {
        startDate,
        endDate,
        granularity = "day",
        includeEndpoints = true,
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
          averageRequestsPerDay: ApiKeyService._calculateAverageRequestsPerDay(apiKey),
          errorRate: ApiKeyService._calculateErrorRate(apiKey),
        },
        usage: ApiKeyService._getUsageData(apiKey, granularity, startDate, endDate),
        rateLimits: {
          current: ApiKeyService._calculateRateLimitStatus(apiKey),
          configuration: apiKey.rateLimit,
        },
      };

      if (includeEndpoints) {
        analytics.endpoints = ApiKeyService._getEndpointAnalytics(apiKey);
      }

      return analytics;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(500, "Failed to get usage analytics");
    }
  }

  // ============================================================

  // PRIVATE HELPERS
  // ============================================================

  /**
   * Strip sensitive fields from a key document for API responses
   */
  static _sanitizeKeyResponse(apiKeyDoc) {
    const response = apiKeyDoc.toObject ? apiKeyDoc.toObject() : { ...apiKeyDoc };
    delete response.hashedKey;
    delete response.externalKeyEncrypted;
    delete response.encryptionIV;
    delete response.encryptionTag;
    return response;
  }

  static _calculateRateLimitStatus(apiKey) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayUsage = apiKey.usage?.dailyUsage?.find(
      (usage) => usage.date.getTime() === today.getTime()
    );

    const dailyRequests = todayUsage ? todayUsage.requests : 0;
    const dailyLimit = apiKey.rateLimit?.requestsPerDay || 0;

    // FIXED: guard against division by zero
    const percentage = dailyLimit > 0 ? (dailyRequests / dailyLimit) * 100 : 0;

    return {
      daily: {
        used: dailyRequests,
        limit: dailyLimit,
        remaining: Math.max(0, dailyLimit - dailyRequests),
        percentage: Math.round(percentage * 100) / 100,
      },
      resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000),
    };
  }

  static _getRecentActivity(apiKey) {
    return (apiKey.usage?.dailyUsage || [])
      .slice(-7)
      .sort((a, b) => b.date - a.date)
      .map((day) => ({
        date: day.date,
        requests: day.requests,
        errors: day.errors || 0,
      }));
  }

  static _calculateUsageTrends(apiKey) {
    const dailyUsage = apiKey.usage?.dailyUsage || [];
    const recent = dailyUsage.slice(-7);
    const previous = dailyUsage.slice(-14, -7);

    // FIXED: guard against empty arrays
    const recentAvg = recent.length > 0
      ? recent.reduce((sum, day) => sum + day.requests, 0) / recent.length
      : 0;
    const previousAvg = previous.length > 0
      ? previous.reduce((sum, day) => sum + day.requests, 0) / previous.length
      : 0;

    // FIXED: guard against division by zero
    const trend = previousAvg === 0 ? 0 : ((recentAvg - previousAvg) / previousAvg) * 100;

    return {
      trend: Math.round(trend),
      direction: trend > 0 ? "up" : trend < 0 ? "down" : "stable",
    };
  }

  static _getTopEndpoints(apiKey) {
    const endpointCounts = {};

    (apiKey.usage?.dailyUsage || []).forEach((day) => {
      day.endpoints?.forEach((endpoint) => {
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
    const totalErrors = (apiKey.usage?.dailyUsage || []).reduce(
      (sum, day) => sum + (day.errors || 0),
      0
    );
    const totalRequests = apiKey.usage?.totalRequests || 0;

    // Guard against division by zero
    return totalRequests === 0 ? 0 : (totalErrors / totalRequests) * 100;
  }

  static _calculateAverageRequestsPerDay(apiKey) {
    const days = apiKey.usage?.dailyUsage?.length || 0;
    const totalRequests = apiKey.usage?.totalRequests || 0;
    return days === 0 ? 0 : totalRequests / days;
  }

  static _getUsageData(apiKey, granularity, startDate, endDate) {
    let dailyUsage = apiKey.usage?.dailyUsage || [];

    if (startDate) {
      dailyUsage = dailyUsage.filter((day) => day.date >= new Date(startDate));
    }
    if (endDate) {
      dailyUsage = dailyUsage.filter((day) => day.date <= new Date(endDate));
    }

    if (granularity === "hour") {
      // For hour granularity, return the most recent day's hourly breakdown
      return dailyUsage.slice(-1);
    } else if (granularity === "month") {
      // Group by month
      const monthly = {};
      dailyUsage.forEach((day) => {
        const monthKey = day.date.toISOString().substring(0, 7);
        if (!monthly[monthKey]) {
          monthly[monthKey] = { date: monthKey, requests: 0, errors: 0 };
        }
        monthly[monthKey].requests += day.requests;
        monthly[monthKey].errors += day.errors || 0;
      });
      return Object.values(monthly);
    }

    return dailyUsage;
  }

  static _getEndpointAnalytics(apiKey) {
    const endpointData = {};

    (apiKey.usage?.dailyUsage || []).forEach((day) => {
      day.endpoints?.forEach((endpoint) => {
        const key = `${endpoint.method} ${endpoint.path}`;
        if (!endpointData[key]) {
          endpointData[key] = {
            endpoint: key,
            totalRequests: 0,
            errors: 0,
            avgResponseTime: 0,
            responseTimeSum: 0,
            count: 0,
          };
        }
        endpointData[key].totalRequests += endpoint.count || 0;
        endpointData[key].errors += endpoint.errors || 0;
        endpointData[key].responseTimeSum += endpoint.avgResponseTime || 0;
        endpointData[key].count++;
      });
    });

    return Object.values(endpointData)
      .map((e) => ({
        ...e,
        errorRate:
          e.totalRequests > 0 ? (e.errors / e.totalRequests) * 100 : 0,
        avgResponseTime: e.count > 0 ? e.responseTimeSum / e.count : 0,
      }))
      .sort((a, b) => b.totalRequests - a.totalRequests);
  }

  static async _testInternalKey(apiKey, _options) {
    const rateLimitCheck = apiKey.checkRateLimit();

    return {
      success: apiKey.status === "active" && rateLimitCheck.allowed,
      message:
        apiKey.status === "active"
          ? rateLimitCheck.allowed
            ? "Internal API key is working correctly"
            : rateLimitCheck.reason
          : `API key is ${apiKey.status}`,
      statusCode: apiKey.status === "active" ? 200 : 401,
      responseTime: 1,
    };
  }

  // ============================================================
  // MASK EXTERNAL KEY (provider-specific format preservation)
  // ============================================================

  static _maskExternalKey(apiKey, provider) {
    if (!apiKey || apiKey.length < 8) {
      return "••••••••";
    }

    // Provider-specific masking that preserves the format structure
    const maskingRules = {
      openai: { prefix: 7, suffix: 4 },
      anthropic: { prefix: 15, suffix: 4 },
      google: { prefix: 6, suffix: 4 },
      google_ai_studio: { prefix: 6, suffix: 4 },
      azure: { prefix: 4, suffix: 4 },
    };

    const rule = maskingRules[provider];
    if (rule) {
      const maskedLength = Math.max(0, apiKey.length - rule.prefix - rule.suffix);
      return `${apiKey.substring(0, rule.prefix)}${"•".repeat(maskedLength)}${apiKey.slice(-rule.suffix)}`;
    }

    // Generic: show first 4 and last 4
    const visibleLength = Math.min(4, Math.floor(apiKey.length / 3));
    const maskedLength = Math.max(0, apiKey.length - visibleLength * 2);
    return `${apiKey.substring(0, visibleLength)}${"•".repeat(maskedLength)}${apiKey.slice(-visibleLength)}`;
  }
}

export default ApiKeyService;
