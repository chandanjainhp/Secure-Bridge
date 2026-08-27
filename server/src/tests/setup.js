import 'dotenv/config';
import { jest } from '@jest/globals';

jest.setTimeout(30000);

process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || Buffer.from('1234567890abcdef1234567890abcdef').toString('base64');
process.env.SKIP_API_KEY_VALIDATION = 'true';

let mongod;

beforeAll(async () => {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { mongoose } = await import('mongoose');
  
  // Use MongoMemoryServer for tests
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

afterAll(async () => {
  const { mongoose } = await import('mongoose');
  await mongoose.disconnect();
  if (mongod) {
    await mongod.stop();
  }
});
