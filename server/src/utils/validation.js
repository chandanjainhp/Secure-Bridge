import { body, param, query, validationResult } from 'express-validator';
import { ApiError } from './ApiError.js';

// Validation middleware to handle validation errors
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.path || error.param,
      message: error.msg,
      value: error.value
    }));
    
    throw new ApiError(400, 'Validation failed', errorMessages);
  }
  next();
};

// Common validation rules
export const commonValidations = {
  // API Key name validation
  apiKeyName: body('name')
    .trim()
    .notEmpty()
    .withMessage('API key name is required')
    .isLength({ min: 3, max: 100 })
    .withMessage('API key name must be between 3 and 100 characters')
    .matches(/^[a-zA-Z0-9\s\-_\.]+$/)
    .withMessage('API key name can only contain letters, numbers, spaces, hyphens, underscores, and dots'),

  // Description validation
  description: body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),

  // Permissions validation
  permissions: body('permissions')
    .optional()
    .isArray()
    .withMessage('Permissions must be an array')
    .custom((permissions) => {
      const validPermissions = [
        'chat.access', 'chat.completions', 'chat.streaming',
        'fhe.encrypt', 'fhe.decrypt', 'fhe.compute', 'fhe.ai_chat',
        'mcp.connect', 'mcp.tools',
        'user.read', 'user.write',
        'admin.read', 'admin.write',
        'analytics.read',
        'keys.read', 'keys.write', 'keys.delete'
      ];
      
      const invalidPermissions = permissions.filter(p => !validPermissions.includes(p));
      if (invalidPermissions.length > 0) {
        throw new Error(`Invalid permissions: ${invalidPermissions.join(', ')}`);
      }
      return true;
    }),

  // Rate limit validation
  rateLimit: body('rateLimit')
    .optional()
    .custom((rateLimit) => {
      if (typeof rateLimit !== 'object') {
        throw new Error('Rate limit must be an object');
      }
      
      const { requestsPerMinute, requestsPerHour, requestsPerDay } = rateLimit;
      
      if (requestsPerMinute !== undefined) {
        if (!Number.isInteger(requestsPerMinute) || requestsPerMinute < 1 || requestsPerMinute > 1000) {
          throw new Error('Requests per minute must be an integer between 1 and 1000');
        }
      }
      
      if (requestsPerHour !== undefined) {
        if (!Number.isInteger(requestsPerHour) || requestsPerHour < 1 || requestsPerHour > 50000) {
          throw new Error('Requests per hour must be an integer between 1 and 50000');
        }
      }
      
      if (requestsPerDay !== undefined) {
        if (!Number.isInteger(requestsPerDay) || requestsPerDay < 1 || requestsPerDay > 1000000) {
          throw new Error('Requests per day must be an integer between 1 and 1000000');
        }
      }
      
      return true;
    }),

  // Expiration date validation
  expiresAt: body('expiresAt')
    .optional()
    .custom((value) => {
      if (value === null) return true; // Allow null for no expiration
      
      const date = new Date(value);
      if (isNaN(date.getTime())) {
        throw new Error('Invalid expiration date');
      }
      
      if (date <= new Date()) {
        throw new Error('Expiration date must be in the future');
      }
      
      // Limit to 10 years in the future
      const maxDate = new Date();
      maxDate.setFullYear(maxDate.getFullYear() + 10);
      if (date > maxDate) {
        throw new Error('Expiration date cannot be more than 10 years in the future');
      }
      
      return true;
    }),

  // IP whitelist validation
  ipWhitelist: body('ipWhitelist')
    .optional()
    .isArray()
    .withMessage('IP whitelist must be an array')
    .custom((ips) => {
      const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
      const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(\/\d{1,3})?$/;
      
      const invalidIps = ips.filter(ip => {
        if (ip === '*') return false; // Allow wildcard
        if (ipv4Regex.test(ip) || ipv6Regex.test(ip)) return false;
        return true;
      });
      
      if (invalidIps.length > 0) {
        throw new Error(`Invalid IP addresses: ${invalidIps.join(', ')}`);
      }
      
      return true;
    }),

  // Domain whitelist validation
  domainWhitelist: body('domainWhitelist')
    .optional()
    .isArray()
    .withMessage('Domain whitelist must be an array')
    .custom((domains) => {
      const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
      
      const invalidDomains = domains.filter(domain => {
        if (domain === '*') return false; // Allow wildcard
        if (domainRegex.test(domain)) return false;
        return true;
      });
      
      if (invalidDomains.length > 0) {
        throw new Error(`Invalid domains: ${invalidDomains.join(', ')}`);
      }
      
      return true;
    }),

  // External API key validation
  externalKey: body('externalKey')
    .optional()
    .custom((value, { req }) => {
      if (!value && req.body.provider) {
        throw new Error('External API key is required when provider is specified');
      }
      
      if (value && !req.body.provider) {
        throw new Error('Provider is required when external API key is specified');
      }
      
      if (value) {
        // Basic length validation
        if (value.length < 20 || value.length > 200) {
          throw new Error('External API key must be between 20 and 200 characters');
        }
        
        // Check for common patterns that might indicate it's not a real key
        if (/^(test|demo|example|placeholder)/i.test(value)) {
          throw new Error('Invalid API key format');
        }
      }
      
      return true;
    }),

  // Provider validation
  provider: body('provider')
    .optional()
    .isIn(['openai', 'anthropic', 'google', 'azure', 'cohere', 'huggingface', 'replicate', 'custom'])
    .withMessage('Invalid provider'),

  // Status validation
  status: body('status')
    .optional()
    .isIn(['active', 'revoked', 'expired', 'suspended'])
    .withMessage('Invalid status'),

  // MongoDB ObjectId validation
  objectId: param('keyId')
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage('Invalid API key ID'),

  // Pagination validation
  page: query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer')
    .toInt(),

  limit: query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100')
    .toInt(),

  // Search validation
  search: query('search')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Search query must be between 1 and 100 characters'),

  // Sort validation
  sortBy: query('sortBy')
    .optional()
    .isIn(['name', 'createdAt', 'lastUsed', 'status', 'provider'])
    .withMessage('Invalid sort field'),

  sortOrder: query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
};

// Composed validation chains for different endpoints
export const validationChains = {
  // Create API key validation
  createApiKey: [
    commonValidations.apiKeyName,
    commonValidations.description,
    commonValidations.permissions,
    commonValidations.rateLimit,
    commonValidations.expiresAt,
    commonValidations.ipWhitelist,
    commonValidations.domainWhitelist,
    commonValidations.externalKey,
    commonValidations.provider,
    handleValidationErrors
  ],

  // Update API key validation
  updateApiKey: [
    commonValidations.objectId,
    commonValidations.apiKeyName.optional(),
    commonValidations.description,
    commonValidations.permissions,
    commonValidations.rateLimit,
    commonValidations.expiresAt,
    commonValidations.ipWhitelist,
    commonValidations.domainWhitelist,
    commonValidations.status,
    handleValidationErrors
  ],

  // Get API key validation
  getApiKey: [
    commonValidations.objectId,
    handleValidationErrors
  ],

  // List API keys validation
  listApiKeys: [
    commonValidations.page,
    commonValidations.limit,
    commonValidations.search,
    commonValidations.sortBy,
    commonValidations.sortOrder,
    query('includeRevoked')
      .optional()
      .isBoolean()
      .withMessage('includeRevoked must be a boolean')
      .toBoolean(),
    query('provider')
      .optional()
      .isIn(['openai', 'anthropic', 'google', 'azure', 'cohere', 'huggingface', 'replicate', 'custom'])
      .withMessage('Invalid provider filter'),
    handleValidationErrors
  ],

  // Validate external key format
  validateExternalKey: [
    body('apiKey')
      .notEmpty()
      .withMessage('API key is required')
      .isLength({ min: 20, max: 200 })
      .withMessage('API key must be between 20 and 200 characters'),
    body('provider')
      .notEmpty()
      .withMessage('Provider is required')
      .isIn(['openai', 'anthropic', 'google', 'azure', 'cohere', 'huggingface', 'replicate', 'custom'])
      .withMessage('Invalid provider'),
    handleValidationErrors
  ],

  // Analytics validation
  getAnalytics: [
    commonValidations.objectId,
    query('startDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid start date format'),
    query('endDate')
      .optional()
      .isISO8601()
      .withMessage('Invalid end date format'),
    query('granularity')
      .optional()
      .isIn(['hour', 'day', 'month'])
      .withMessage('Granularity must be hour, day, or month'),
    query('includeEndpoints')
      .optional()
      .isBoolean()
      .withMessage('includeEndpoints must be a boolean')
      .toBoolean(),
    handleValidationErrors
  ]
};

// Custom sanitization functions
export const sanitizers = {
  // Sanitize API key name
  sanitizeApiKeyName: (name) => {
    return name
      .trim()
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[^\w\s\-_.]/g, '') // Remove special characters except allowed ones
      .substring(0, 100); // Truncate to max length
  },

  // Sanitize description
  sanitizeDescription: (description) => {
    if (!description) return '';
    return description
      .trim()
      .replace(/\s+/g, ' ')
      .substring(0, 500);
  },

  // Sanitize IP addresses
  sanitizeIpList: (ips) => {
    if (!Array.isArray(ips)) return [];
    return ips
      .filter(ip => typeof ip === 'string')
      .map(ip => ip.trim())
      .filter(ip => ip.length > 0)
      .slice(0, 20); // Limit to 20 IPs
  },

  // Sanitize domain list
  sanitizeDomainList: (domains) => {
    if (!Array.isArray(domains)) return [];
    return domains
      .filter(domain => typeof domain === 'string')
      .map(domain => domain.trim().toLowerCase())
      .filter(domain => domain.length > 0)
      .slice(0, 20); // Limit to 20 domains
  }
};

// Provider-specific validation functions
export const providerValidations = {
  validateOpenAI: (apiKey) => {
    const pattern = /^sk-[A-Za-z0-9]{48}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey) 
        ? 'Valid OpenAI API key format' 
        : 'OpenAI API keys must start with "sk-" followed by 48 alphanumeric characters'
    };
  },

  validateAnthropic: (apiKey) => {
    const pattern = /^sk-ant-api\d{2}-[A-Za-z0-9_-]{95}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey)
        ? 'Valid Anthropic API key format'
        : 'Anthropic API keys must start with "sk-ant-api" followed by specific format'
    };
  },

  validateGoogle: (apiKey) => {
    const pattern = /^AIza[A-Za-z0-9_-]{35}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey)
        ? 'Valid Google AI API key format'
        : 'Google AI API keys must start with "AIza" and be 39 characters total'
    };
  },

  validateAzure: (apiKey) => {
    const pattern = /^[a-f0-9]{32}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey)
        ? 'Valid Azure OpenAI API key format'
        : 'Azure OpenAI API keys must be 32 character hexadecimal strings'
    };
  },

  validateCohere: (apiKey) => {
    const pattern = /^[A-Za-z0-9_-]{40,}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey)
        ? 'Valid Cohere API key format'
        : 'Cohere API keys must be at least 40 alphanumeric characters'
    };
  },

  validateHuggingFace: (apiKey) => {
    const pattern = /^hf_[A-Za-z0-9]{37}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey)
        ? 'Valid HuggingFace API key format'
        : 'HuggingFace API keys must start with "hf_" followed by 37 characters'
    };
  },

  validateReplicate: (apiKey) => {
    const pattern = /^r8_[A-Za-z0-9]{24}$/;
    return {
      valid: pattern.test(apiKey),
      message: pattern.test(apiKey)
        ? 'Valid Replicate API key format'
        : 'Replicate API keys must start with "r8_" followed by 24 characters'
    };
  },

  validateCustom: (apiKey) => {
    const isValid = apiKey.length >= 20 && apiKey.length <= 200;
    return {
      valid: isValid,
      message: isValid
        ? 'Valid custom API key format'
        : 'Custom API keys must be between 20 and 200 characters'
    };
  }
};
