import { redisClient, safeRedisOperation } from "../config/redis.js";

const memory = new Map();

const setValue = async (key, value, ttl) => {
  const expiresAt = Date.now() + ttl * 1000;
  memory.set(key, { value, expiresAt });
  await safeRedisOperation(() => redisClient.set(key, JSON.stringify(value), { EX: ttl }));
};

const getValue = async (key) => {
  const entry = memory.get(key);
  if (entry) {
    if (entry.expiresAt > Date.now()) return entry.value;
    memory.delete(key);
  }
  const remote = await safeRedisOperation(() => redisClient.get(key));
  if (!remote) return null;
  try { return JSON.parse(remote); } catch { return null; }
};

const deleteValue = async (key) => {
  memory.delete(key);
  await safeRedisOperation(() => redisClient.del(key));
};

const incrementRateLimit = async (key, ttl) => {
  const storageKey = `rate:${key}`;
  const entry = memory.get(storageKey);
  const now = Date.now();
  const memoryActive = entry && entry.expiresAt > now;
  const memoryCount = memoryActive ? Number(entry.value) + 1 : 1;
  memory.set(storageKey, { value: memoryCount, expiresAt: memoryActive ? entry.expiresAt : now + ttl * 1000 });

  if (!redisClient.isOpen) return { count: memoryCount };

  try {
    const count = await redisClient.incr(storageKey);
    if (count === 1) await redisClient.expire(storageKey, ttl);
    return { count };
  } catch (error) {
    return { count: memoryCount };
  }
};

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memory) {
    if (entry.expiresAt <= now) memory.delete(key);
  }
}, 60000).unref?.();

const redisService = {
  setVerificationCode: (email, code, ttl, purpose = "default") => setValue(`verification:${purpose}:${email}`, code, ttl),
  getVerificationCode: (email, purpose = "default") => getValue(`verification:${purpose}:${email}`),
  deleteVerificationCode: (email, purpose = "default") => deleteValue(`verification:${purpose}:${email}`),
  setSession: (userId, session, ttl = 3600) => setValue(`session:${userId}`, session, ttl),
  incrementRateLimit,
};

export default redisService;
