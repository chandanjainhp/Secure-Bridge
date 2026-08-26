import { z } from "zod";

// ============================================================
// SHARED PRIMITIVES
// ============================================================

// Allowed homomorphic operations — prevents arbitrary string injection
const operationEnum = z.enum([
  "addition",
  "multiplication",
  "rotation",
  "bootstrapping",
  "encrypted_chat",
  "sentiment_analysis",
  "keyword_search",
  "word_count",
  "similarity_check",
  "content_filter",
]);

// Encrypted data object shape (ciphertext + metadata from the FHE service)
const encryptedDataSchema = z.object({
  ciphertext: z
    .string()
    .min(1, "ciphertext is required"),
  metadata: z
    .record(z.any())
    .optional(),
}).passthrough(); // Allow extra fields the FHE service may include

// Context object — limited size to prevent abuse
const contextSchema = z
  .record(z.any())
  .optional()
  .default({})
  .refine(
    (ctx) => JSON.stringify(ctx).length <= 8192,
    "Context object exceeds maximum size (8KB)"
  );

// ============================================================
// POST /encrypt
// ============================================================

export const encryptSchema = z.object({
  body: z.object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(16384, "Message exceeds maximum length (16KB)"),
  }),
});

// ============================================================
// POST /decrypt
// ============================================================

export const decryptSchema = z.object({
  body: z.object({
    encryptedData: encryptedDataSchema,
  }),
});

// ============================================================
// POST /compute
// ============================================================

export const computeSchema = z.object({
  body: z.object({
    operation: operationEnum,
    inputs: z
      .array(z.any())
      .min(1, "At least one input is required")
      .max(20, "Too many inputs (max 20)"),
  }),
});

// ============================================================
// POST /ai-chat
// ============================================================

export const aiChatSchema = z.object({
  body: z.object({
    message: z
      .string()
      .trim()
      .min(1, "Message is required")
      .max(16384, "Message exceeds maximum length (16KB)"),
    operation: operationEnum.optional().default("encrypted_chat"),
    context: contextSchema,
  }),
});

// ============================================================
// POST /compute-with-ai
// ============================================================

export const computeWithAiSchema = z.object({
  body: z.object({
    operation: operationEnum,
    inputs: z
      .array(z.any())
      .min(1, "At least one input is required")
      .max(20, "Too many inputs (max 20)"),
    originalQuery: z
      .string()
      .trim()
      .max(8192, "Original query exceeds maximum length (8KB)")
      .optional()
      .default("Homomorphic computation"),
    context: contextSchema,
  }),
});
