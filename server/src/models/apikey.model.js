import mongoose, { Schema } from "mongoose";
import crypto from "crypto";
import { encryptApiKey, decryptApiKey } from "../services/apiKeyEncryption.js";

// Subdocument schemas with suppressReservedKeysWarning
const endpointUsageSchema = new Schema({
  path: String,
  method: String,
  count: { type: Number, default: 0 }
}, { suppressReservedKeysWarning: true, _id: false });

const dailyUsageSchema = new Schema({
  date: { type: Date, required: true },
  requests: { type: Number, default: 0, min: 0 },
  endpoints: [endpointUsageSchema],
  errors: { type: Number, default: 0, min: 0 },
  averageResponseTime: { type: Number, default: 0, min: 0 }
}, { suppressReservedKeysWarning: true, _id: false });

const monthlyUsageSchema = new Schema({
  month: { type: String, required: true }, // Format: YYYY-MM
  requests: { type: Number, default: 0, min: 0 },
  errors: { type: Number, default: 0, min: 0 }
}, { suppressReservedKeysWarning: true, _id: false });

// Enhanced API Key Schema with comprehensive security and management features
const apiKeySchema = new Schema(
  {
    // Basic Information
    name: {
      type: String,
      required: [true, "API key name is required"],
      trim: true,
      maxlength: [100, "Name cannot exceed 100 characters"],
      validate: {
        validator: function(v) {
          return v && v.length >= 3;
        },
        message: 'Name must be at least 3 characters long'
      }
    },
    description: {
      type: String,
      trim: true,
      maxlength: [500, "Description cannot exceed 500 characters"]
    },
    
    // Key Management
    key: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    keyPrefix: {
      type: String,
      required: true
      // index: true - Removed duplicate, using schema.index() instead
    },
    hashedKey: {
      type: String,
      required: true,
      index: true
    },
    
    // User Association
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    
    // External API Keys Support
    isExternal: {
      type: Boolean,
      default: false,
      index: true
    },
    externalProvider: {
      type: String,
      enum: ['openai', 'anthropic', 'google', 'google_ai_studio', 'azure', 'cohere', 'huggingface', 'replicate', 'custom'],
      required: function() { return this.isExternal; }
    },
    externalKeyEncrypted: {
      type: String,
      required: function() { return this.isExternal; }
    },
    encryptionIV: {
      type: String,
      required: function() { return this.isExternal; }
    },
    encryptionTag: {
      type: String,
      required: function() { return this.isExternal; }
    },
    
    // Enhanced Permissions System
    permissions: [{
      type: String,
      enum: [
        "chat.access",
        "chat.completions",
        "chat.streaming", 
        "fhe.encrypt",
        "fhe.decrypt",
        "fhe.compute",
        "fhe.ai_chat",
        "mcp.connect",
        "mcp.tools",
        "user.read",
        "user.write",
        "admin.read",
        "admin.write",
        "analytics.read",
        "keys.read",
        "keys.write",
        "keys.delete"
      ]
    }],
    
    // Enhanced Status Management
    status: {
      type: String,
      enum: ["active", "revoked", "expired", "suspended"],
      default: "active",
      index: true
    },
    
    // Comprehensive Rate Limiting
    rateLimit: {
      requestsPerMinute: {
        type: Number,
        default: 60,
        min: [1, 'Requests per minute must be at least 1'],
        max: [1000, 'Requests per minute cannot exceed 1000']
      },
      requestsPerHour: {
        type: Number,
        default: 1000,
        min: [1, 'Requests per hour must be at least 1'],
        max: [50000, 'Requests per hour cannot exceed 50000']
      },
      requestsPerDay: {
        type: Number,
        default: 10000,
        min: [1, 'Requests per day must be at least 1'],
        max: [1000000, 'Requests per day cannot exceed 1000000']
      }
    },
    
    // Enhanced Usage Tracking
    usage: {
      totalRequests: {
        type: Number,
        default: 0,
        min: 0
      },
      lastUsed: {
        type: Date
      },
      firstUsed: {
        type: Date
      },
      dailyUsage: [dailyUsageSchema],
      monthlyUsage: [monthlyUsageSchema]
    },
    // Enhanced Expiration Management
    expiresAt: {
      type: Date,
      default: null, // null means no expiration
      validate: {
        validator: function(v) {
          return !v || v > new Date();
        },
        message: 'Expiration date must be in the future'
      }
    },
    lastRegeneratedAt: {
      type: Date,
      default: Date.now
    },
    
    // Enhanced Security Features
    ipWhitelist: [{
      type: String,
      validate: {
        validator: function(v) {
          // Enhanced IP validation (supports IPv4, IPv6, and CIDR)
          const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}(\/\d{1,2})?$/;
          const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}(\/\d{1,3})?$/;
          return v === '*' || ipv4Regex.test(v) || ipv6Regex.test(v);
        },
        message: 'Invalid IP address format'
      }
    }],
    domainWhitelist: [{
      type: String,
      validate: {
        validator: function(v) {
          // Domain validation
          const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
          return v === '*' || domainRegex.test(v);
        },
        message: 'Invalid domain format'
      }
    }],
    
    // API Testing Configuration
    testConfiguration: {
      enabled: {
        type: Boolean,
        default: true
      },
      lastTestedAt: Date,
      testResults: [{
        timestamp: { type: Date, default: Date.now },
        success: { type: Boolean, required: true },
        responseTime: Number, // in milliseconds
        errorMessage: String,
        statusCode: Number
      }]
    },
    
    // Advanced Settings
    settings: {
      allowConcurrentRequests: {
        type: Boolean,
        default: true
      },
      logRequests: {
        type: Boolean,
        default: true
      },
      notifyOnLimitReached: {
        type: Boolean,
        default: true
      },
      autoRotate: {
        enabled: { type: Boolean, default: false },
        intervalDays: { type: Number, default: 90 }
      }
    },
    
    // Audit Trail
    auditLog: [{
      action: {
        type: String,
        enum: ['created', 'updated', 'regenerated', 'revoked', 'tested', 'used', 'revealed'],
        required: true
      },
      timestamp: { type: Date, default: Date.now },
      userId: { type: Schema.Types.ObjectId, ref: 'User' },
      ipAddress: String,
      userAgent: String,
      details: Schema.Types.Mixed
    }]
  },
  {
    timestamps: true,
    suppressReservedKeysWarning: true, // Suppress warning for 'errors' field
    toJSON: {
      transform: function(doc, ret) {
        // Always strip encrypted fields from JSON responses
        delete ret.hashedKey;
        delete ret.externalKeyEncrypted;
        delete ret.encryptionIV;
        delete ret.encryptionTag;
        return ret;
      }
    },
    // Add text index for search functionality
    indexes: [
      { name: 'text', description: 'text' }
    ]
  }
);

// Enhanced Static Methods
// Generate a new internal API key with improved security
apiKeySchema.statics.generateKey = function() {
  const prefix = 'sk';
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const timestamp = Date.now().toString(36);
  const key = `${prefix}-${timestamp}-${randomBytes}`;
  const hashedKey = crypto.createHash('sha256').update(key).digest('hex');
  
  return {
    key,
    keyPrefix: prefix,
    hashedKey
  };
};

// Enhanced key verification with detailed response
apiKeySchema.statics.verifyKey = function(providedKey) {
  const hashedKey = crypto.createHash('sha256').update(providedKey).digest('hex');
  return this.findOne({ 
    hashedKey, 
    status: 'active',
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  }).populate('userId', 'fullName email username isAdmin');
};

// Validate external API key format
apiKeySchema.statics.validateExternalKeyFormat = function(apiKey, provider) {
  const validations = {
    openai: {
      pattern: /^sk-[A-Za-z0-9]{48}$/,
      description: 'OpenAI keys start with "sk-" followed by 48 characters'
    },
    anthropic: {
      pattern: /^sk-ant-api\d{2}-[A-Za-z0-9_-]{95}$/,
      description: 'Anthropic keys start with "sk-ant-api" followed by specific format'
    },
    google: {
      pattern: /^AIza[A-Za-z0-9_-]{35}$/,
      description: 'Google AI keys start with "AIza" and are 39 characters total'
    },
    google_ai_studio: {
      pattern: /^AIza[A-Za-z0-9_-]{35}$/,
      description: 'Google AI Studio keys start with "AIza" and are 39 characters total'
    },
    azure: {
      pattern: /^[a-f0-9]{32}$/,
      description: 'Azure OpenAI keys are 32 character hexadecimal strings'
    },
    cohere: {
      pattern: /^[A-Za-z0-9_-]{40,}$/,
      description: 'Cohere keys are alphanumeric with minimum 40 characters'
    },
    huggingface: {
      pattern: /^hf_[A-Za-z0-9]{37}$/,
      description: 'HuggingFace keys start with "hf_" followed by 37 characters'
    },
    replicate: {
      pattern: /^r8_[A-Za-z0-9]{24}$/,
      description: 'Replicate keys start with "r8_" followed by 24 characters'
    },
    custom: {
      pattern: /^.{20,200}$/,
      description: 'Custom API keys should be 20-200 characters'
    }
  };

  const validation = validations[provider];
  
  if (!validation) {
    return { valid: false, message: 'Unsupported provider', provider };
  }

  const isValid = validation.pattern.test(apiKey);
  
  return {
    valid: isValid,
    message: isValid ? 'Valid format' : `Invalid format. ${validation.description}`,
    provider
  };
};

// Encryption utilities for external API keys
apiKeySchema.statics.encryptExternalKey = function(plainKey) {
  return encryptApiKey(plainKey);
};

apiKeySchema.statics.decryptExternalKey = function(encryptedData) {
  return decryptApiKey(encryptedData);
};

// Enhanced Instance Methods
// Method to increment usage with detailed tracking
apiKeySchema.methods.incrementUsage = async function(requestDetails = {}) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const thisMonth = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
  
  // Update total requests and usage timestamps
  this.usage.totalRequests += 1;
  this.usage.lastUsed = new Date();
  
  if (!this.usage.firstUsed) {
    this.usage.firstUsed = new Date();
  }
  
  // Update daily usage
  const todayUsage = this.usage.dailyUsage.find(
    usage => usage.date.getTime() === today.getTime()
  );
  
  if (todayUsage) {
    todayUsage.requests += 1;
    if (requestDetails.error) todayUsage.errors += 1;
    
    // Update endpoint tracking
    if (requestDetails.endpoint) {
      const endpointStat = todayUsage.endpoints.find(
        ep => ep.path === requestDetails.endpoint.path && ep.method === requestDetails.endpoint.method
      );
      if (endpointStat) {
        endpointStat.count += 1;
      } else {
        todayUsage.endpoints.push({
          path: requestDetails.endpoint.path,
          method: requestDetails.endpoint.method,
          count: 1
        });
      }
    }
    
    // Update response time tracking
    if (requestDetails.responseTime) {
      const totalTime = todayUsage.averageResponseTime * (todayUsage.requests - 1);
      todayUsage.averageResponseTime = (totalTime + requestDetails.responseTime) / todayUsage.requests;
    }
  } else {
    this.usage.dailyUsage.push({
      date: today,
      requests: 1,
      endpoints: requestDetails.endpoint ? [{
        path: requestDetails.endpoint.path,
        method: requestDetails.endpoint.method,
        count: 1
      }] : [],
      errors: requestDetails.error ? 1 : 0,
      averageResponseTime: requestDetails.responseTime || 0
    });
  }
  
  // Update monthly usage
  const monthUsage = this.usage.monthlyUsage.find(usage => usage.month === thisMonth);
  if (monthUsage) {
    monthUsage.requests += 1;
    if (requestDetails.error) monthUsage.errors += 1;
  } else {
    this.usage.monthlyUsage.push({
      month: thisMonth,
      requests: 1,
      errors: requestDetails.error ? 1 : 0
    });
  }
  
  // Keep only last 30 days of daily usage
  this.usage.dailyUsage = this.usage.dailyUsage
    .sort((a, b) => b.date - a.date)
    .slice(0, 30);
  
  // Keep only last 12 months of monthly usage
  this.usage.monthlyUsage = this.usage.monthlyUsage
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, 12);
  
  await this.save();
};

// Enhanced rate limit checking with multiple tiers
apiKeySchema.methods.checkRateLimit = function() {
  const now = new Date();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const currentHour = new Date();
  currentHour.setMinutes(0, 0, 0);
  const currentMinute = new Date();
  currentMinute.setSeconds(0, 0);
  
  // Check daily limit
  const todayUsage = this.usage.dailyUsage.find(
    usage => usage.date.getTime() === today.getTime()
  );
  const dailyRequests = todayUsage ? todayUsage.requests : 0;
  
  if (dailyRequests >= this.rateLimit.requestsPerDay) {
    return {
      allowed: false,
      reason: 'Daily rate limit exceeded',
      resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000),
      current: dailyRequests,
      limit: this.rateLimit.requestsPerDay
    };
  }
  
  // For more granular limits, you'd need additional tracking
  // This is a simplified version
  return {
    allowed: true,
    remaining: {
      daily: this.rateLimit.requestsPerDay - dailyRequests,
      hourly: this.rateLimit.requestsPerHour || 'unlimited',
      minute: this.rateLimit.requestsPerMinute || 'unlimited'
    },
    resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000)
  };
};

// Enhanced permission checking
apiKeySchema.methods.hasPermission = function(permission) {
  return this.permissions.includes(permission);
};

apiKeySchema.methods.hasAnyPermission = function(permissionList) {
  return permissionList.some(permission => this.permissions.includes(permission));
};

apiKeySchema.methods.hasAllPermissions = function(permissionList) {
  return permissionList.every(permission => this.permissions.includes(permission));
};

// Audit logging method
apiKeySchema.methods.logAuditEvent = function(action, userId, ipAddress, userAgent, details = {}) {
  this.auditLog.push({
    action,
    userId,
    ipAddress,
    userAgent,
    details
  });
  
  // Keep only last 1000 audit entries
  if (this.auditLog.length > 1000) {
    this.auditLog = this.auditLog.slice(-1000);
  }
};

// Test external API key
apiKeySchema.methods.testExternalKey = async function() {
  if (!this.isExternal) {
    throw new Error('This method is only for external API keys');
  }
  
  try {
    const decryptedKey = this.constructor.decryptExternalKey({
      encrypted: this.externalKeyEncrypted,
      iv: this.encryptionIV,
      tag: this.encryptionTag
    });
    
    // Test based on provider
    let testResult;
    const startTime = Date.now();
    
    switch (this.externalProvider) {
      case 'openai':
        testResult = await this._testOpenAIKey(decryptedKey);
        break;
      case 'anthropic':
        testResult = await this._testAnthropicKey(decryptedKey);
        break;
      case 'google':
        testResult = await this._testGoogleKey(decryptedKey);
        break;
      default:
        testResult = { success: false, message: 'Provider testing not implemented' };
    }
    
    const responseTime = Date.now() - startTime;
    
    // Log test result
    this.testConfiguration.lastTestedAt = new Date();
    this.testConfiguration.testResults.push({
      success: testResult.success,
      responseTime,
      errorMessage: testResult.message || null,
      statusCode: testResult.statusCode || null
    });
    
    // Keep only last 10 test results
    if (this.testConfiguration.testResults.length > 10) {
      this.testConfiguration.testResults = this.testConfiguration.testResults.slice(-10);
    }
    
    await this.save();
    return { ...testResult, responseTime };
    
  } catch (error) {
    return {
      success: false,
      message: error.message,
      responseTime: 0
    };
  }
};

// Private test methods for different providers
apiKeySchema.methods._testOpenAIKey = async function(key) {
  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });
    
    if (response.ok) {
      return { success: true, message: 'OpenAI API key is valid', statusCode: response.status };
    } else {
      return { success: false, message: 'OpenAI API key is invalid', statusCode: response.status };
    }
  } catch (error) {
    return { success: false, message: `OpenAI API test failed: ${error.message}` };
  }
};

apiKeySchema.methods._testAnthropicKey = async function(key) {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-haiku-20240307',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      }),
      signal: AbortSignal.timeout(10000)
    });
    
    if (response.status === 400) {
      // 400 with proper error structure means the key is valid but request is malformed (expected)
      const errorData = await response.json().catch(() => ({}));
      if (errorData.type === 'invalid_request_error') {
        return { success: true, message: 'Anthropic API key is valid', statusCode: response.status };
      }
    }
    
    if (response.ok) {
      return { success: true, message: 'Anthropic API key is valid', statusCode: response.status };
    } else {
      return { success: false, message: 'Anthropic API key is invalid', statusCode: response.status };
    }
  } catch (error) {
    return { success: false, message: `Anthropic API test failed: ${error.message}` };
  }
};

apiKeySchema.methods._testGoogleKey = async function(key) {
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1/models?key=${key}`, {
      signal: AbortSignal.timeout(10000)
    });
    
    if (response.ok) {
      return { success: true, message: 'Google AI API key is valid', statusCode: response.status };
    } else {
      return { success: false, message: 'Google AI API key is invalid', statusCode: response.status };
    }
  } catch (error) {
    return { success: false, message: `Google AI API test failed: ${error.message}` };
  }
};

// Comprehensive indexing for efficient queries
apiKeySchema.index({ userId: 1, status: 1 });
apiKeySchema.index({ hashedKey: 1, status: 1 });
apiKeySchema.index({ keyPrefix: 1 });
apiKeySchema.index({ externalProvider: 1 });
apiKeySchema.index({ createdAt: -1 });
apiKeySchema.index({ 'usage.lastUsed': -1 });
apiKeySchema.index({ expiresAt: 1 }, { sparse: true });

// Text search index for name and description
apiKeySchema.index({ 
  name: 'text', 
  description: 'text' 
});

// Compound indexes for complex queries
apiKeySchema.index({ userId: 1, isExternal: 1, status: 1 });
apiKeySchema.index({ userId: 1, externalProvider: 1 });

// Pre-save middleware for validation and auto-updates
apiKeySchema.pre('save', function(next) {
  // Auto-expire keys that have passed their expiration date
  if (this.expiresAt && this.expiresAt <= new Date() && this.status === 'active') {
    this.status = 'expired';
  }
  
  // Ensure encrypted fields are present for external keys
  if (this.isExternal && !this.externalKeyEncrypted) {
    return next(new Error('External keys must be encrypted'));
  }
  
  next();
});

// Pre-remove middleware for cleanup
apiKeySchema.pre('remove', function(next) {
  // Log the removal in audit trail
  this.logAuditEvent('deleted', null, null, null, { reason: 'API key deleted' });
  next();
});

export const ApiKey = mongoose.model("ApiKey", apiKeySchema);
