/**
 * ChatService — encapsulates the full chat flow:
 *   1. Fetch + decrypt the user's API key (BYOK)
 *   2. Apply the project's systemPrompt to the message array
 *   3. Call the LLM via the Vercel AI SDK
 *   4. Free-tier fallback to a shared OpenAI key when no BYOK key exists
 *   5. Track usage after successful completion
 *
 * Used by: project.controller.js sendMessage handler
 */

import { generateText } from "ai";
import {
  getModelInstance,
  detectProvider,
  findExternalKeys,
  FALLBACK_CHAIN,
  DEFAULT_MODELS,
} from "../utils/chat.providers.js";
import usageService from "../features/usage/services/usageService.js";

/**
 * Build the messages array with the project's systemPrompt prepended.
 *
 * @param {string} systemPrompt - from project settings
 * @param {Array<{role:string, content:string}>} history - prior messages in the conversation
 * @param {string} userContent - the new user message
 * @returns {Array} messages array ready for the AI SDK
 */
function buildMessagesWithSystemPrompt(systemPrompt, history, userContent) {
  const messages = [];

  // Prepend system prompt if defined (non-empty after trim)
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({ role: "system", content: systemPrompt.trim() });
  }

  // Append conversation history (only user/assistant roles — the schema enforces this)
  if (Array.isArray(history)) {
    for (const msg of history) {
      if (msg && (msg.role === "user" || msg.role === "assistant") && msg.content) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
  }

  // Append the new user message
  messages.push({ role: "user", content: userContent });

  return messages;
}

/**
 * Fetch and decrypt the user's API key for the given provider.
 * Delegates to chat.providers.js — this is a thin wrapper for testability.
 *
 * @param {string} userId
 * @param {string} provider
 * @returns {Promise<{model, providerUsed}|null>}
 */
async function fetchAndDecryptKey(userId, provider) {
  if (!userId) return null;
  return getModelInstance(provider, DEFAULT_MODELS[provider] || provider, userId);
}

/**
 * Try the free-tier shared OpenAI key when the user has no BYOK key.
 *
 * @returns {Promise<object|null} AI SDK model instance, or null if no shared key
 */
async function tryFreeTierFallback() {
  const sharedKey = process.env.SHARED_OPENAI_API_KEY;
  if (!sharedKey || sharedKey === "your_shared_openai_api_key_here") {
    return null;
  }

  try {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const openai = createOpenAI({ apiKey: sharedKey });
    return {
      model: openai("gpt-4o-mini"),
      providerUsed: "shared-openai",
    };
  } catch (error) {
    console.error("❌ [chatService] Free-tier fallback failed:", error.message);
    return null;
  }
}

/**
 * Resolve a model instance through the fallback chain:
 *   1. User's BYOK key for the requested provider
 *   2. Any other external key the user has (FALLBACK_CHAIN order)
 *   3. Free-tier shared OpenAI key
 *
 * @param {string} userId
 * @param {string} requestedModel - model name from project settings
 * @returns {Promise<{model, providerUsed}|null>}
 */
async function resolveModel(userId, requestedModel) {
  const { provider, model } = detectProvider(requestedModel || "local", "auto");

  // 1. Try the detected/selected provider with the user's BYOK key
  if (provider !== "local") {
    const instance = await fetchAndDecryptKey(userId, provider);
    if (instance) {
      return { ...instance, modelName: model };
    }
  }

  // 2. Try local LLM if available
  if (provider === "local") {
    try {
      const instance = await getModelInstance("local", model, userId);
      if (instance) {
        return { ...instance, modelName: model };
      }
    } catch {
      // Local LLM not running — fall through to external keys
    }
  }

  // 3. Try other external keys the user may have (fallback chain)
  const externalKeys = await findExternalKeys(userId);
  if (externalKeys.length > 0) {
    for (const entry of FALLBACK_CHAIN) {
      const keyDoc = externalKeys.find((k) => {
        const p = (k.provider || k.externalProvider || "").toLowerCase();
        return p.includes(entry.matchKeyword);
      });
      if (!keyDoc) continue;

      const actualProvider = keyDoc.provider || keyDoc.externalProvider;
      const sdkProvider = actualProvider === "google_ai_studio" ? "google" : actualProvider;

      const instance = await getModelInstance(sdkProvider, entry.model, userId, keyDoc);
      if (instance) {
        return { ...instance, modelName: entry.model };
      }
    }
  }

  // 4. Free-tier shared key fallback
  const fallback = await tryFreeTierFallback();
  if (fallback) {
    return { ...fallback, modelName: "gpt-4o-mini" };
  }

  return null;
}

/**
 * Generate an LLM response for the given messages.
 *
 * @param {Array} messages - full messages array (including system prompt)
 * @param {object} options - { temperature, maxTokens }
 * @returns {Promise<{text:string, providerUsed:string, modelName:string}>}
 */
async function callLLM(messages, options = {}) {
  const { temperature = 0.7, maxTokens = 2048 } = options;

  const { model, providerUsed, modelName } = messages._modelInstance || {};
  // _modelInstance is attached by the caller; if not present, we can't call the LLM
  if (!model) {
    throw new Error("No model instance available");
  }

  const result = await generateText({
    model,
    messages,
    temperature,
    maxTokens,
  });

  return {
    text: result.text || "",
    providerUsed,
    modelName,
    usage: {
      promptTokens: result.usage?.promptTokens || 0,
      completionTokens: result.usage?.completionTokens || 0,
      totalTokens: result.usage?.totalTokens || 0,
    },
  };
}

/**
 * Full chat flow: resolve model, build messages, call LLM, track usage.
 *
 * @param {object} params
 *   - userId: string
 *   - systemPrompt: string (from project settings)
 *   - conversationHistory: Array<{role, content}>
 *   - userContent: string (new message)
 *   - model: string (from project settings)
 *   - temperature: number (from project settings)
 *   - maxTokens: number (from project settings)
 * @returns {Promise<{assistantText:string, providerUsed:string, modelName:string, usage:object}>}
 */
async function generateChatResponse({
  userId,
  systemPrompt,
  conversationHistory,
  userContent,
  model: requestedModel,
  temperature,
  maxTokens,
}) {
  // 1. Resolve the model instance (BYOK → fallback chain → free-tier)
  const modelInstance = await resolveModel(userId, requestedModel);
  if (!modelInstance) {
    throw new Error(
      "No API key found. Add an API key in Settings, or set SHARED_OPENAI_API_KEY for free-tier access.",
    );
  }

  // 1b. Check free-tier limit BEFORE calling the LLM.
  //     If the user is on the free tier (using the shared key, not their own BYOK key),
  //     we enforce the free-tier message limit. Users with their own BYOK key
  //     (providerUsed !== 'shared-openai') are NOT subject to the limit.
  if (modelInstance.providerUsed === 'shared-openai' && userId) {
    await usageService.checkAndIncrementUsage(userId);
  }

  // 2. Build messages with system prompt prepended
  const messages = buildMessagesWithSystemPrompt(systemPrompt, conversationHistory, userContent);
  messages._modelInstance = modelInstance; // attach for callLLM

  // 3. Call the LLM
  const result = await callLLM(messages, { temperature, maxTokens });

  // 4. Track usage for BYOK users too (non-blocking, don't fail the request if tracking fails)
  //     The free-tier check+increment already happened in step 1b.
  if (modelInstance.providerUsed !== 'shared-openai' && userId) {
    usageService.incrementUsage(userId).catch((err) => {
      console.error("❌ [chatService] Failed to track usage:", err.message);
    });
  }

  return result;
}

export {
  buildMessagesWithSystemPrompt,
  fetchAndDecryptKey,
  tryFreeTierFallback,
  resolveModel,
  callLLM,
  generateChatResponse,
};
