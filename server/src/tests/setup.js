/**
 * Jest Test Setup
 * Global configuration and utilities for tests
 */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.ENCRYPTION_MODE = 'mock';
process.env.MONGODB_URI = 'mongodb://localhost:27017/secure-bridge-test';
process.env.OUTBOUND_ALLOWLIST = '["httpbin.org","localhost","127.0.0.1"]';
process.env.MCP_TOOL_AUTONOMY = 'fetch-allowed';

// Global test utilities
global.mockUser = {
  _id: 'test-user-id',
  email: 'test@example.com',
  username: 'testuser',
};

global.mockApiKey = {
  key: 'test-api-key',
  userId: 'test-user-id',
  status: 'active',
};
