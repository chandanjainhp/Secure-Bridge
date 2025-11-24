// Redis configuration and client setup
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();

// Create Redis client with configuration
const redisClient = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    socket: {
        reconnectStrategy: (retries) => {
            if (retries > 10) {
                console.error('❌ Redis: Too many reconnection attempts, giving up');
                return new Error('Redis connection failed after 10 retries');
            }
            // Exponential backoff: 50ms, 100ms, 200ms, etc.
            const delay = Math.min(retries * 50, 3000);
            console.log(`🔄 Redis: Reconnecting in ${delay}ms... (attempt ${retries})`);
            return delay;
        },
        connectTimeout: 10000, // 10 seconds
    },
    // Password if needed
    password: process.env.REDIS_PASSWORD || undefined,
});

// Event handlers for Redis connection
redisClient.on('connect', () => {
    console.log('🔗 Redis: Connecting...');
});

redisClient.on('ready', () => {
    console.log('✅ Redis: Connected and ready');
});

redisClient.on('error', (err) => {
    console.error('❌ Redis Error:', err.message);
});

redisClient.on('reconnecting', () => {
    console.log('🔄 Redis: Reconnecting...');
});

redisClient.on('end', () => {
    console.log('🔌 Redis: Connection closed');
});

// Connect to Redis
const connectRedis = async () => {
    try {
        if (!redisClient.isOpen) {
            await redisClient.connect();
        }
    } catch (error) {
        console.error('❌ Failed to connect to Redis:', error.message);
        // Don't throw - let the app run without Redis if it fails
        // Redis is for caching/temporary data, not critical
    }
};

// Disconnect from Redis
const disconnectRedis = async () => {
    try {
        if (redisClient.isOpen) {
            await redisClient.quit();
            console.log('✅ Redis: Gracefully disconnected');
        }
    } catch (error) {
        console.error('❌ Error disconnecting from Redis:', error.message);
    }
};

// Helper function to safely execute Redis operations
const safeRedisOperation = async (operation, fallback = null) => {
    try {
        if (!redisClient.isOpen) {
            console.warn('⚠️  Redis not connected, skipping operation');
            return fallback;
        }
        return await operation();
    } catch (error) {
        console.error('❌ Redis operation failed:', error.message);
        return fallback;
    }
};

// Export Redis client and utilities
export {
    redisClient,
    connectRedis,
    disconnectRedis,
    safeRedisOperation
};
