import { redisClient, safeRedisOperation } from "../config/redis.js";
import fs from 'fs/promises';
import path from 'path';

const memory = new Map();
const CACHE_FILE = path.resolve('./tmp/redis-fallback-cache.json');

// Ensure cache directory exists
const ensureCacheDir = async () => {
  try {
    await fs.mkdir('./tmp', { recursive: true });
  } catch (err) {
    // Directory already exists or other error - ignore
  }
};

// Load cache from file on startup
const loadCacheFromFile = async () => {
  try {
    await ensureCacheDir();
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    const cached = JSON.parse(data);
    const now = Date.now();
    for (const [key, entry] of Object.entries(cached)) {
      if (entry.expiresAt > now) {
        memory.set(key, entry);
      }
    }
    console.log(`📦 Redis fallback cache loaded: ${memory.size} valid entries`);
  } catch (err) {
    // File doesn't exist or is corrupted - start fresh
    console.log('📦 No Redis fallback cache found, starting fresh');
  }
};

// Save cache to file periodically
const saveCacheToFile = async () => {
  try {
    await ensureCacheDir();
    const cacheData = {};
    const now = Date.now();
    for (const [key, entry] of memory.entries()) {
      if (entry.expiresAt > now) {
        cacheData[key] = entry;
      }
    }
    await fs.writeFile(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf-8');
  } catch (err) {
    console.error('❌ Failed to save Redis fallback cache:', err.message);
  }
};

// Check if Redis is connected and healthy
const isRedisConnected = () => {
  return redisClient.isOpen;
};

// Load cache from file on module load
loadCacheFromFile().catch(() => {});

// Save cache to file every 30 seconds
setInterval(() => {
  saveCacheToFile().catch(() => {});
}, 30 * 1000);

const setValue = async (key, value, ttlSeconds) => {
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  await safeRedisOperation(() =>
    redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds }),
  );
  // Persist to file immediately for critical data like OTPs
  await saveCacheToFile().catch(() => {});
};

const getValue = async (key) => {
  const cached = memory.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  memory.delete(key);
  const remote = await safeRedisOperation(() => redisClient.get(key));
  return remote ? JSON.parse(remote) : null;
};

// Cleanup expired entries from memory cache periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memory.entries()) {
    if (entry.expiresAt <= now) {
      memory.delete(key);
    }
  }
}, 60 * 1000); // Cleanup every 60 seconds

const redisService = {
  setVerificationCode: (email, code, ttl, purpose = "default") => {
    if (!isRedisConnected()) {
      console.warn('⚠️  Redis not connected. OTP stored in file-backed cache (persists across restarts).');
    }
    return setValue(`verification:${purpose}:${email}`, code, ttl);
  },
  getVerificationCode: (email, purpose = "default") => {
    if (!isRedisConnected()) {
      console.warn('⚠️  Redis not connected. Checking file-backed OTP cache.');
    }
    return getValue(`verification:${purpose}:${email}`);
  },
  deleteVerificationCode: (email, purpose = "default") => {
    const key = `verification:${purpose}:${email}`;
    memory.delete(key);
    return safeRedisOperation(() => redisClient.del(key));
  },
  setSession: (userId, session, ttl) => setValue(`session:${userId}`, session, ttl),
  incrementRateLimit: async (key, ttl) => {
    const count = ((await getValue(`rate:${key}`)) || 0) + 1;
    await setValue(`rate:${key}`, count, ttl);
    return { count };
  },
};

export default redisService;
