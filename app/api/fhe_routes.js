const express = require('express');
const FHEService = require('../services/fhe_service');
const ApiResponse = require('../utils/api_response');
const ApiError = require('../utils/api_error');

const router = express.Router();
const fheService = new FHEService();

// Initialize FHE service on startup
let initializationPromise = null;

const ensureFHEInitialized = async (req, res, next) => {
    try {
        if (!initializationPromise) {
            initializationPromise = fheService.initialize();
        }
        
        await initializationPromise;
        
        if (!fheService.isInitialized()) {
            throw new ApiError('FHE service not properly initialized', 503);
        }
        
        next();
    } catch (error) {
        console.error('FHE initialization error:', error);
        res.status(503).json(new ApiError('FHE service unavailable', 503));
    }
};

// Test FHE service status
router.get('/status', async (req, res) => {
    try {
        const isInitialized = fheService.isInitialized();
        res.json(new ApiResponse({
            initialized: isInitialized,
            service: 'OpenFHE WebAssembly',
            timestamp: new Date().toISOString()
        }, 'FHE service status'));
    } catch (error) {
        res.status(500).json(new ApiError('Error checking FHE status', 500));
    }
});

// Encrypt a message
router.post('/encrypt', ensureFHEInitialized, async (req, res) => {
    try {
        const { message } = req.body;
        
        if (!message || typeof message !== 'string') {
            return res.status(400).json(new ApiError('Message is required and must be a string', 400));
        }

        const encrypted = await fheService.encryptMessage(message);
        
        res.json(new ApiResponse(encrypted, 'Message encrypted successfully'));
    } catch (error) {
        console.error('Encryption error:', error);
        res.status(500).json(new ApiError('Failed to encrypt message', 500));
    }
});

// Decrypt a message
router.post('/decrypt', ensureFHEInitialized, async (req, res) => {
    try {
        const { encryptedData } = req.body;
        
        if (!encryptedData || !encryptedData.ciphertext) {
            return res.status(400).json(new ApiError('Encrypted data is required', 400));
        }

        const decrypted = await fheService.decryptMessage(encryptedData);
        
        res.json(new ApiResponse({ message: decrypted }, 'Message decrypted successfully'));
    } catch (error) {
        console.error('Decryption error:', error);
        res.status(500).json(new ApiError('Failed to decrypt message', 500));
    }
});

// Perform homomorphic operations
router.post('/compute', ensureFHEInitialized, async (req, res) => {
    try {
        const { operation, inputs } = req.body;
        
        if (!operation || !inputs || !Array.isArray(inputs)) {
            return res.status(400).json(new ApiError('Operation and inputs array are required', 400));
        }

        const result = await fheService.performHomomorphicOperation(operation, ...inputs);
        
        res.json(new ApiResponse(result, 'Homomorphic computation completed'));
    } catch (error) {
        console.error('Computation error:', error);
        res.status(500).json(new ApiError('Failed to perform computation', 500));
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
            version: '1.3.1'
        };
        
        res.json(new ApiResponse(capabilities, 'FHE capabilities'));
    } catch (error) {
        console.error('Error getting capabilities:', error);
        res.status(500).json(new ApiError('Failed to get FHE capabilities', 500));
    }
});

module.exports = router;
