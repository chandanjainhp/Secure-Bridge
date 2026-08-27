import { ApiKey } from "../features/api-key/models/apikey.model.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import redisService from "../services/redis.service.js";
import net from "node:net";

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
      
      // Enforce minute, hour, and day limits atomically through Redis.
      const limits = keyRecord.rateLimit || {};
      const [minute, hour, day] = await Promise.all([
        redisService.incrementRateLimit(`apikey:${keyRecord._id}:minute`, 60),
        redisService.incrementRateLimit(`apikey:${keyRecord._id}:hour`, 3600),
        redisService.incrementRateLimit(`apikey:${keyRecord._id}:day`, 86400),
      ]);

      const exceeded = [
        [minute.count, limits.requestsPerMinute, "minute"],
        [hour.count, limits.requestsPerHour, "hour"],
        [day.count, limits.requestsPerDay, "day"],
      ].find(([count, limit]) => count > limit);

      if (exceeded) {
        throw new ApiError(429, `Rate limit exceeded for ${exceeded[2]}`, {
          window: exceeded[2],
          limit: exceeded[1],
          count: exceeded[0],
        });
      }

      const rateLimitCheck = {
        allowed: true,
        remaining: {
          minute: Math.max(0, limits.requestsPerMinute - minute.count),
          hourly: Math.max(0, limits.requestsPerHour - hour.count),
          daily: Math.max(0, limits.requestsPerDay - day.count),
        },
      };
      
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
        const clientIP = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress;
        const ipToBigInt = (address) => {
          const normalized = address?.startsWith("::ffff:") ? address.slice(7) : address;
          const version = net.isIP(normalized);
          if (!version) return null;
          if (version === 4) {
            return normalized.split(".").reduce((value, octet) => (value << 8n) + BigInt(Number(octet)), 0n);
          }
          const groups = normalized.split("::");
          const left = groups[0] ? groups[0].split(":").filter(Boolean) : [];
          const right = groups[1] ? groups[1].split(":").filter(Boolean) : [];
          const missing = 8 - left.length - right.length;
          const expanded = [...left, ...Array(Math.max(0, missing)).fill("0"), ...right];
          return expanded.reduce((value, group) => (value << 16n) + BigInt(parseInt(group || "0", 16)), 0n);
        };
        const isIPAllowed = (address, rule) => {
          const [network, prefixText] = rule.split("/");
          const addressValue = ipToBigInt(address);
          const networkValue = ipToBigInt(network);
          if (addressValue === null || networkValue === null) return false;
          const addressVersion = net.isIP(address?.startsWith("::ffff:") ? address.slice(7) : address);
          const networkVersion = net.isIP(network?.startsWith("::ffff:") ? network.slice(7) : network);
          if (addressVersion !== networkVersion) return false;
          if (prefixText === undefined) return addressValue === networkValue;
          const bits = Number(prefixText);
          const maxBits = addressVersion === 4 ? 32 : 128;
          if (!Number.isInteger(bits) || bits < 0 || bits > maxBits) return false;
          if (bits === 0) return true;
          const shift = BigInt(maxBits - bits);
          return (addressValue >> shift) === (networkValue >> shift);
        };
        const isAllowed = keyRecord.ipWhitelist.some(allowedIP => isIPAllowed(clientIP, allowedIP));
        
        if (!isAllowed) {
          throw new ApiError(403, "IP address not whitelisted");
        }
      }
      
      // Increment usage (async, don't block the request)
      keyRecord.incrementUsage().catch(err => {
        console.error('Failed to increment API key usage');
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
