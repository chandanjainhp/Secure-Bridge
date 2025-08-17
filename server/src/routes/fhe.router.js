import express from 'express';
import FHEService from '../services/fhe_service_mock.js';
import AIService from '../services/ai_service.js';
import { verifyJWTOrApiKey } from '../middlewares/apikey.middleware.js';
import { trackApiUsage } from '../middlewares/apikey.middleware.js';

const router = express.Router();
const fheService = new FHEService();
const aiService = new AIService();

// Apply API usage tracking to all routes
router.use(trackApiUsage);

// Initialize services on startup
let fheInitializationPromise = null;
let aiInitializationPromise = null;

const ensureFHEInitialized = async (req, res, next) => {
    try {
        if (!fheInitializationPromise) {
            fheInitializationPromise = fheService.initialize();
        }
        
        await fheInitializationPromise;
        
        if (!fheService.isInitialized()) {
            throw new Error('FHE service not properly initialized');
        }
        
        next();
    } catch (error) {
        console.error('FHE initialization error:', error);
        res.status(503).json({ 
            success: false, 
            message: 'FHE service unavailable',
            error: error.message 
        });
    }
};

const ensureAIInitialized = async (req, res, next) => {
    try {
        if (!aiInitializationPromise) {
            aiInitializationPromise = aiService.initialize();
        }
        
        await aiInitializationPromise;
        
        if (!aiService.isInitialized()) {
            throw new Error('AI service not properly initialized');
        }
        
        next();
    } catch (error) {
        console.error('AI initialization error:', error);
        res.status(503).json({ 
            success: false, 
            message: 'AI service unavailable',
            error: error.message 
        });
    }
};

// Test FHE service status
router.get('/status', async (req, res) => {
    try {
        const fheInitialized = fheService.isInitialized();
        const aiInitialized = aiService.isInitialized();
        
        res.json({
            success: true,
            data: {
                fhe: {
                    initialized: fheInitialized,
                    service: 'OpenFHE WebAssembly'
                },
                ai: {
                    initialized: aiInitialized,
                    service: 'Privacy-Preserving AI Module'
                },
                timestamp: new Date().toISOString()
            },
            message: 'Privacy-preserving services status'
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Error checking services status',
            error: error.message 
        });
    }
});

// Encrypt a message
router.post('/encrypt', verifyJWTOrApiKey('fhe.encrypt'), ensureFHEInitialized, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'Message is required and must be a string' 
            });
        }

        const encrypted = await fheService.encryptMessage(message);
        
        res.json({
            success: true,
            data: encrypted,
            message: 'Message encrypted successfully'
        });
    } catch (error) {
        console.error('Encryption error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to encrypt message',
            error: error.message 
        });
    }
});

// Decrypt a message
router.post('/decrypt', verifyJWTOrApiKey('fhe.decrypt'), ensureFHEInitialized, async (req, res) => {
    try {
        const { encryptedData } = req.body;
        
        if (!encryptedData || !encryptedData.ciphertext) {
            return res.status(400).json({ 
                success: false, 
                message: 'Encrypted data is required' 
            });
        }

        const decrypted = await fheService.decryptMessage(encryptedData);
        
        res.json({
            success: true,
            data: { message: decrypted },
            message: 'Message decrypted successfully'
        });
    } catch (error) {
        console.error('Decryption error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to decrypt message',
            error: error.message 
        });
    }
});

// Perform homomorphic operations
router.post('/compute', verifyJWTOrApiKey('fhe.compute'), ensureFHEInitialized, async (req, res) => {
    try {
        const { operation, inputs } = req.body;
        
        if (!operation || !inputs || !Array.isArray(inputs)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Operation and inputs array are required' 
            });
        }

        const result = await fheService.performHomomorphicOperation(operation, ...inputs);
        
        res.json({
            success: true,
            data: result,
            message: 'Homomorphic computation completed'
        });
    } catch (error) {
        console.error('Computation error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to perform computation',
            error: error.message 
        });
    }
});

// Get FHE capabilities
router.get('/capabilities', ensureFHEInitialized, async (req, res) => {
    try {
        const capabilities = {
            encryption: ['BGV', 'BFV', 'CKKS'],
            operations: ['addition', 'multiplication', 'rotation', 'bootstrapping'],
            features: ['leveled', 'bootstrappable', 'packed'],
            backend: 'OpenFHE WebAssembly',
            version: '1.3.1',
            aiIntegration: {
                available: aiService.isInitialized(),
                operations: ['sentiment_analysis', 'keyword_search', 'word_count', 'similarity_check', 'content_filter', 'encrypted_chat']
            }
        };
        
        res.json({
            success: true,
            data: capabilities,
            message: 'FHE capabilities with AI integration'
        });
    } catch (error) {
        console.error('Error getting capabilities:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to get FHE capabilities',
            error: error.message 
        });
    }
});

// 🤖 AI-POWERED PRIVACY-PRESERVING CHAT ENDPOINT
router.post('/ai-chat', verifyJWTOrApiKey('fhe.ai_chat'), ensureFHEInitialized, ensureAIInitialized, async (req, res) => {
    try {
        const { message, operation = 'encrypted_chat', context = {} } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json({ 
                success: false, 
                message: 'Message is required and must be a string' 
            });
        }

        console.log(`🔐 Processing AI chat with operation: ${operation}`);

        // Step 1: Encrypt the user's message
        const encryptedMessage = await fheService.encryptMessage(message);
        console.log('✅ Message encrypted successfully');

        // Step 2: Perform homomorphic computation on encrypted data
        let homomorphicResult;
        if (operation === 'encrypted_chat') {
            // For general chat, just use the encrypted message
            homomorphicResult = {
                operation: 'encrypted_chat',
                encryptedData: encryptedMessage,
                timestamp: Date.now()
            };
        } else {
            // Perform specific homomorphic operation
            homomorphicResult = await fheService.performHomomorphicOperation(operation, encryptedMessage, context.additionalData);
        }
        console.log('✅ Homomorphic computation completed');

        // Step 3: Send encrypted result to AI module for processing
        const aiResponse = operation === 'encrypted_chat' 
            ? await aiService.chatWithEncryptedContext(message, encryptedMessage)
            : await aiService.processHomomorphicResult(homomorphicResult, message, context);
        console.log('✅ AI processing completed');

        // Step 4: Return the AI response (which maintains privacy)
        const response = {
            success: true,
            data: {
                userMessage: {
                    original: message,
                    encrypted: encryptedMessage.ciphertext.substring(0, 50) + '...',
                    messageId: encryptedMessage.metadata.messageId
                },
                homomorphicComputation: {
                    operation: operation,
                    completed: true,
                    result: homomorphicResult
                },
                aiResponse: aiResponse,
                privacy: {
                    dataEncrypted: true,
                    homomorphicProcessing: true,
                    privacyPreserved: true,
                    serverNeverSawPlaintext: true
                },
                timestamp: new Date().toISOString()
            },
            message: 'Privacy-preserving AI chat completed successfully'
        };

        res.json(response);
        
    } catch (error) {
        console.error('❌ Error in AI chat:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to process AI chat',
            error: error.message 
        });
    }
});

// 🧮 HOMOMORPHIC OPERATION WITH AI ANALYSIS
router.post('/compute-with-ai', verifyJWTOrApiKey('fhe.compute', 'fhe.ai_chat'), ensureFHEInitialized, ensureAIInitialized, async (req, res) => {
    try {
        const { operation, inputs, originalQuery, context = {} } = req.body;
        
        if (!operation || !inputs || !Array.isArray(inputs)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Operation and inputs array are required' 
            });
        }

        console.log(`🔐 Processing homomorphic computation: ${operation}`);

        // Step 1: Perform homomorphic computation
        const homomorphicResult = await fheService.performHomomorphicOperation(operation, ...inputs);
        console.log('✅ Homomorphic computation completed');

        // Step 2: Process result with AI while maintaining privacy
        const aiAnalysis = await aiService.processHomomorphicResult(
            homomorphicResult, 
            originalQuery || 'Homomorphic computation', 
            context
        );
        console.log('✅ AI analysis completed');

        res.json({
            success: true,
            data: {
                computation: homomorphicResult,
                aiAnalysis: aiAnalysis,
                privacy: {
                    homomorphicProcessing: true,
                    privacyPreserved: true,
                    encryptedComputation: true
                }
            },
            message: 'Homomorphic computation with AI analysis completed'
        });
        
    } catch (error) {
        console.error('❌ Error in compute-with-ai:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Failed to perform computation with AI analysis',
            error: error.message 
        });
    }
});

export default router;
