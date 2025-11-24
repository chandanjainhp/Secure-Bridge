/**
 * OPTIONAL: Redis Integration Example
 * 
 * This file shows how to use Redis for temporary metadata storage.
 * Copy this code into your controllers ONLY if you want to use Redis.
 * Your app will continue working without any changes.
 */

import redisService from '../services/redis.service.js';

// Example 1: Cache user sessions (OPTIONAL)
export async function cacheUserSession(userId, sessionData) {
    // Store session for 15 minutes
    await redisService.setSession(userId, sessionData, 900);
}

export async function getUserSession(userId) {
    // Try to get from cache first
    const cached = await redisService.getSession(userId);
    if (cached) {
        console.log('✅ Session found in Redis cache');
        return cached;
    }
    // Otherwise fetch from database
    console.log('⚠️  Session not in cache, fetching from DB');
    return null;
}

// Example 2: Store verification codes temporarily (OPTIONAL)
export async function cacheVerificationCode(email, code) {
    // Store for 15 minutes instead of in MongoDB
    await redisService.setVerificationCode(email, code, 900);
}

export async function getVerificationCode(email) {
    return await redisService.getVerificationCode(email);
}

// Example 3: Rate limiting (OPTIONAL)
export async function checkRateLimit(ipAddress, maxRequests = 100) {
    const result = await redisService.incrementRateLimit(ipAddress, 60);
    if (result.count > maxRequests) {
        return { allowed: false, remaining: 0 };
    }
    return { allowed: true, remaining: maxRequests - result.count };
}

// Example 4: Cache API responses (OPTIONAL)
export async function cacheApiResponse(endpoint, data) {
    // Cache for 5 minutes
    await redisService.cacheResponse(endpoint, data, 300);
}

export async function getCachedApiResponse(endpoint) {
    return await redisService.getCachedResponse(endpoint);
}

/**
 * HOW TO INTEGRATE (OPTIONAL):
 * 
 * 1. In your server startup file (server-unified.js), add:
 * 
 *    import redisService from './services/redis.service.js';
 *    await redisService.connect(); // Start Redis
 * 
 * 2. In your controllers, use the examples above:
 * 
 *    // Before sending verification email
 *    await cacheVerificationCode(user.email, verificationCode);
 * 
 *    // When verifying
 *    const cachedCode = await getVerificationCode(email);
 * 
 * 3. For graceful shutdown, add:
 * 
 *    await redisService.disconnect();
 * 
 * NOTE: If Redis is not installed or not running, these functions
 * will safely return null/false and your app continues normally!
 */
