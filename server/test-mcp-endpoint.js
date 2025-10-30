/**
 * Simple test script to verify MCP HTTP endpoint functionality
 */

import axios from 'axios';

const MCP_ENDPOINT = 'http://localhost:8000/api/v1/mcp';
const API_KEY = 'test-api-key';

// Test tools/list request
async function testToolsList() {
  try {
    console.log('Testing MCP tools/list endpoint...');
    
    const response = await axios.post(MCP_ENDPOINT, {
      jsonrpc: '2.0',
      method: 'tools/list',
      params: {},
      id: 'test-tools-list'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`
      },
      timeout: 5000
    });

    console.log('✅ Tools/list response:', JSON.stringify(response.data, null, 2));
    return response.data;
    
  } catch (error) {
    console.error('❌ Tools/list error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
    throw error;
  }
}

// Test health endpoint
async function testHealth() {
  try {
    console.log('\nTesting MCP health endpoint...');
    
    const response = await axios.get('http://localhost:8000/api/v1/mcp/health', {
      timeout: 5000
    });

    console.log('✅ Health response:', JSON.stringify(response.data, null, 2));
    return response.data;
    
  } catch (error) {
    console.error('❌ Health error:', error.message);
    throw error;
  }
}

// Test info endpoint
async function testInfo() {
  try {
    console.log('\nTesting MCP info endpoint...');
    
    const response = await axios.get('http://localhost:8000/api/v1/mcp/info', {
      timeout: 5000
    });

    console.log('✅ Info response:', JSON.stringify(response.data, null, 2));
    return response.data;
    
  } catch (error) {
    console.error('❌ Info error:', error.message);
    throw error;
  }
}

// Main test function
async function runTests() {
  console.log('🧪 Starting MCP endpoint tests...\n');
  
  try {
    // Test health first (no auth required)
    await testHealth();
    
    // Test info 
    await testInfo();
    
    // Test MCP JSON-RPC
    await testToolsList();
    
    console.log('\n✅ All tests passed! MCP server is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Tests failed. Make sure the MCP server is running on port 8000.');
    process.exit(1);
  }
}

// Run the tests
runTests();
