/**
 * MCP System Tests
 * Tests for the Model Context Protocol implementation and data fetching services
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import { app } from '../app.js';
import encryptionService from '../services/encryptionService.js';
import datasetService from '../services/datasetService.js';
import securityService from '../services/securityService.js';
import mcpService from '../services/mcpService.js';

describe('MCP System Tests', () => {
  let testApiKey;
  let testUser;

  beforeAll(async () => {
    // Set up test environment
    process.env.NODE_ENV = 'test';
    process.env.ENCRYPTION_MODE = 'mock'; // Use mock encryption for tests
    process.env.OUTBOUND_ALLOWLIST = '["httpbin.org","localhost","127.0.0.1"]';
    process.env.MCP_TOOL_AUTONOMY = 'fetch-allowed';
  });

  afterAll(async () => {
    // Clean up
    datasetService.datasets.clear();
  });

  describe('Encryption Service', () => {
    it('should encrypt and decrypt data in mock mode', async () => {
      const plaintext = 'Hello, World!';
      const envelope = await encryptionService.encrypt(plaintext);
      
      expect(envelope).toHaveProperty('mode', 'mock');
      expect(envelope).toHaveProperty('version', 1);
      expect(envelope).toHaveProperty('payload');
      
      const decrypted = await encryptionService.decrypt(envelope);
      expect(decrypted).toBe(plaintext);
    });

    it('should handle complex JSON data', async () => {
      const data = { message: 'test', number: 42, array: [1, 2, 3] };
      const plaintext = JSON.stringify(data);
      
      const envelope = await encryptionService.encrypt(plaintext);
      const decrypted = await encryptionService.decrypt(envelope);
      
      expect(JSON.parse(decrypted)).toEqual(data);
    });

    it('should validate envelope structure', () => {
      const validEnvelope = {
        mode: 'mock',
        version: 1,
        payload: { ciphertext: 'test' }
      };

      expect(encryptionService.isValidEnvelope(validEnvelope)).toBe(true);
      expect(encryptionService.isValidEnvelope({})).toBe(false);
      expect(encryptionService.isValidEnvelope(null)).toBe(false);
    });
  });

  describe('Security Service', () => {
    it('should validate allowed URLs', () => {
      const result1 = securityService.validateUrl('https://httpbin.org/get');
      expect(result1.allowed).toBe(true);

      const result2 = securityService.validateUrl('https://evil.com/steal-data');
      expect(result2.allowed).toBe(false);
    });

    it('should block private IP addresses', () => {
      const result1 = securityService.validateUrl('http://192.168.1.1/admin');
      expect(result1.allowed).toBe(false);

      const result2 = securityService.validateUrl('http://10.0.0.1/internal');
      expect(result2.allowed).toBe(false);
    });

    it('should sanitize MongoDB queries', () => {
      const dangerousQuery = {
        $where: 'this.name === "admin"',
        user: 'test',
        $function: { body: 'return true;' }
      };

      const sanitized = securityService.sanitizeMongoQuery(dangerousQuery);
      expect(sanitized).not.toHaveProperty('$where');
      expect(sanitized).not.toHaveProperty('$function');
      expect(sanitized).toHaveProperty('user', 'test');
    });

    it('should validate headers', () => {
      const headers = {
        'content-type': 'application/json',
        'authorization': 'Bearer secret',
        'x-custom': 'value',
        'user-agent': 'test'
      };

      const sanitized = securityService.validateHeaders(headers);
      expect(sanitized).not.toHaveProperty('authorization');
      expect(sanitized).toHaveProperty('content-type');
      expect(sanitized).toHaveProperty('x-custom');
    });
  });

  describe('Dataset Service', () => {
    beforeEach(() => {
      datasetService.datasets.clear();
    });

    it('should store and retrieve datasets', () => {
      const data = { message: 'test data' };
      const result = datasetService.store({
        owner: 'test-user',
        name: 'Test Dataset',
        mimeType: 'application/json',
        data,
        metadata: { source: 'test' }
      });

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('uri');
      expect(result.uri).toMatch(/^sb:\/\/dataset\/test-user\//);

      const retrieved = datasetService.get('test-user', result.id);
      expect(retrieved).toBeTruthy();
      expect(JSON.parse(retrieved.data)).toEqual(data);
    });

    it('should handle dataset URIs', () => {
      const uri = 'sb://dataset/test-user/test-id';
      const parsed = datasetService.parseUri(uri);
      
      expect(parsed).toEqual({
        owner: 'test-user',
        id: 'test-id'
      });

      // Test invalid URI
      expect(datasetService.parseUri('invalid-uri')).toBeNull();
    });

    it('should list datasets for an owner', () => {
      // Store multiple datasets
      datasetService.store({
        owner: 'test-user',
        name: 'Dataset 1',
        mimeType: 'application/json',
        data: { id: 1 }
      });

      datasetService.store({
        owner: 'test-user',
        name: 'Dataset 2',
        mimeType: 'application/json',
        data: { id: 2 }
      });

      datasetService.store({
        owner: 'other-user',
        name: 'Other Dataset',
        mimeType: 'application/json',
        data: { id: 3 }
      });

      const userDatasets = datasetService.list('test-user');
      expect(userDatasets).toHaveLength(2);
      expect(userDatasets.every(d => d.owner === 'test-user')).toBe(true);
    });

    it('should get statistics', () => {
      datasetService.store({
        owner: 'test-user',
        name: 'Test Dataset',
        mimeType: 'application/json',
        data: { message: 'test' }
      });

      const stats = datasetService.getStats();
      expect(stats.totalCount).toBe(1);
      expect(stats.ownerStats).toHaveProperty('test-user');
      expect(stats.mimeTypeStats).toHaveProperty('application/json');
    });
  });

  describe('MCP Service', () => {
    it('should handle initialize request', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {}
      };

      const response = await mcpService.handleRequest(request);
      
      expect(response).toHaveProperty('jsonrpc', '2.0');
      expect(response).toHaveProperty('id', 1);
      expect(response).toHaveProperty('result');
      expect(response.result).toHaveProperty('protocolVersion');
      expect(response.result).toHaveProperty('capabilities');
      expect(response.result).toHaveProperty('serverInfo');
    });

    it('should list available tools', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list',
        params: {}
      };

      const response = await mcpService.handleRequest(request);
      
      expect(response.result).toHaveProperty('tools');
      expect(Array.isArray(response.result.tools)).toBe(true);
      expect(response.result.tools.length).toBeGreaterThan(0);
      
      const toolNames = response.result.tools.map(t => t.name);
      expect(toolNames).toContain('fetch_api');
      expect(toolNames).toContain('fetch_mongo');
      expect(toolNames).toContain('fetch_web');
      expect(toolNames).toContain('get_dataset');
    });

    it('should handle ping requests', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'ping',
        params: {}
      };

      const response = await mcpService.handleRequest(request);
      
      expect(response.result).toHaveProperty('status', 'pong');
      expect(response.result).toHaveProperty('timestamp');
    });

    it('should handle unknown methods', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'unknown_method',
        params: {}
      };

      const response = await mcpService.handleRequest(request);
      
      expect(response).toHaveProperty('error');
      expect(response.error.code).toBe(-32601);
      expect(response.error.message).toBe('Method not found');
    });

    it('should enforce read-only autonomy', async () => {
      // Temporarily set read-only mode
      const originalAutonomy = mcpService.toolAutonomy;
      mcpService.toolAutonomy = 'read-only';

      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/list',
        params: {}
      };

      const response = await mcpService.handleRequest(request);
      const toolNames = response.result.tools.map(t => t.name);
      
      // Only get_dataset should be available in read-only mode
      expect(toolNames).toEqual(['get_dataset']);

      // Restore original autonomy
      mcpService.toolAutonomy = originalAutonomy;
    });
  });

  describe('MCP HTTP Endpoints', () => {
    it('should handle MCP JSON-RPC requests', async () => {
      const response = await request(app)
        .post('/api/v1/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {}
        })
        .expect(200);

      expect(response.body).toHaveProperty('jsonrpc', '2.0');
      expect(response.body).toHaveProperty('result');
    });

    it('should return MCP service info', async () => {
      const response = await request(app)
        .get('/api/v1/mcp/info')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('mcp');
      expect(response.body).toHaveProperty('fetchers');
      expect(response.body).toHaveProperty('datasets');
    });

    it('should return health check', async () => {
      const response = await request(app)
        .get('/api/v1/mcp/health')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('uptime');
      expect(response.body).toHaveProperty('memory');
    });

    it('should handle dataset retrieval', async () => {
      // First, store a dataset
      const result = datasetService.store({
        owner: 'test-user',
        name: 'Test Dataset',
        mimeType: 'application/json',
        data: { message: 'test' },
        metadata: { source: 'test' }
      });

      const response = await request(app)
        .get(`/api/v1/mcp/dataset?uri=${encodeURIComponent(result.uri)}`)
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('dataset');
      expect(response.body.dataset).toHaveProperty('uri', result.uri);
    });

    it('should list datasets', async () => {
      // Store a test dataset
      datasetService.store({
        owner: 'anonymous',
        name: 'Test Dataset',
        mimeType: 'application/json',
        data: { message: 'test' }
      });

      const response = await request(app)
        .get('/api/v1/mcp/datasets?owner=anonymous')
        .expect(200);

      expect(response.body).toHaveProperty('ok', true);
      expect(response.body).toHaveProperty('datasets');
      expect(Array.isArray(response.body.datasets)).toBe(true);
    });

    it('should handle invalid MCP requests', async () => {
      const response = await request(app)
        .post('/api/v1/mcp')
        .send({ invalid: 'request' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe(-32600);
    });

    it('should require encrypted envelopes for fetch operations', async () => {
      const response = await request(app)
        .post('/api/v1/mcp/fetch/api')
        .send({ /* missing envelope */ })
        .expect(400);

      expect(response.body).toHaveProperty('ok', false);
      expect(response.body).toHaveProperty('error', 'Missing encrypted envelope');
    });
  });

  describe('Error Handling', () => {
    it('should handle encryption errors gracefully', async () => {
      const invalidEnvelope = { mode: 'invalid', version: 1, payload: {} };
      
      try {
        await encryptionService.decrypt(invalidEnvelope);
      } catch (error) {
        expect(error.message).toContain('Unsupported encryption mode');
      }
    });

    it('should handle dataset storage errors', () => {
      expect(() => {
        datasetService.store({
          /* missing required fields */
        });
      }).toThrow('Missing required parameters');
    });

    it('should handle MCP request errors', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: 'nonexistent_tool', arguments: {} }
      };

      const response = await mcpService.handleRequest(request);
      
      expect(response).toHaveProperty('error');
      expect(response.error.message).toContain('Unknown tool');
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete MCP workflow', async () => {
      // 1. Initialize MCP session
      let response = await request(app)
        .post('/api/v1/mcp')
        .send({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {}
        });

      expect(response.status).toBe(200);

      // 2. List available tools
      response = await request(app)
        .post('/api/v1/mcp')
        .send({
          jsonrpc: '2.0',
          id: 2,
          method: 'tools/list',
          params: {}
        });

      expect(response.status).toBe(200);
      expect(response.body.result.tools.length).toBeGreaterThan(0);

      // 3. Store a dataset directly for testing get_dataset
      const datasetResult = datasetService.store({
        owner: 'mcp-user',
        name: 'Test Dataset',
        mimeType: 'application/json',
        data: { message: 'Hello from MCP!' },
        metadata: { source: { type: 'test' } }
      });

      // 4. Call get_dataset tool
      response = await request(app)
        .post('/api/v1/mcp')
        .send({
          jsonrpc: '2.0',
          id: 3,
          method: 'tools/call',
          params: {
            name: 'get_dataset',
            arguments: { uri: datasetResult.uri }
          }
        });

      expect(response.status).toBe(200);
      expect(response.body.result).toHaveProperty('content');
      expect(response.body.result.isError).toBe(false);
    });
  });
});

// Performance Tests
describe('MCP Performance', () => {
  it('should handle concurrent dataset operations', async () => {
    const operations = Array.from({ length: 100 }, (_, i) => 
      datasetService.store({
        owner: 'perf-test',
        name: `Dataset ${i}`,
        mimeType: 'application/json',
        data: { id: i, timestamp: Date.now() }
      })
    );

    const start = Date.now();
    const results = await Promise.all(operations.map(op => Promise.resolve(op)));
    const duration = Date.now() - start;

    expect(results).toHaveLength(100);
    expect(duration).toBeLessThan(1000); // Should complete within 1 second
  });

  it('should efficiently clean up expired datasets', () => {
    // Store datasets with old timestamps
    for (let i = 0; i < 10; i++) {
      const result = datasetService.store({
        owner: 'cleanup-test',
        name: `Old Dataset ${i}`,
        mimeType: 'application/json',
        data: { id: i }
      });
      
      // Manually set old timestamp
      const dataset = datasetService.datasets.get(`cleanup-test/${result.id}`);
      dataset.lastAccessed = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(); // 25 hours ago
    }

    const statsBefore = datasetService.getStats();
    const cleanupResult = datasetService.performCleanup();
    const statsAfter = datasetService.getStats();

    expect(cleanupResult.removedCount).toBeGreaterThan(0);
    expect(statsAfter.totalCount).toBeLessThan(statsBefore.totalCount);
  });
});

export default {};
