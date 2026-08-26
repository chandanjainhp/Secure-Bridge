import ApiKeyService from "../services/apiKeyService.js";
import { ApiKey } from "../models/apikey.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { providerValidations, sanitizers } from "../utils/validation.js";

class ApiKeyController {
  // Get all API keys for authenticated user
  static getAllApiKeys = asyncHandler(async (req, res) => {
    const {
      includeRevoked = false,
      search = "",
      provider = null,
      sortBy = "createdAt",
      sortOrder = "desc",
      page = 1,
      limit = 20,
    } = req.query;

    const options = {
      includeRevoked: includeRevoked === "true",
      search: search.trim(),
      provider,
      sortBy,
      sortOrder,
      page: parseInt(page),
      limit: Math.min(parseInt(limit), 50), // Cap at 50 per page
    };

    const result = await ApiKeyService.getUserApiKeys(req.user._id, options);

    return res
      .status(200)
      .json(new ApiResponse(200, result, "API keys retrieved successfully"));
  });

  // Get specific API key details
  static getApiKeyDetails = asyncHandler(async (req, res) => {
    const { keyId } = req.params;

    const apiKeyDetails = await ApiKeyService.getApiKeyDetails(
      keyId,
      req.user._id,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          apiKeyDetails,
          "API key details retrieved successfully",
        ),
      );
  });

  // Create a new API key
  static createApiKey = asyncHandler(async (req, res) => {
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
      settings,
    } = req.body;

    // Sanitize input data
    const sanitizedData = {
      name: sanitizers.sanitizeApiKeyName(name),
      description: sanitizers.sanitizeDescription(description),
      permissions,
      rateLimit,
      expiresAt,
      ipWhitelist: sanitizers.sanitizeIpList(ipWhitelist),
      domainWhitelist: sanitizers.sanitizeDomainList(domainWhitelist),
      externalKey,
      provider,
      settings: settings || {},
    };

    // Additional validation for external keys
    if (externalKey && provider) {
      const validation = ApiKey.validateExternalKeyFormat(
        externalKey,
        provider,
      );
      if (!validation.valid) {
        throw new ApiError(400, validation.message);
      }
    }

    const apiKey = await ApiKeyService.createApiKey(
      req.user._id,
      sanitizedData,
    );

    return res
      .status(201)
      .json(new ApiResponse(201, apiKey, "API key created successfully"));
  });

  // Update existing API key
  static updateApiKey = asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const updateData = req.body;

    // Sanitize update data
    if (updateData.name) {
      updateData.name = sanitizers.sanitizeApiKeyName(updateData.name);
    }
    if (updateData.description !== undefined) {
      updateData.description = sanitizers.sanitizeDescription(
        updateData.description,
      );
    }
    if (updateData.ipWhitelist) {
      updateData.ipWhitelist = sanitizers.sanitizeIpList(
        updateData.ipWhitelist,
      );
    }
    if (updateData.domainWhitelist) {
      updateData.domainWhitelist = sanitizers.sanitizeDomainList(
        updateData.domainWhitelist,
      );
    }

    const auditInfo = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
    };

    const updatedApiKey = await ApiKeyService.updateApiKey(
      keyId,
      req.user._id,
      updateData,
      auditInfo,
    );

    // Remove sensitive fields from response
    const response = updatedApiKey;
    delete response.hashedKey;
    delete response.externalKeyEncrypted;

    return res
      .status(200)
      .json(new ApiResponse(200, response, "API key updated successfully"));
  });

  // Regenerate API key
  static regenerateApiKey = asyncHandler(async (req, res) => {
    const { keyId } = req.params;

    const auditInfo = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
    };

    const regeneratedKey = await ApiKeyService.regenerateApiKey(
      keyId,
      req.user._id,
      auditInfo,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          regeneratedKey,
          "API key regenerated successfully",
        ),
      );
  });

  // Revoke API key
  static revokeApiKey = asyncHandler(async (req, res) => {
    const { keyId } = req.params;

    const auditInfo = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
    };

    const result = await ApiKeyService.revokeApiKey(
      keyId,
      req.user._id,
      auditInfo,
    );

    return res
      .status(200)
      .json(new ApiResponse(200, result, "API key revoked successfully"));
  });

  // Test API key functionality
  static testApiKey = asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const { testType = "basic" } = req.body;

    const testResult = await ApiKeyService.testApiKey(keyId, req.user._id, {
      testType,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, testResult, "API key test completed"));
  });

  // Get usage analytics for API key
  static getUsageAnalytics = asyncHandler(async (req, res) => {
    const { keyId } = req.params;
    const {
      startDate,
      endDate,
      granularity = "day",
      includeEndpoints = true,
    } = req.query;

    const options = {
      startDate: startDate ? new Date(startDate) : null,
      endDate: endDate ? new Date(endDate) : null,
      granularity,
      includeEndpoints: includeEndpoints === "true",
    };

    const analytics = await ApiKeyService.getUsageAnalytics(
      keyId,
      req.user._id,
      options,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          analytics,
          "Usage analytics retrieved successfully",
        ),
      );
  });

  // Reveal original external API key (requires auth)
  static revealExternalApiKey = asyncHandler(async (req, res) => {
    const { keyId } = req.params;

    const result = await ApiKeyService.revealExternalApiKey(
      keyId,
      req.user._id,
    );

    return res
      .status(200)
      .json(
        new ApiResponse(200, result, "External API key revealed successfully"),
      );
  });

  // Validate external API key format (no auth required)
  static validateExternalKeyFormat = asyncHandler(async (req, res) => {
    const { apiKey, provider } = req.body;

    if (!apiKey || !provider) {
      throw new ApiError(400, "Both apiKey and provider are required");
    }

    // Use the provider-specific validation
    let validation;
    switch (provider) {
      case "openai":
        validation = providerValidations.validateOpenAI(apiKey);
        break;
      case "anthropic":
        validation = providerValidations.validateAnthropic(apiKey);
        break;
      case "google":
        validation = providerValidations.validateGoogle(apiKey);
        break;
      case "azure":
        validation = providerValidations.validateAzure(apiKey);
        break;
      case "cohere":
        validation = providerValidations.validateCohere(apiKey);
        break;
      case "huggingface":
        validation = providerValidations.validateHuggingFace(apiKey);
        break;
      case "replicate":
        validation = providerValidations.validateReplicate(apiKey);
        break;
      case "custom":
        validation = providerValidations.validateCustom(apiKey);
        break;
      default:
        throw new ApiError(400, "Unsupported provider");
    }

    if (!validation.valid) {
      throw new ApiError(400, validation.message);
    }

    return res
      .status(200)
      .json(new ApiResponse(200, validation, "API key validation completed"));
  });

  // Test external API key connectivity (requires auth)
  static testExternalKeyConnectivity = asyncHandler(async (req, res) => {
    const { apiKey, provider } = req.body;

    if (!apiKey || !provider) {
      throw new ApiError(400, "Both apiKey and provider are required");
    }

    // First validate format
    const formatValidation = await ApiKeyController.validateExternalKeyFormat(
      req,
      res,
    );

    // Then test actual connectivity
    let testResult;
    const startTime = Date.now();

    try {
      switch (provider) {
        case "openai":
          testResult = await this._testOpenAIConnectivity(apiKey);
          break;
        case "anthropic":
          testResult = await this._testAnthropicConnectivity(apiKey);
          break;
        case "google":
          testResult = await this._testGoogleConnectivity(apiKey);
          break;
        case "azure":
          testResult = await this._testAzureConnectivity(apiKey);
          break;
        default:
          testResult = {
            success: false,
            message: `Connectivity testing not yet implemented for ${provider}`,
          };
      }
    } catch (error) {
      testResult = {
        success: false,
        message: `Connectivity test failed: ${error.message}`,
      };
    }

    const responseTime = Date.now() - startTime;
    testResult.responseTime = responseTime;
    testResult.provider = provider;

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          testResult,
          "External API key connectivity test completed",
        ),
      );
  });

  // Get API key usage summary for dashboard
  static getUsageSummary = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    // Get all active keys
    const activeKeys = await ApiKey.find({
      userId,
      status: "active",
    }).select("name usage rateLimit externalProvider");

    // Calculate summary statistics
    const summary = {
      totalKeys: activeKeys.length,
      totalRequests: activeKeys.reduce(
        (sum, key) => sum + key.usage.totalRequests,
        0,
      ),
      keysNearLimit: 0,
      keysByProvider: {},
      recentActivity: [],
    };

    // Process each key
    activeKeys.forEach((key) => {
      // Count keys near their daily limit
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayUsage = key.usage.dailyUsage.find(
        (usage) => usage.date.getTime() === today.getTime(),
      );
      const dailyRequests = todayUsage ? todayUsage.requests : 0;
      const dailyLimit = key.rateLimit.requestsPerDay;

      if (dailyRequests / dailyLimit > 0.8) {
        // 80% threshold
        summary.keysNearLimit++;
      }

      // Count by provider
      const provider = key.externalProvider || "internal";
      summary.keysByProvider[provider] =
        (summary.keysByProvider[provider] || 0) + 1;
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, summary, "Usage summary retrieved successfully"),
      );
  });

  // Bulk operations for API keys
  static bulkUpdateApiKeys = asyncHandler(async (req, res) => {
    const { keyIds, updates } = req.body;

    if (!Array.isArray(keyIds) || keyIds.length === 0) {
      throw new ApiError(400, "keyIds must be a non-empty array");
    }

    if (keyIds.length > 50) {
      throw new ApiError(400, "Cannot update more than 50 keys at once");
    }

    const auditInfo = {
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get("User-Agent"),
    };

    const results = [];

    for (const keyId of keyIds) {
      try {
        const updatedKey = await ApiKeyService.updateApiKey(
          keyId,
          req.user._id,
          updates,
          auditInfo,
        );
        results.push({ keyId, success: true, data: updatedKey });
      } catch (error) {
        results.push({
          keyId,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          results,
          summary: {
            total: keyIds.length,
            successful: successCount,
            failed: keyIds.length - successCount,
          },
        },
        `Bulk update completed: ${successCount}/${keyIds.length} successful`,
      ),
    );
  });

  // Export API keys (for backup/migration)
  static exportApiKeys = asyncHandler(async (req, res) => {
    const { includeRevoked = false, format = "json" } = req.query;

    const filter = { userId: req.user._id };
    if (!includeRevoked) {
      filter.status = { $ne: "revoked" };
    }

    const apiKeys = await ApiKey.find(filter)
      .select("-hashedKey -externalKeyEncrypted -encryptionIV -encryptionTag")
      .lean();

    // Remove sensitive data and prepare for export
    const exportData = apiKeys.map((key) => ({
      name: key.name,
      description: key.description,
      permissions: key.permissions,
      rateLimit: key.rateLimit,
      status: key.status,
      isExternal: key.isExternal,
      externalProvider: key.externalProvider,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt,
    }));

    const exportMetadata = {
      exportedAt: new Date().toISOString(),
      totalKeys: exportData.length,
      userId: req.user._id,
      version: "1.0",
    };

    const fullExport = {
      metadata: exportMetadata,
      apiKeys: exportData,
    };

    if (format === "csv") {
      // Convert to CSV format
      const csv = this._convertToCSV(exportData);
      res.setHeader("Content-Type", "text/csv");
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="api-keys-export.csv"',
      );
      return res.send(csv);
    }

    res.setHeader("Content-Type", "application/json");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="api-keys-export.json"',
    );

    return res.status(200).json(fullExport);
  });

  // Private helper methods
  static async _testOpenAIConnectivity(apiKey) {
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: "OpenAI API key is valid and working",
          details: {
            modelsCount: data.data?.length || 0,
            statusCode: response.status,
          },
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: `OpenAI API error: ${errorData.error?.message || "Invalid API key"}`,
          statusCode: response.status,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `OpenAI connectivity test failed: ${error.message}`,
      };
    }
  }

  static async _testAnthropicConnectivity(apiKey) {
    try {
      // Use a minimal test request
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }],
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok || response.status === 400) {
        // 400 is expected for this test case, but means the key is valid
        return {
          success: true,
          message: "Anthropic API key is valid and working",
          details: { statusCode: response.status },
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: `Anthropic API error: ${errorData.error?.message || "Invalid API key"}`,
          statusCode: response.status,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Anthropic connectivity test failed: ${error.message}`,
      };
    }
  }

  static async _testGoogleConnectivity(apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`,
        {
          signal: AbortSignal.timeout(10000),
        },
      );

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          message: "Google AI API key is valid and working",
          details: {
            modelsCount: data.models?.length || 0,
            statusCode: response.status,
          },
        };
      } else {
        const errorData = await response.json().catch(() => ({}));
        return {
          success: false,
          message: `Google AI API error: ${errorData.error?.message || "Invalid API key"}`,
          statusCode: response.status,
        };
      }
    } catch (error) {
      return {
        success: false,
        message: `Google AI connectivity test failed: ${error.message}`,
      };
    }
  }

  static async _testAzureConnectivity(apiKey) {
    // Azure OpenAI requires endpoint URL, so this is a basic format test
    return {
      success: true,
      message:
        "Azure OpenAI API key format is valid (endpoint-specific testing requires configuration)",
      details: {
        note: "Full connectivity testing requires Azure endpoint URL",
      },
    };
  }

  static _convertToCSV(data) {
    if (!data || data.length === 0) return "";

    const headers = Object.keys(data[0]).join(",");
    const rows = data.map((item) =>
      Object.values(item)
        .map((value) =>
          typeof value === "object" ? JSON.stringify(value) : value,
        )
        .join(","),
    );

    return [headers, ...rows].join("\n");
  }
}

export default ApiKeyController;
