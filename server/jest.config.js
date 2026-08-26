export default {
  testEnvironment: 'node',
  transform: {},
  testMatch: ['**/src/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/src/tests/setup.js'],
  moduleFileExtensions: ['js', 'mjs'],
  testTimeout: 30000,
};
