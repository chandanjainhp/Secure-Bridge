import { z } from "zod";


const providerEnum = z.enum([
  "openai",
  "anthropic",
  "google",
  "azure",
  "cohere",
  "huggingface",
  "replicate",
  "custom",
]);

const keyIdParam = z.object({
  params: z.object({
    keyId: z
      .string()
      .trim()
      .min(1, "keyId is required"),
  }),
});

// --- GET /api-keys (list + filter) ---

export const getAllApiKeysSchema = z.object({
  query: z.object({
    includeRevoked: z.enum(["true", "false"]).optional().default("false"),
    search: z.string().trim().optional().default(""),
    provider: providerEnum.optional().default(null),
    sortBy: z
      .enum(["createdAt", "name", "updatedAt", "lastUsedAt"])
      .optional()
      .default("createdAt"),
    sortOrder: z.enum(["asc", "desc"]).optional().default("desc"),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  }),
});

// --- POST /api-keys (create) ---

export const createApiKeySchema = z.object({
  body: z.object({
    name: z
      .string()
      .trim()
      .min(1, "Name is required")
      .max(100, "Name must be at most 100 characters"),
    description: z
      .string()
      .trim()
      .max(500, "Description must be at most 500 characters")
      .optional()
      .default(""),
    permissions: z
      .array(z.string().trim().min(1))
      .optional()
      .default([]),
    rateLimit: z
      .object({
        requestsPerMinute: z.number().int().min(1).max(10000).optional(),
        requestsPerHour: z.number().int().min(1).max(100000).optional(),
        requestsPerDay: z.number().int().min(1).max(1000000).optional(),
      })
      .optional()
      .default({}),
    expiresAt: z
      .string()
      .datetime()
      .optional()
      .nullable()
      .transform((v) => (v ? new Date(v) : null)),
    ipWhitelist: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .refine(
            (ip) =>
              /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) ||
              /^[0-9a-fA-F:]+$/.test(ip),
            "Invalid IP address format"
          )
      )
      .optional()
      .default([]),
    domainWhitelist: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .refine(
            (d) => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(d),
            "Invalid domain format"
          )
      )
      .optional()
      .default([]),
    externalKey: z.string().trim().min(1).optional(),
    provider: providerEnum.optional(),
    settings: z.record(z.any()).optional().default({}),
  }),
});

// --- PATCH /api-keys/:keyId (update) ---

export const updateApiKeySchema = z.object({
  params: z.object({
    keyId: z.string().trim().min(1, "keyId is required"),
  }),
  body: z
    .object({
      name: z
        .string()
        .trim()
        .min(1, "Name cannot be empty")
        .max(100, "Name must be at most 100 characters")
        .optional(),
      description: z
        .string()
        .trim()
        .max(500, "Description must be at most 500 characters")
        .optional(),
      permissions: z.array(z.string().trim().min(1)).optional(),
      rateLimit: z
        .object({
          requestsPerMinute: z.number().int().min(1).max(10000).optional(),
          requestsPerHour: z.number().int().min(1).max(100000).optional(),
          requestsPerDay: z.number().int().min(1).max(1000000).optional(),
        })
        .optional(),
      ipWhitelist: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .refine(
              (ip) =>
                /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) || /^[0-9a-fA-F:]+$/.test(ip),
              "Invalid IP address format"
            )
        )
        .optional(),
      domainWhitelist: z
        .array(
          z
            .string()
            .trim()
            .min(1)
            .refine(
              (d) => /^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(d),
              "Invalid domain format"
            )
        )
        .optional(),
      settings: z.record(z.any()).optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided to update",
    }),
});

// --- POST /api-keys/:keyId/test ---

export const testApiKeySchema = z.object({
  params: z.object({
    keyId: z.string().trim().min(1, "keyId is required"),
  }),
  body: z.object({
    testType: z.enum(["basic", "full", "connectivity"]).optional().default("basic"),
  }),
});

// --- GET /api-keys/:keyId/analytics ---

export const getUsageAnalyticsSchema = z.object({
  params: z.object({
    keyId: z.string().trim().min(1, "keyId is required"),
  }),
  query: z.object({
    startDate: z
      .string()
      .datetime()
      .optional()
      .transform((v) => (v ? new Date(v) : null)),
    endDate: z
      .string()
      .datetime()
      .optional()
      .transform((v) => (v ? new Date(v) : null)),
    granularity: z.enum(["hour", "day", "week", "month"]).optional().default("day"),
    includeEndpoints: z.enum(["true", "false"]).optional().default("true"),
  }),
});

// --- POST /api-keys/validate-key-format (no auth) ---

export const validateExternalKeyFormatSchema = z.object({
  body: z.object({
    apiKey: z
      .string()
      .trim()
      .min(1, "apiKey is required"),
    provider: providerEnum,
  }),
});

// --- POST /api-keys/test-connectivity (auth) ---

export const testExternalKeyConnectivitySchema = z.object({
  body: z.object({
    apiKey: z
      .string()
      .trim()
      .min(1, "apiKey is required"),
    provider: providerEnum,
  }),
});

// --- POST /api-keys/bulk-update ---

export const bulkUpdateApiKeysSchema = z.object({
  body: z.object({
    keyIds: z
      .array(z.string().trim().min(1))
      .min(1, "keyIds must be a non-empty array")
      .max(50, "Cannot update more than 50 keys at once"),
    updates: z
      .object({
        name: z.string().trim().min(1).max(100).optional(),
        description: z.string().trim().max(500).optional(),
        permissions: z.array(z.string().trim().min(1)).optional(),
        rateLimit: z
          .object({
            requestsPerMinute: z.number().int().min(1).max(10000).optional(),
            requestsPerHour: z.number().int().min(1).max(100000).optional(),
            requestsPerDay: z.number().int().min(1).max(1000000).optional(),
          })
          .optional(),
        ipWhitelist: z.array(z.string().trim().min(1)).optional(),
        domainWhitelist: z.array(z.string().trim().min(1)).optional(),
        settings: z.record(z.any()).optional(),
      })
      .refine((data) => Object.keys(data).length > 0, {
        message: "At least one field must be provided to update",
      }),
  }),
});

// --- GET /api-keys/export ---

export const exportApiKeysSchema = z.object({
  query: z.object({
    includeRevoked: z.enum(["true", "false"]).optional().default("false"),
    format: z.enum(["json", "csv"]).optional().default("json"),
  }),
});

// Reuse for getApiKeyDetails, regenerateApiKey, revokeApiKey, revealExternalApiKey
export { keyIdParam };
