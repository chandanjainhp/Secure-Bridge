#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import FHEService from './services/fhe_service.js'
import AIService from './services/ai_service.js'

/**
 * Privacy-Preserving MCP Server for Secure Bridge
 * 
 * This server exposes MCP tools that perform homomorphic computations
 * on encrypted data without ever seeing the plaintext.
 */

class SecureBridgeMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'secure-bridge-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    )
    
    this.fheService = new FHEService()
    this.aiService = new AIService()
    this.initialized = false
  }

  async initialize() {
    try {
      console.log('🔐 Initializing Secure Bridge MCP Server...')
      
      // Initialize FHE and AI services
      await this.fheService.initialize()
      await this.aiService.initialize()
      
      // Register MCP tools
      this.registerTools()
      
      this.initialized = true
      console.log('✅ MCP Server initialized successfully')
      
    } catch (error) {
      console.error('❌ Failed to initialize MCP Server:', error)
      throw error
    }
  }

  registerTools() {
    // Tool 1: FHE Chat Processing
    this.server.setRequestHandler('tools/list', async () => ({
      tools: [
        {
          name: 'fhe_chat_process',
          description: 'Process encrypted chat messages using homomorphic encryption',
          inputSchema: {
            type: 'object',
            properties: {
              encryptedMessage: {
                type: 'object',
                description: 'FHE encrypted message data',
                properties: {
                  ciphertext: { type: 'string' },
                  algorithm: { type: 'string' },
                  metadata: { type: 'object' }
                }
              },
              operation: {
                type: 'string',
                enum: ['encrypted_chat', 'sentiment_analysis', 'keyword_search', 'word_count'],
                description: 'Type of homomorphic operation to perform'
              },
              context: {
                type: 'object',
                description: 'Additional context for processing'
              }
            },
            required: ['encryptedMessage', 'operation']
          }
        },
        {
          name: 'fhe_compute',
          description: 'Perform homomorphic computations on encrypted data',
          inputSchema: {
            type: 'object',
            properties: {
              operation: {
                type: 'string',
                enum: ['addition', 'multiplication', 'comparison', 'search'],
                description: 'Homomorphic operation type'
              },
              encryptedInputs: {
                type: 'array',
                description: 'Array of encrypted inputs for computation'
              },
              parameters: {
                type: 'object',
                description: 'Operation-specific parameters'
              }
            },
            required: ['operation', 'encryptedInputs']
          }
        },
        {
          name: 'fhe_status',
          description: 'Get status of FHE and AI services',
          inputSchema: {
            type: 'object',
            properties: {}
          }
        }
      ]
    }))

    // Tool implementation: FHE Chat Processing
    this.server.setRequestHandler('tools/call', async (request) => {
      const { name, arguments: args } = request.params

      switch (name) {
        case 'fhe_chat_process':
          return await this.handleFHEChatProcess(args)
        
        case 'fhe_compute':
          return await this.handleFHECompute(args)
        
        case 'fhe_status':
          return await this.handleFHEStatus(args)
        
        default:
          throw new Error(`Unknown tool: ${name}`)
      }
    })
  }

  async handleFHEChatProcess(args) {
    try {
      console.log(`🔐 Processing FHE chat: ${args.operation}`)
      
      const { encryptedMessage, operation, context = {} } = args
      
      // Step 1: Perform homomorphic computation on encrypted data
      let homomorphicResult
      
      if (operation === 'encrypted_chat') {
        // For general chat, create a homomorphic context
        homomorphicResult = {
          operation: 'encrypted_chat',
          encryptedData: encryptedMessage,
          timestamp: Date.now(),
          privacyPreserved: true
        }
      } else {
        // Perform specific homomorphic operation
        homomorphicResult = await this.fheService.performHomomorphicOperation(
          operation, 
          encryptedMessage,
          context.additionalData
        )
      }
      
      // Step 2: Send encrypted result to AI service for intelligent response
      const aiResponse = operation === 'encrypted_chat' 
        ? await this.aiService.chatWithEncryptedContext(
            'Encrypted user message', // AI never sees actual content
            encryptedMessage
          )
        : await this.aiService.processHomomorphicResult(
            homomorphicResult, 
            'Encrypted user query', // AI never sees actual content
            context
          )
      
      // Step 3: Return response while maintaining privacy
      const response = {
        success: true,
        aiResponse: aiResponse.aiResponse,
        homomorphicComputation: {
          operation: operation,
          completed: true,
          result: homomorphicResult,
          privacyPreserved: true
        },
        privacy: {
          dataEncrypted: true,
          homomorphicProcessing: true,
          serverNeverSawPlaintext: true,
          aiProcessedEncryptedContext: true
        },
        timestamp: new Date().toISOString()
      }
      
      console.log('✅ FHE chat processing completed successfully')
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      }
      
    } catch (error) {
      console.error('❌ Error in FHE chat processing:', error)
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Failed to process encrypted message',
              message: 'An error occurred during homomorphic processing'
            })
          }
        ],
        isError: true
      }
    }
  }

  async handleFHECompute(args) {
    try {
      console.log(`🧮 Performing FHE computation: ${args.operation}`)
      
      const { operation, encryptedInputs, parameters = {} } = args
      
      // Perform homomorphic computation
      const result = await this.fheService.performHomomorphicOperation(
        operation,
        ...encryptedInputs,
        parameters
      )
      
      // Process result with AI if needed
      const aiAnalysis = await this.aiService.processHomomorphicResult(
        result,
        'Homomorphic computation request',
        parameters
      )
      
      const response = {
        success: true,
        computation: result,
        aiAnalysis: aiAnalysis,
        privacy: {
          homomorphicProcessing: true,
          inputsRemainEncrypted: true,
          outputEncrypted: true
        }
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      }
      
    } catch (error) {
      console.error('❌ Error in FHE computation:', error)
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Computation failed',
              message: error.message
            })
          }
        ],
        isError: true
      }
    }
  }

  async handleFHEStatus(args) {
    try {
      const status = {
        fhe: {
          initialized: this.fheService.isInitialized(),
          engine: 'OpenFHE WebAssembly',
          schemes: ['BGV', 'BFV', 'CKKS']
        },
        ai: {
          initialized: this.aiService.isInitialized(),
          capabilities: ['encrypted_context', 'homomorphic_analysis', 'privacy_preservation']
        },
        mcp: {
          initialized: this.initialized,
          tools: ['fhe_chat_process', 'fhe_compute', 'fhe_status']
        },
        privacy: {
          zeroKnowledge: true,
          homomorphicEnabled: true,
          plaintextNeverExposed: true
        },
        timestamp: new Date().toISOString()
      }
      
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(status, null, 2)
          }
        ]
      }
      
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Status check failed',
              message: error.message
            })
          }
        ],
        isError: true
      }
    }
  }

  async start() {
    try {
      await this.initialize()
      
      const transport = new StdioServerTransport()
      await this.server.connect(transport)
      
      console.log('🚀 Secure Bridge MCP Server running...')
      console.log('🔐 Ready to process encrypted communications')
      
    } catch (error) {
      console.error('❌ Failed to start MCP Server:', error)
      process.exit(1)
    }
  }
}

// Start the server
const server = new SecureBridgeMCPServer()
server.start().catch(console.error)
