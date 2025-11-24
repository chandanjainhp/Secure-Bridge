// Redis service for storing temporary metadata (optional enhancement)
// This service gracefully degrades if Redis is not available
import { Redis } from '@upstash/redis';

class RedisService {
    constructor() {
        this.client = null;
        this.isAvailable = false;
    }

    // Initialize Redis connection (optional)
    async connect() {
        try {
            // Check if Upstash credentials are provided
            if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
                console.log('⚠️  Redis not configured - app will work without caching');
                console.log('   Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to .env to enable Redis');
                this.isAvailable = false;
                return;
            }

            this.client = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });

            // Test connection
            await this.client.ping();
            this.isAvailable = true;
            console.log('✅ Redis connected (Upstash) - caching enabled');
        } catch (error) {
            console.log('⚠️  Redis not available - app will work without caching');
            console.log('   Error:', error.message);
            this.isAvailable = false;
        }
    }

    // Disconnect gracefully
    async disconnect() {
        if (this.isAvailable) {
            console.log('✅ Redis disconnected');
            this.isAvailable = false;
        }
    }

    // Store temporary metadata with TTL (time to live)
    async setTemp(key, value, ttlSeconds = 3600) {
        if (!this.isAvailable) return false;
        try {
            const data = typeof value === 'string' ? value : JSON.stringify(value);
            await this.client.set(key, data, { ex: ttlSeconds });
            return true;
        } catch (error) {
            console.error('Redis SET error:', error.message);
            return false;
        }
    }

    // Get temporary metadata
    async getTemp(key) {
        if (!this.isAvailable) return null;
        try {
            const data = await this.client.get(key);
            if (!data) return null;
            try {
                return JSON.parse(data);
            } catch {
                return data;
            }
        } catch (error) {
            console.error('Redis GET error:', error.message);
            return null;
        }
    }

    // Delete temporary metadata
    async deleteTemp(key) {
        if (!this.isAvailable) return false;
        try {
            await this.client.del(key);
            return true;
        } catch (error) {
            console.error('Redis DEL error:', error.message);
            return false;
        }
    }

    // Check if key exists
    async exists(key) {
        if (!this.isAvailable) return false;
        try {
            return await this.client.exists(key);
        } catch (error) {
            console.error('Redis EXISTS error:', error.message);
            return false;
        }
    }

    // Store session data (15 minutes default)
    async setSession(userId, sessionData, ttl = 900) {
        return await this.setTemp(`session:${userId}`, sessionData, ttl);
    }

    // Get session data
    async getSession(userId) {
        return await this.getTemp(`session:${userId}`);
    }

    // Store rate limiting data
    async incrementRateLimit(identifier, windowSeconds = 60) {
        if (!this.isAvailable) return { count: 1, limited: false };
        try {
            const key = `ratelimit:${identifier}`;
            const count = await this.client.incr(key);
            if (count === 1) {
                await this.client.expire(key, windowSeconds);
            }
            return { count, limited: false };
        } catch (error) {
            console.error('Redis rate limit error:', error.message);
            return { count: 1, limited: false };
        }
    }

    // Store verification codes temporarily
    async setVerificationCode(email, code, ttl = 900) {
        return await this.setTemp(`verify:${email}`, code, ttl);
    }

    async getVerificationCode(email) {
        return await this.getTemp(`verify:${email}`);
    }

    // Cache API responses
    async cacheResponse(key, data, ttl = 300) {
        return await this.setTemp(`cache:${key}`, data, ttl);
    }

    async getCachedResponse(key) {
        return await this.getTemp(`cache:${key}`);
    }
}

// Export singleton instance
const redisService = new RedisService();
export default redisService;
