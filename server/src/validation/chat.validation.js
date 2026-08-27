import { z } from "zod";

// ============================================================
// SHARED PRIMITIVES
// ============================================================

const providerEnum = z.enum(["auto", "local", "google", "openai", "anthropic"]);

/**
 * A single chat message in OpenAI format.
 * - role: who is speaking
 * - content: the text (max 32KB to prevent abuse)
 *
 * The AI SDK accepts this shape directly — no conversion needed.
 */
const messageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z
    .string()
    .trim()
    .min(1, "Message content cannot be empty")
    .max(32768, "Message content exceeds maximum length (32KB)"),
});

// ============================================================
// POST /completions
// ============================================================

export const completionsSchema = z.object({
  body: z.object({
    model: z
      .string()
      .trim()
      .min(1, "Model is required")
      .max(100, "Model name too long")
      .optional(),
    systemPrompt: z.string().trim().max(4000).optional(),
    messages: z
      .array(messageSchema)
      .min(1, "At least one message is required")
      .max(50, "Too many messages (max 50)"),
    temperature: z
      .number()
      .min(0, "Temperature must be >= 0")
      .max(2, "Temperature must be <= 2")
      .optional()
      .default(0.7),
    max_tokens: z
      .number()
      .int("max_tokens must be an integer")
      .min(1, "max_tokens must be at least 1")
      .max(8192, "max_tokens exceeds maximum (8192)")
      .optional()
      .default(1000),
    stream: z
      .boolean()
      .optional()
      .default(false),
    top_p: z
      .number()
      .min(0)
      .max(1)
      .optional(),
    stop: z
      .array(z.string().trim().min(1))
      .max(4, "Maximum 4 stop sequences")
      .optional(),
  }),
  headers: z.object({
    "x-provider": providerEnum.optional(),
  }),
});

// ============================================================
// GET /models
// ============================================================

export const getModelsSchema = z.object({
  query: z.object({
    provider: z
      .enum(["all", "local", "google", "openai", "anthropic"])
      .optional()
      .default("all"),
  }),
});
