import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import { ApiError } from '../utils/ApiError.js';

// Comprehensive security middleware configuration
export const securityMiddleware = {
  // Helmet for security headers
  helmet: helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.openai.com", "https://api.anthropic.com", "https://generativelanguage.googleapis.com"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),

  // MongoDB injection protection
  mongoSanitize: mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
      console.warn(`MongoDB injection attempt detected: ${key} in ${req.url}`);
    }
  }),

  // Response compression
  compression: compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  })
};

// Rate limiting configurations for different endpoints
export const rateLimiters = {
  // General API rate limiting
  general: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: {
      error: "Too many requests from this IP, please try again later.",
      retryAfter: "15 minutes"
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      throw new ApiError(429, "Rate limit exceeded", [], "Too many requests");
    }
  }),

  // Authentication endpoints (more strict)
  auth: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 login attempts per windowMs
    message: {
      error: "Too many authentication attempts from this IP, please try again later.",
      retryAfter: "15 minutes"
    },
    skipSuccessfulRequests: true,
    handler: (req, res) => {
      throw new ApiError(429, "Authentication rate limit exceeded", [], "Too many login attempts");
    }
  }),

  // API key creation (moderate)
  createApiKey: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 API key creations per hour
    message: {
      error: "Too many API keys created from this IP, please try again later.",
      retryAfter: "1 hour"
    },
    handler: (req, res) => {
      throw new ApiError(429, "API key creation rate limit exceeded", [], "Too many API keys created");
    }
  }),

  // API key testing (moderate)
  testApiKey: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 30, // Limit each IP to 30 tests per 5 minutes
    message: {
      error: "Too many API key tests from this IP, please try again later.",
      retryAfter: "5 minutes"
    },
    handler: (req, res) => {
      throw new ApiError(429, "API key test rate limit exceeded", [], "Too many test requests");
    }
  }),

  // External API validation (strict)
  validateExternal: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 50, // Limit each IP to 50 validations per 5 minutes
    message: {
      error: "Too many validation requests from this IP, please try again later.",
      retryAfter: "5 minutes"
    },
    handler: (req, res) => {
      throw new ApiError(429, "Validation rate limit exceeded", [], "Too many validation requests");
    }
  }),

  // Admin endpoints (very strict)
  admin: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // Limit each IP to 50 admin requests per windowMs
    message: {
      error: "Too many admin requests from this IP, please try again later.",
      retryAfter: "15 minutes"
    },
    handler: (req, res) => {
      throw new ApiError(429, "Admin rate limit exceeded", [], "Too many admin requests");
    }
  })
};

// Slow down middleware for suspicious activity
export const slowDownMiddleware = {
  // Gradual slowdown for repeated requests
  general: slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // Allow 50 requests per windowMs without delay
    delayMs: () => 500, // Fixed delay of 500ms per request after delayAfter
    maxDelayMs: 20000, // Maximum delay of 20 seconds
    skipFailedRequests: false,
    skipSuccessfulRequests: false,
    validate: { delayMs: false } // Disable validation warnings
  }),

  // More aggressive slowdown for auth endpoints
  auth: slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 2, // Allow only 2 requests per windowMs without delay
    delayMs: () => 2000, // Fixed delay of 2 seconds per request after delayAfter
    maxDelayMs: 60000, // Maximum delay of 1 minute
    validate: { delayMs: false } // Disable validation warnings
  })
};

// IP whitelisting middleware
export const ipWhitelist = (allowedIPs = []) => {
  return (req, res, next) => {
    if (allowedIPs.length === 0) {
      return next(); // No whitelist configured, allow all
    }

    const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    
    // Check if client IP is in whitelist
    const isAllowed = allowedIPs.some(allowedIP => {
      if (allowedIP === '*') return true;
      
      // Handle CIDR notation
      if (allowedIP.includes('/')) {
        const [network, mask] = allowedIP.split('/');
        const maskBits = parseInt(mask);
        const networkParts = network.split('.').map(Number);
        const clientParts = clientIP.split('.').map(Number);
        
        // Simple CIDR check (IPv4 only)
        const bytesToCheck = Math.ceil(maskBits / 8);
        for (let i = 0; i < bytesToCheck; i++) {
          const bitsInByte = Math.min(8, maskBits - (i * 8));
          const networkByte = networkParts[i] || 0;
          const clientByte = clientParts[i] || 0;
          const mask = (0xFF << (8 - bitsInByte)) & 0xFF;
          
          if ((networkByte & mask) !== (clientByte & mask)) {
            return false;
          }
        }
        return true;
      }
      
      return clientIP === allowedIP;
    });

    if (!isAllowed) {
      throw new ApiError(403, "IP address not whitelisted", [], "Forbidden");
    }

    next();
  };
};

// Domain validation middleware
export const domainValidation = (allowedDomains = []) => {
  return (req, res, next) => {
    if (allowedDomains.length === 0) {
      return next(); // No domain restrictions
    }

    const origin = req.get('origin') || req.get('referer');
    
    if (!origin) {
      throw new ApiError(400, "Origin header required", [], "Bad Request");
    }

    try {
      const url = new URL(origin);
      const domain = url.hostname;
      
      const isAllowed = allowedDomains.some(allowedDomain => {
        if (allowedDomain === '*') return true;
        if (allowedDomain.startsWith('*.')) {
          // Wildcard subdomain matching
          const baseDomain = allowedDomain.slice(2);
          return domain === baseDomain || domain.endsWith('.' + baseDomain);
        }
        return domain === allowedDomain;
      });

      if (!isAllowed) {
        throw new ApiError(403, "Domain not allowed", [], "Forbidden");
      }

      next();
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(400, "Invalid origin header", [], "Bad Request");
    }
  };
};

// Request size limiting middleware
export const requestSizeLimit = {
  // Small requests (for most API calls)
  small: (req, res, next) => {
    const contentLength = parseInt(req.get('content-length')) || 0;
    if (contentLength > 50 * 1024) { // 50KB limit
      throw new ApiError(413, "Request payload too large", [], "Payload Too Large");
    }
    next();
  },

  // Medium requests (for API key creation with descriptions)
  medium: (req, res, next) => {
    const contentLength = parseInt(req.get('content-length')) || 0;
    if (contentLength > 500 * 1024) { // 500KB limit
      throw new ApiError(413, "Request payload too large", [], "Payload Too Large");
    }
    next();
  },

  // Large requests (for bulk operations)
  large: (req, res, next) => {
    const contentLength = parseInt(req.get('content-length')) || 0;
    if (contentLength > 5 * 1024 * 1024) { // 5MB limit
      throw new ApiError(413, "Request payload too large", [], "Payload Too Large");
    }
    next();
  }
};

// Security headers middleware
export const securityHeaders = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  
  // Add custom security headers
  res.setHeader('X-API-Version', '1.0.0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Prevent caching of sensitive responses
  if (req.url.includes('/api-keys') || req.url.includes('/auth')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  
  next();
};

// Request logging middleware for security monitoring
const isDev = process.env.NODE_ENV === 'development';

export const securityLogging = (req, res, next) => {
  const startTime = Date.now();
  
  // Log suspicious patterns (only in development, or sanitized in production)
  const suspiciousPatterns = [
    /\.\./,  // Directory traversal
    /<script/i, // XSS attempts
    /union.*select/i, // SQL injection
    /javascript:/i, // JS injection
    /data:.*base64/i // Base64 data URLs
  ];
  
  const requestData = JSON.stringify(req.body);
  const hasSuspiciousPattern = suspiciousPatterns.some(pattern => 
    pattern.test(req.url) || pattern.test(requestData)
  );
  
  if (hasSuspiciousPattern && isDev) {
    console.warn('Suspicious request detected:', {
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.url,
      method: req.method,
      body: '[REDACTED in production]',
      timestamp: new Date().toISOString()
    });
  }
  
  // Override res.end to log response details
  const originalEnd = res.end;
  res.end = function(...args) {
    const responseTime = Date.now() - startTime;
    
    // Log API key operations (only in development)
    if (req.url.includes('/api-keys') && isDev) {
      console.log('API Key Operation:', {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        responseTime,
        userId: req.user?._id,
        ip: req.ip,
        timestamp: new Date().toISOString()
      });
    }
    
    originalEnd.apply(this, args);
  };
  
  next();
};
