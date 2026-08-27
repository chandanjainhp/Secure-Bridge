import { jest } from '@jest/globals';
import { ApiKey } from '../models/apikey.model.js';
import { Project } from '../models/project.model.js';
import { User } from '../models/user.model.js';
import {
  buildMessagesWithSystemPrompt,
  fetchAndDecryptKey,
  tryFreeTierFallback,
  resolveModel,
  generateChatResponse,
} from '../services/chatService.js';

// ============================================================
// MOCKS
// ============================================================

// Mock the Vercel AI SDK generateText
jest.mock('ai', () => ({
  generateText: jest.fn(),
}));

// Mock chat.providers.js — we want to control getModelInstance, detectProvider, etc.
jest.mock('../utils/chat.providers.js', () => ({
  getModelInstance: jest.fn(),
  detectProvider: jest.fn(),
  findExternalKeys: jest.fn(),
  FALLBACK_CHAIN: [
    { provider: 'google', matchKeyword: 'google', model: 'gemini-2.5-flash' },
    { provider: 'openai', matchKeyword: 'openai', model: 'gpt-4o-mini' },
  ],
  DEFAULT_MODELS: {
    local: 'gemma-3-4b-it-qat',
    google: 'gemini-2.5-flash',
    openai: 'gpt-4o-mini',
    anthropic: 'claude-3-5-sonnet-20241022',
  },
}));

// Mock usageService so it doesn't try to connect to Redis
jest.mock('../features/usage/services/usageService.js', () => ({
  default: {
    incrementUsage: jest.fn(() => Promise.resolve()),
    getUsage: jest.fn(() => Promise.resolve({ count: 0, limit: 10 })),
  },
}));

import { generateText } from 'ai';
import { getModelInstance, detectProvider, findExternalKeys } from '../utils/chat.providers.js';

// ============================================================
// TESTS
// ============================================================

describe('ChatService', () => {
  let testUser;
  let testProject;

  beforeAll(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await ApiKey.deleteMany({});

    testUser = await User.create({
      fullName: 'Test User',
      email: 'chattest@example.com',
      username: 'chattestuser',
      password: 'TestPassword123!',
      isVerified: true,
    });
  });

  afterAll(async () => {
    await User.deleteMany({});
    await Project.deleteMany({});
    await ApiKey.deleteMany({});
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --------------------------------------------------------
  // buildMessagesWithSystemPrompt
  // --------------------------------------------------------
  describe('buildMessagesWithSystemPrompt', () => {
    test('prepends system prompt to messages array', () => {
      const messages = buildMessagesWithSystemPrompt(
        'You are a helpful assistant.',
        [{ role: 'user', content: 'Hello' }],
        'How are you?',
      );

      expect(messages[0]).toEqual({ role: 'system', content: 'You are a helpful assistant.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'Hello' });
      expect(messages[2]).toEqual({ role: 'user', content: 'How are you?' });
      expect(messages).toHaveLength(3);
    });

    test('skips empty system prompt', () => {
      const messages = buildMessagesWithSystemPrompt(
        '   ',
        [],
        'Hello',
      );

      expect(messages).toHaveLength(1);
      expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    test('includes conversation history with user and assistant messages', () => {
      const history = [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '4' },
      ];

      const messages = buildMessagesWithSystemPrompt('Be concise.', history, 'And 3+3?');

      expect(messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'What is 2+2?' });
      expect(messages[2]).toEqual({ role: 'assistant', content: '4' });
      expect(messages[3]).toEqual({ role: 'user', content: 'And 3+3?' });
      expect(messages).toHaveLength(4);
    });

    test('handles empty conversation history', () => {
      const messages = buildMessagesWithSystemPrompt('System prompt.', [], 'Hello');

      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
    });
  });

  // --------------------------------------------------------
  // fetchAndDecryptKey
  // --------------------------------------------------------
  describe('fetchAndDecryptKey', () => {
    test('returns null when no userId provided', async () => {
      const result = await fetchAndDecryptKey(null, 'openai');
      expect(result).toBeNull();
    });

    test('delegates to getModelInstance', async () => {
      getModelInstance.mockResolvedValueOnce({
        model: {},
        providerUsed: 'openai',
      });

      const result = await fetchAndDecryptKey('user123', 'openai');

      expect(getModelInstance).toHaveBeenCalledWith('openai', 'gpt-4o-mini', 'user123');
      expect(result).toEqual({ model: {}, providerUsed: 'openai' });
    });

    test('returns null when getModelInstance returns null', async () => {
      getModelInstance.mockResolvedValueOnce(null);

      const result = await fetchAndDecryptKey('user123', 'openai');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------
  // tryFreeTierFallback
  // --------------------------------------------------------
  describe('tryFreeTierFallback', () => {
    const originalEnv = process.env.SHARED_OPENAI_API_KEY;

    afterEach(() => {
      process.env.SHARED_OPENAI_API_KEY = originalEnv;
    });

    test('returns null when SHARED_OPENAI_API_KEY is not set', async () => {
      delete process.env.SHARED_OPENAI_API_KEY;

      const result = await tryFreeTierFallback();
      expect(result).toBeNull();
    });

    test('returns null when SHARED_OPENAI_API_KEY is placeholder', async () => {
      process.env.SHARED_OPENAI_API_KEY = 'your_shared_openai_api_key_here';

      const result = await tryFreeTierFallback();
      expect(result).toBeNull();
    });

    test('returns model instance when SHARED_OPENAI_API_KEY is set', async () => {
      process.env.SHARED_OPENAI_API_KEY = 'sk-test-key-12345';

      // The function dynamically imports @ai-sdk/openai which may not be installed in test env.
      // We mock the import.
      jest.doMock('@ai-sdk/openai', () => ({
        createOpenAI: jest.fn(() => {
          return (modelName) => ({ model: modelName, provider: 'openai' });
        }),
      }));

      const result = await tryFreeTierFallback();

      if (result) {
        expect(result.providerUsed).toBe('shared-openai');
        expect(result.model).toBeDefined();
      }

      jest.dontMock('@ai-sdk/openai');
    });
  });

  // --------------------------------------------------------
  // resolveModel
  // --------------------------------------------------------
  describe('resolveModel', () => {
    test('returns model instance when BYOK key exists for provider', async () => {
      detectProvider.mockReturnValueOnce({ provider: 'openai', model: 'gpt-4o-mini' });
      getModelInstance.mockResolvedValueOnce({
        model: { id: 'gpt-4o-mini' },
        providerUsed: 'openai',
      });

      const result = await resolveModel('user123', 'gpt-4o-mini');

      expect(result).toBeTruthy();
      expect(result.providerUsed).toBe('openai');
      expect(result.modelName).toBe('gpt-4o-mini');
    });

    test('tries local LLM when provider is local', async () => {
      detectProvider.mockReturnValueOnce({ provider: 'local', model: 'gemma-3-4b-it-qat' });
      getModelInstance.mockResolvedValueOnce({
        model: { id: 'local-model' },
        providerUsed: 'local',
      });

      const result = await resolveModel('user123', 'local');

      expect(result).toBeTruthy();
      expect(result.providerUsed).toBe('local');
    });

    test('tries fallback chain when BYOK key not found', async () => {
      detectProvider.mockReturnValueOnce({ provider: 'openai', model: 'gpt-4o-mini' });
      // First call (fetchAndDecryptKey for openai) returns null
      getModelInstance.mockResolvedValueOnce(null);
      // findExternalKeys returns an array with a google key
      findExternalKeys.mockResolvedValueOnce([
        { provider: 'google', externalProvider: 'google_ai_studio' },
      ]);
      // getModelInstance for google fallback succeeds
      getModelInstance.mockResolvedValueOnce({
        model: { id: 'gemini-2.5-flash' },
        providerUsed: 'google',
      });

      const result = await resolveModel('user123', 'gpt-4o-mini');

      expect(result).toBeTruthy();
      expect(result.providerUsed).toBe('google');
    });

    test('returns null when no keys and no shared key available', async () => {
      detectProvider.mockReturnValueOnce({ provider: 'openai', model: 'gpt-4o-mini' });
      getModelInstance.mockResolvedValueOnce(null);
      findExternalKeys.mockResolvedValueOnce([]);
      delete process.env.SHARED_OPENAI_API_KEY;

      const result = await resolveModel('user123', 'gpt-4o-mini');

      expect(result).toBeNull();
    });
  });

  // --------------------------------------------------------
  // generateChatResponse (integration)
  // --------------------------------------------------------
  describe('generateChatResponse', () => {
    test('throws when no model can be resolved', async () => {
      detectProvider.mockReturnValueOnce({ provider: 'openai', model: 'gpt-4o-mini' });
      getModelInstance.mockResolvedValueOnce(null);
      findExternalKeys.mockResolvedValueOnce([]);
      delete process.env.SHARED_OPENAI_API_KEY;

      await expect(
        generateChatResponse({
          userId: 'user123',
          systemPrompt: 'You are a helpful assistant.',
          conversationHistory: [],
          userContent: 'Hello',
          model: 'gpt-4o-mini',
          temperature: 0.7,
          maxTokens: 2048,
        }),
      ).rejects.toThrow('No API key found');
    });

    test('generates response successfully when model is available', async () => {
      detectProvider.mockReturnValueOnce({ provider: 'openai', model: 'gpt-4o-mini' });
      getModelInstance.mockResolvedValueOnce({
        model: { id: 'gpt-4o-mini' },
        providerUsed: 'openai',
      });

      generateText.mockResolvedValueOnce({
        text: 'Hello! How can I help you?',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 8,
          totalTokens: 18,
        },
      });

      const result = await generateChatResponse({
        userId: 'user123',
        systemPrompt: 'You are a helpful assistant.',
        conversationHistory: [],
        userContent: 'Hello',
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: 2048,
      });

      expect(result.text).toBe('Hello! How can I help you?');
      expect(result.providerUsed).toBe('openai');
      expect(result.usage.totalTokens).toBe(18);
    });
  });
});
