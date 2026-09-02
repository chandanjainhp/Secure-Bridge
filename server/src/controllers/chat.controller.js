import { generateText, streamText } from "ai";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiKey } from "../models/apikey.model.js";
import usageService from "../features/usage/services/usageService.js";
import {
  getModelInstance,
  detectProvider,
  findExternalKeys,
  checkLocalLLMHealth,
  getLocalModels,
  LLM_SERVER_URL,
  DEFAULT_MODELS,
  MODEL_CATALOGS,
  FALLBACK_CHAIN,
} from "../utils/chat.providers.js";
import { tryFreeTierFallback } from "../services/chatService.js";

// ============================================================
// HELPER: Build OpenAI-compatible response from AI SDK result
// ============================================================

function buildCompletionResponse(
  result,
  model,
  providerUsed,
  message = "Chat completion successful",
) {
  return new ApiResponse(
    200,
    {
      id: `${providerUsed}-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      provider_used: providerUsed,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: result.finishReason || "stop",
        },
      ],
      usage: {
        prompt_tokens: result.usage?.promptTokens || 0,
        completion_tokens: result.usage?.completionTokens || 0,
        total_tokens: result.usage?.totalTokens || 0,
      },
    },
    message,
  );
}

// ============================================================
// HELPER: Execute a completion (handles stream vs non-stream)
// ============================================================

async function executeCompletion(res, model, messages, params) {
  const {
    temperature,
    max_tokens,
    stream,
    top_p,
    stop,
    model: modelName,
    providerUsed,
  } = params;

  if (stream) {
    const result = streamText({
      model,
      messages,
      temperature,
      maxTokens: max_tokens,
      topP: top_p,
      stopSequences: stop,
    });
    return result.toDataStreamResponse(res);
  }

  const result = await generateText({
    model,
    messages,
    temperature,
    maxTokens: max_tokens,
    topP: top_p,
    stopSequences: stop,
  });

  return res
    .status(200)
    .json(buildCompletionResponse(result, modelName, providerUsed));
}

// ============================================================
// CONTROLLER
// ============================================================

class ChatController {
  // ---------------------------------------------------------
  // GET /test
  // ---------------------------------------------------------
  static test = asyncHandler(async (req, res) => {
    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          { timestamp: new Date() },
          "Chat router is working!",
        ),
      );
  });

  // ---------------------------------------------------------
  // POST /completions — the core endpoint
  // ---------------------------------------------------------
  static completions = asyncHandler(async (req, res) => {
    const { messages, temperature, max_tokens, stream, top_p, stop } = req.body;
    const requestedProvider = req.headers["x-provider"] || "auto";
    const userId = req.user?._id || req.apiKey?.userId;

    // Determine provider and model
    const { provider: selectedProvider, model: selectedModel } = detectProvider(
      req.body.model,
      requestedProvider,
    );

    console.log(
      `🤖 Chat request: provider=${selectedProvider}, model=${selectedModel}, messages=${messages.length}, stream=${stream}`,
    );

    const params = { temperature, max_tokens, stream, top_p, stop };

    // --- Local path (with external fallback) ---
    if (selectedProvider === "local") {
      try {
        const { model, providerUsed } = await getModelInstance(
          "local",
          selectedModel,
          userId,
        );

        return await executeCompletion(res, model, messages, {
          ...params,
          modelName: selectedModel,
          providerUsed,
        });
      } catch (localError) {
        console.log("⚠️  Local LLM not available:", localError.message);
        console.log("🔄 Falling back to external API...");

        // Try external fallback — pass res so streaming can write directly
        const fallbackSent = await ChatController._tryExternalFallback(
          res,
          userId,
          messages,
          params,
        );

        if (fallbackSent) {
          return; // Response already sent
        }

        throw new ApiError(
          503,
          "Local LLM server not available and no external API keys configured",
          { localError: localError.message, fallbackAttempted: true },
        );
      }
    }

    // --- External provider path ---
    const instance = await getModelInstance(
      selectedProvider,
      selectedModel,
      userId,
    );

    if (!instance) {
      throw new ApiError(
        502,
        `No API key found for provider "${selectedProvider}". Ensure you have an active API key with chat permissions.`,
      );
    }

    const { model, providerUsed } = instance;

    const result = await executeCompletion(res, model, messages, {
      ...params,
      modelName: selectedModel,
      providerUsed,
    });

    // Track usage after successful completion
    if (userId) {
      usageService.incrementUsage(userId).catch((err) => {
        console.error("Failed to track usage:", err.message);
      });
    }

    return result;
  });

  // ---------------------------------------------------------
  // GET /providers — list available providers
  // ---------------------------------------------------------
  static getProviders = asyncHandler(async (req, res) => {
    const userId = req.user?._id || req.apiKey?.userId;

    const providers = {
      local: { available: false, reason: "Local LLM server offline" },
      google: { available: false, reason: "No Google API key configured" },
      openai: { available: false, reason: "No OpenAI API key configured" },
      anthropic: {
        available: false,
        reason: "No Anthropic API key configured",
      },
    };

    // Check local LLM
    const localHealthy = await checkLocalLLMHealth();
    if (localHealthy) {
      providers.local = {
        available: true,
        endpoint: LLM_SERVER_URL,
        status: "connected",
      };
    }

    // Check user's external API keys
    if (userId) {
      const userApiKeys = await ApiKey.find({
        userId,
        status: "active",
        permissions: { $in: ["chat.access", "chat.completions"] },
      });

      const matchKey = (keyword) =>
        userApiKeys.find((key) =>
          (key.provider || key.externalProvider || "")
            .toLowerCase()
            .includes(keyword),
        );

      const googleKey = matchKey("google");
      if (googleKey) {
        providers.google = {
          available: true,
          keyId: googleKey._id,
          keyName: googleKey.name,
          status: "configured",
        };
      }

      const openaiKey = matchKey("openai");
      if (openaiKey) {
        providers.openai = {
          available: true,
          keyId: openaiKey._id,
          keyName: openaiKey.name,
          status: "configured",
        };
      }

      const anthropicKey = matchKey("anthropic");
      if (anthropicKey) {
        providers.anthropic = {
          available: true,
          keyId: anthropicKey._id,
          keyName: anthropicKey.name,
          status: "configured",
        };
      }
    }

    const availableCount = Object.values(providers).filter(
      (p) => p.available,
    ).length;

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          providers,
          totalProviders: Object.keys(providers).length,
          availableProviders: availableCount,
        },
        availableCount > 0
          ? "Chat providers available"
          : "No chat providers available",
      ),
    );
  });

  // ---------------------------------------------------------
  // GET /models — list available models
  // ---------------------------------------------------------
  static getModels = asyncHandler(async (req, res) => {
    const provider = req.query.provider || "all";
    const userId = req.user?._id || req.apiKey?.userId;

    const models = {};

    // Local models
    if (provider === "all" || provider === "local") {
      try {
        const localModels = await getLocalModels();
        models.local = { available: true, models: localModels };
      } catch (error) {
        models.local = { available: false, error: error.message, models: [] };
      }
    }

    // External models (only show if user has active keys)
    if (
      userId &&
      (provider === "all" ||
        ["google", "openai", "anthropic"].includes(provider))
    ) {
      const userApiKeys = await ApiKey.find({
        userId,
        status: "active",
        permissions: { $in: ["chat.access", "chat.completions"] },
      });

      const hasProvider = (keyword) =>
        userApiKeys.some((key) =>
          (key.provider || key.externalProvider || "")
            .toLowerCase()
            .includes(keyword),
        );

      if (
        hasProvider("google") &&
        (provider === "all" || provider === "google")
      ) {
        const googleKeys = userApiKeys.filter((key) =>
          (key.provider || key.externalProvider || "")
            .toLowerCase()
            .includes("google"),
        );
        models.google = {
          available: true,
          apiKeyCount: googleKeys.length,
          models: MODEL_CATALOGS.google,
        };
      }

      if (
        hasProvider("openai") &&
        (provider === "all" || provider === "openai")
      ) {
        const openaiKeys = userApiKeys.filter((key) =>
          (key.provider || key.externalProvider || "")
            .toLowerCase()
            .includes("openai"),
        );
        models.openai = {
          available: true,
          apiKeyCount: openaiKeys.length,
          models: MODEL_CATALOGS.openai,
        };
      }

      if (
        hasProvider("anthropic") &&
        (provider === "all" || provider === "anthropic")
      ) {
        const anthropicKeys = userApiKeys.filter((key) =>
          (key.provider || key.externalProvider || "")
            .toLowerCase()
            .includes("anthropic"),
        );
        models.anthropic = {
          available: true,
          apiKeyCount: anthropicKeys.length,
          models: MODEL_CATALOGS.anthropic,
        };
      }
    }

    // Flatten for legacy compatibility
    const allModels = [];
    Object.values(models).forEach((providerData) => {
      if (providerData.models) {
        allModels.push(...providerData.models);
      }
    });

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          data: allModels,
          providers: models,
          providerRequested: provider,
        },
        "Models retrieved successfully",
      ),
    );
  });

  // ---------------------------------------------------------
  // GET /health — local LLM health check (no auth)
  // ---------------------------------------------------------
  static health = asyncHandler(async (req, res) => {
    const isHealthy = await checkLocalLLMHealth();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          llm_server: {
            healthy: isHealthy,
            url: LLM_SERVER_URL,
          },
        },
        "LLM server health check completed",
      ),
    );
  });

  // ---------------------------------------------------------
  // GET /test-unauth — unauthenticated backend test
  // ---------------------------------------------------------
  static testUnauth = asyncHandler(async (req, res) => {
    return res.status(200).json(
      new ApiResponse(
        200,
        {
          server: "Secure Bridge Backend",
          timestamp: new Date().toISOString(),
          endpoints: {
            health: "/api/v1/chat/health",
            models: "/api/v1/chat/models (requires API key)",
            completions: "/api/v1/chat/completions (requires API key)",
            providers: "/api/v1/chat/providers (requires API key)",
          },
        },
        "Backend server is working! This endpoint does not require authentication.",
      ),
    );
  });

  // ---------------------------------------------------------
  // POST /test-local — test local LLM connectivity (no auth)
  // ---------------------------------------------------------
  static testLocal = asyncHandler(async (req, res) => {
    const testMessages = [
      {
        role: "user",
        content:
          'Hello! Please respond with just "Local LLM working" if you can see this.',
      },
    ];

    try {
      const { model } = await getModelInstance(
        "local",
        DEFAULT_MODELS.local,
        null,
      );

      const result = await generateText({
        model,
        messages: testMessages,
        temperature: 0.7,
        maxTokens: 100,
      });

      return res.status(200).json(
        new ApiResponse(
          200,
          {
            response: result.text || "No response content",
            provider: "local",
          },
          "Local LLM is working!",
        ),
      );
    } catch (error) {
      throw new ApiError(503, "Local LLM test failed", {
        error: error.message,
        suggestion: `Make sure LM Studio or similar is running on ${LLM_SERVER_URL}`,
      });
    }
  });

  // ---------------------------------------------------------
  // Development-only: Create demo API key
  // ---------------------------------------------------------
  static createDemoKey = asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV !== "development") {
      throw new ApiError(404, "Endpoint not available");
    }

    const { key, keyPrefix, hashedKey } = ApiKey.generateKey();
    const mongoose = await import("mongoose");
    const demoUserId = new mongoose.default.Types.ObjectId();

    const apiKey = await ApiKey.create({
      name: "Demo API Key for Chat Testing",
      description: "Temporary API key for testing chat functionality",
      userId: demoUserId,
      key,
      keyPrefix,
      hashedKey,
      isExternal: false,
      permissions: [
        "chat.access",
        "chat.completions",
        "fhe.encrypt",
        "mcp.connect",
      ],
      rateLimit: {
        requestsPerMinute: 100,
        requestsPerHour: 1000,
        requestsPerDay: 10000,
      },
      ipWhitelist: [],
      status: "active",
    });

    return res.status(201).json(
      new ApiResponse(
        201,
        {
          id: apiKey._id,
          key, // Only shown once
          name: apiKey.name,
          permissions: apiKey.permissions,
          status: apiKey.status,
          usage:
            "Include this key in X-API-Key header for authenticated requests",
        },
        "Demo API key created successfully!",
      ),
    );
  });

  // ---------------------------------------------------------
  // Development-only: Get demo API key
  // ---------------------------------------------------------
  static getDemoKey = asyncHandler(async (req, res) => {
    if (process.env.NODE_ENV !== "development") {
      throw new ApiError(404, "Endpoint not available");
    }

    const demoKey = await ApiKey.findOne({
      name: "Demo API Key for Chat Testing",
      status: "active",
    }).select("-hashedKey");

    if (!demoKey) {
      throw new ApiError(404, "No demo API key found. Create one first.", {
        createEndpoint: "/api/v1/chat/create-demo-key",
      });
    }

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          _id: demoKey._id.toString(),
          name: demoKey.name,
          provider: "internal",
          status: demoKey.status,
          permissions: demoKey.permissions,
          key: demoKey.key,
          encryptionEnabled: true,
          usage: {
            totalRequests: demoKey.usage?.totalRequests || 0,
            requestsToday: 0,
            lastUsed: demoKey.usage?.lastUsed || null,
          },
        },
        "Demo API key retrieved successfully!",
      ),
    );
  });

  // ============================================================
  // PRIVATE: External fallback when local LLM fails
  // ============================================================

  /**
   * Tries external providers when the local LLM is unavailable.
   * Writes directly to `res` (streaming or JSON).
   *
   * @param {object} res       — Express response object
   * @param {string} userId    — User ID for API key lookup
   * @param {array}  messages  — Chat messages
   * @param {object} params    — { temperature, max_tokens, stream, top_p, stop }
   * @returns {boolean} true if a response was sent, false if no fallback available
   */
  static async _tryExternalFallback(res, userId, messages, params) {
    const { temperature, max_tokens, stream, top_p, stop } = params;

    try {
      const externalKeys = await findExternalKeys(userId);

      // Free-tier fallback: if user has no external keys, try shared OpenAI key
      if (externalKeys.length === 0) {
        const fallback = await tryFreeTierFallback();
        if (fallback) {
          console.log("🔄 Using shared OpenAI key (free-tier fallback)");
          try {
            await executeCompletion(res, fallback.model, messages, {
              temperature,
              max_tokens,
              stream,
              top_p,
              stop,
              modelName: "gpt-4o-mini",
              providerUsed: fallback.providerUsed,
            });
            return true;
          } catch (sharedError) {
            console.error(
              "❌ Shared key fallback failed:",
              sharedError.message,
            );
          }
        }
        return false;
      }

      for (const entry of FALLBACK_CHAIN) {
        const keyDoc = externalKeys.find((k) => {
          const provider = (
            k.provider ||
            k.externalProvider ||
            ""
          ).toLowerCase();
          return provider.includes(entry.matchKeyword);
        });

        if (!keyDoc) continue;

        const actualProvider = keyDoc.provider || keyDoc.externalProvider;

        // Normalise google_ai_studio → google for the SDK factory
        const sdkProvider =
          actualProvider === "google_ai_studio" ? "google" : actualProvider;

        const instance = await getModelInstance(
          sdkProvider,
          entry.model,
          userId,
          keyDoc,
        );

        if (!instance) continue;

        const { model, providerUsed } = instance;

        // Use the shared completion executor — writes directly to res
        await executeCompletion(res, model, messages, {
          temperature,
          max_tokens,
          stream,
          top_p,
          stop,
          modelName: entry.model,
          providerUsed,
        });

        return true; // Response sent successfully
      }

      return false;
    } catch (error) {
      console.error("❌ Error in external API fallback:", error.message);
      return false;
    }
  }
}

export default ChatController;
