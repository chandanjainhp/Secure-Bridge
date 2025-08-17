import { ApiKey } from "../models/apikey.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

// Middleware to verify API key
export const verifyApiKey = (...requiredPermissions) => {
  return asyncHandler(async (req, res, next) => {
    try {
      // Get API key from headers
      const apiKey = req.header("X-API-Key") || req.header("Authorization")?.replace("Bearer ", "");
      
      if (!apiKey) {
        throw new ApiError(401, "API key is required");
      }
      
      // Verify the API key
      const keyRecord = await ApiKey.verifyKey(apiKey);
      
      if (!keyRecord) {
        throw new ApiError(401, "Invalid or expired API key");
      }
      
      // Check if API key is active
      if (keyRecord.status !== 'active') {
        throw new ApiError(401, "API key is revoked or inactive");
      }
      
      // Check rate limits
      const rateLimitCheck = keyRecord.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        throw new ApiError(429, `Rate limit exceeded: ${rateLimitCheck.reason}`, {
          resetTime: rateLimitCheck.resetTime
        });
      }
      
      // Check permissions if required
      if (requiredPermissions.length > 0) {
        const hasAllPermissions = requiredPermissions.every(permission => 
          keyRecord.hasPermission(permission)
        );
        
        if (!hasAllPermissions) {
          throw new ApiError(403, "Insufficient permissions for this operation");
        }
      }
      
      // Check IP whitelist if configured
      if (keyRecord.ipWhitelist.length > 0 && !keyRecord.ipWhitelist.includes('*')) {
        const clientIP = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
        const isAllowed = keyRecord.ipWhitelist.some(allowedIP => {
          if (allowedIP.includes('/')) {
            // CIDR notation - basic check
            const [network, mask] = allowedIP.split('/');
            return clientIP.startsWith(network.split('.').slice(0, Math.ceil(parseInt(mask) / 8)).join('.'));
          }
          return clientIP === allowedIP;
        });
        
        if (!isAllowed) {
          throw new ApiError(403, "IP address not whitelisted");
        }
      }
      
      // Increment usage (async, don't block the request)
      keyRecord.incrementUsage().catch(err => {
        console.error('Failed to increment API key usage:', err);
      });
      
      // Add API key info to request
      req.apiKey = keyRecord;
      req.user = keyRecord.userId; // For compatibility with existing code
      
      // Add rate limit headers
      res.set({
        'X-RateLimit-Remaining-Daily': rateLimitCheck.remaining?.daily || 0,
        'X-RateLimit-Limit-Daily': keyRecord.rateLimit.requestsPerDay,
        'X-API-Key-ID': keyRecord._id.toString()
      });
      
      next();
    } catch (error) {
      throw new ApiError(
        error.statusCode || 401,
        error.message || "API key authentication failed"
      );
    }
  });
};

// Middleware that allows both JWT and API key authentication
export const verifyJWTOrApiKey = (...requiredPermissions) => {
  return asyncHandler(async (req, res, next) => {
    // Check for API key first
    const apiKey = req.header("X-API-Key") || 
                   (req.header("Authorization")?.startsWith("Bearer sk-") ? 
                    req.header("Authorization").replace("Bearer ", "") : null);
    
    if (apiKey && apiKey.startsWith('sk-')) {
      // Use API key authentication
      return verifyApiKey(...requiredPermissions)(req, res, next);
    } else {
      // Fall back to JWT authentication
      const { verifyJWT } = await import("./auth.middle.js");
      return verifyJWT(req, res, next);
    }
  });
};

// Middleware to extract API key usage analytics
export const trackApiUsage = asyncHandler(async (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Track response details if API key was used
    if (req.apiKey) {
      // Log API usage (could be sent to analytics service)
      const usageLog = {
        apiKeyId: req.apiKey._id,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        timestamp: new Date(),
        userAgent: req.get('User-Agent'),
        ip: req.ip
      };
      
      // Here you could send to analytics service
      console.log('API Usage:', usageLog);
    }
    
    originalSend.call(this, data);
  };
  
  next();
});
