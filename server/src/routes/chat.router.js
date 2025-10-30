import express from 'express';
import { verifyJWTOrApiKey } from '../middlewares/apikey.middleware.js';
import { trackApiUsage } from '../middlewares/apikey.middleware.js';

console.log('🤖 Chat router loaded successfully');

const router = express.Router();

// Apply API usage tracking to all routes
router.use(trackApiUsage);

// Simple test route
router.get('/test', (req, res) => {
    console.log('🧪 Test endpoint called');
    res.json({ message: 'Chat router is working!', timestamp: new Date() });
});

// LLM Server configuration
const LLM_SERVER_URL = 'http://localhost:1234/v1';

// Smart chat completions with local LLM and external API fallback
router.post('/completions', verifyJWTOrApiKey('chat.access', 'chat.completions'), async (req, res) => {
    try {
        const { model, messages, temperature = 0.7, max_tokens = 1000 } = req.body;
        const provider = req.headers['x-provider'] || 'auto'; // auto, local, google, openai, anthropic
        
        console.log('🤖 Chat request:', { model, provider, messagesCount: messages?.length });

        // Determine which provider to use
        let selectedProvider = provider;
        let selectedModel = model || 'gemma-3-4b-it-qat';
        
        // Auto-detect provider from model name if not specified
        if (provider === 'auto' || !provider) {
            if (model?.includes('gemini') || model?.includes('google')) {
                selectedProvider = 'google';
                selectedModel = model || 'gemini-1.5-pro-latest';
            } else if (model?.includes('gpt') || model?.includes('openai')) {
                selectedProvider = 'openai';
                selectedModel = model || 'gpt-4';
            } else if (model?.includes('claude') || model?.includes('anthropic')) {
                selectedProvider = 'anthropic';
                selectedModel = model || 'claude-3-haiku-20240307';
            } else {
                selectedProvider = 'local';
                selectedModel = 'gemma-3-4b-it-qat';
            }
        }

        console.log('🎯 Selected provider:', selectedProvider, 'model:', selectedModel);

        // Try local LLM first for local provider
        if (selectedProvider === 'local') {
            try {
                console.log('🏠 Attempting local LLM connection...');
                const localResponse = await fetch(`${LLM_SERVER_URL}/chat/completions`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: selectedModel,
                        messages,
                        temperature,
                        max_tokens,
                        stream: false
                    }),
                    timeout: 5000 // 5 second timeout for local server
                });

                if (localResponse.ok) {
                    const data = await localResponse.json();
                    console.log('✅ Local LLM response received');
                    return res.json({
                        ...data,
                        provider_used: 'local',
                        model_used: selectedModel
                    });
                } else {
                    throw new Error(`Local server returned ${localResponse.status}`);
                }
            } catch (localError) {
                console.log('⚠️  Local LLM not available:', localError.message);
                // Fallback to external API if available
                console.log('🔄 Falling back to external API...');
                
                // Try to find a suitable external API key
                const fallbackResult = await tryExternalApiFallback(req, messages, temperature, max_tokens);
                if (fallbackResult) {
                    return res.json(fallbackResult);
                }
                
                // If no fallback available, return error
                return res.status(503).json({
                    success: false,
                    message: 'Local LLM server not available and no external API keys configured',
                    error: localError.message,
                    fallback_attempted: true
                });
            }
        }

        // Handle external API providers
        const apiResult = await handleExternalApiRequest(selectedProvider, selectedModel, messages, temperature, max_tokens, req);
        if (apiResult) {
            return res.json(apiResult);
        }

        // If all else fails
        return res.status(500).json({
            success: false,
            message: 'No available chat providers',
            provider_requested: selectedProvider
        });

    } catch (error) {
        console.error('❌ Error in chat completions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process chat request',
            error: error.message
        });
    }
});

// Helper function to try external API fallback when local LLM fails
async function tryExternalApiFallback(req, messages, temperature, max_tokens) {
    try {
        // Get user's API keys
        const { ApiKey } = await import('../models/apikey.model.js');
        const userId = req.user?._id;
        
        if (!userId) {
            console.log('⚠️  No user ID for API key lookup');
            return null;
        }

        // Find active API keys for external providers
        const externalKeys = await ApiKey.find({
            userId: userId,
            status: 'active',
            permissions: { $in: ['chat.access', 'chat.completions'] },
            $or: [
                { externalProvider: { $in: ['google', 'google_ai_studio', 'openai', 'anthropic', 'azure', 'cohere'] } },
                { provider: { $in: ['google', 'google_ai_studio', 'openai', 'anthropic', 'azure', 'cohere'] } }
            ]
        });

        console.log('🔍 Found external API keys:', externalKeys.length);
        
        // Log the actual keys found for debugging
        externalKeys.forEach(key => {
            console.log('📋 Available API key:', {
                provider: key.provider || key.externalProvider,
                name: key.name,
                permissions: key.permissions
            });
        });

        // Try Google/Gemini first if available (including Google AI Studio)
        const googleKey = externalKeys.find(key => {
            const provider = (key.provider || key.externalProvider || '').toLowerCase();
            return provider.includes('google');
        });
        
        if (googleKey) {
            console.log('🔄 Fallback to Google Gemini API');
            const actualProvider = googleKey.provider || googleKey.externalProvider;
            const result = await handleExternalApiRequest(actualProvider, 'gemini-1.5-pro-latest', messages, temperature, max_tokens, req, googleKey);
            if (result) return result;
        }

        // Try OpenAI if available
        const openaiKey = externalKeys.find(key => 
            (key.provider || key.externalProvider || '').toLowerCase().includes('openai')
        );
        
        if (openaiKey) {
            console.log('🔄 Fallback to OpenAI API');
            const result = await handleExternalApiRequest('openai', 'gpt-3.5-turbo', messages, temperature, max_tokens, req, openaiKey);
            if (result) return result;
        }

        return null;
    } catch (error) {
        console.error('❌ Error in external API fallback:', error);
        return null;
    }
}

// Helper function to handle external API requests
async function handleExternalApiRequest(provider, model, messages, temperature, max_tokens, req, forcedApiKey = null) {
    try {
        // Get API key for the provider
        let apiKey = forcedApiKey;
        
        if (!apiKey) {
            const { ApiKey } = await import('../models/apikey.model.js');
            const userId = req.user?._id;
            
            if (!userId) {
                console.log('⚠️  No user ID for external API request');
                return null;
            }

            const keyQuery = {
                userId: userId,
                status: 'active',
                permissions: { $in: ['chat.access', 'chat.completions'] },
                $or: [
                    { externalProvider: provider },
                    { provider: provider },
                    // Also match google_ai_studio for google provider requests
                    ...(provider === 'google' ? [
                        { externalProvider: 'google_ai_studio' },
                        { provider: 'google_ai_studio' }
                    ] : [])
                ]
            };

            apiKey = await ApiKey.findOne(keyQuery);
            
            if (!apiKey) {
                console.log('⚠️  No API key found for provider:', provider);
                return null;
            }
        }

        console.log('🔑 Using API key for provider:', provider, 'Key ID:', apiKey._id);

        // Decrypt the external key if it's encrypted
        let decryptedKey = apiKey.key;
        if (apiKey.externalKeyEncrypted && apiKey.encryptionIV) {
            try {
                const { ApiKey } = await import('../models/apikey.model.js');
                const decryptedData = ApiKey.decryptExternalKey({
                    encrypted: apiKey.externalKeyEncrypted,
                    iv: apiKey.encryptionIV,
                    tag: apiKey.encryptionTag
                });
                decryptedKey = decryptedData;
                console.log('🔓 Successfully decrypted external API key');
            } catch (decryptError) {
                console.error('❌ Failed to decrypt API key:', decryptError.message);
                
                // If decryption fails, try using the key field directly as a fallback
                if (apiKey.key && typeof apiKey.key === 'string' && apiKey.key.length > 10) {
                    console.log('🔄 Attempting fallback to direct key field');
                    decryptedKey = apiKey.key;
                } else {
                    console.error('❌ No fallback key available, skipping this API key');
                    return null;
                }
            }
        }

        // Handle different providers
        if (provider === 'google' || provider === 'google_ai_studio') {
            return await handleGoogleAPI(decryptedKey, model, messages, temperature, max_tokens);
        } else if (provider === 'openai') {
            return await handleOpenAIAPI(decryptedKey, model, messages, temperature, max_tokens);
        } else if (provider === 'anthropic') {
            return await handleAnthropicAPI(decryptedKey, model, messages, temperature, max_tokens);
        }

        return null;
    } catch (error) {
        console.error('❌ Error in external API handler:', error);
        return null;
    }
}

// Google Gemini API handler
async function handleGoogleAPI(apiKey, model, messages, temperature, max_tokens) {
    try {
        console.log('🔍 Calling Google Gemini API...');
        
        // Convert OpenAI format to Google format
        const contents = messages
            .filter(msg => msg.role !== 'system') // Google doesn't support system messages in this format
            .map(msg => ({
                role: msg.role === 'assistant' ? 'model' : msg.role,
                parts: [{ text: msg.content }]
            }));

        const requestBody = {
            contents,
            generationConfig: {
                temperature,
                maxOutputTokens: max_tokens,
                topP: 0.8,
                topK: 10
            }
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google API error:', response.status, errorText);
            throw new Error(`Google API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';

        // Convert to OpenAI-compatible format
        return {
            id: `google-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            provider_used: 'google',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: text
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: data?.usageMetadata?.promptTokenCount || 0,
                completion_tokens: data?.usageMetadata?.candidatesTokenCount || 0,
                total_tokens: data?.usageMetadata?.totalTokenCount || 0
            }
        };
    } catch (error) {
        console.error('❌ Google API error:', error);
        throw error;
    }
}

// OpenAI API handler
async function handleOpenAIAPI(apiKey, model, messages, temperature, max_tokens) {
    try {
        console.log('🤖 Calling OpenAI API...');
        
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model,
                messages,
                temperature,
                max_tokens
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('OpenAI API error:', response.status, errorText);
            throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        return {
            ...data,
            provider_used: 'openai'
        };
    } catch (error) {
        console.error('❌ OpenAI API error:', error);
        throw error;
    }
}

// Anthropic API handler
async function handleAnthropicAPI(apiKey, model, messages, temperature, max_tokens) {
    try {
        console.log('🧠 Calling Anthropic API...');
        
        // Convert to Claude format (system message separate, user/assistant alternating)
        const systemMessage = messages.find(msg => msg.role === 'system')?.content || '';
        const conversationMessages = messages
            .filter(msg => msg.role !== 'system')
            .map(msg => ({
                role: msg.role,
                content: msg.content
            }));

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model,
                max_tokens,
                temperature,
                system: systemMessage,
                messages: conversationMessages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Anthropic API error:', response.status, errorText);
            throw new Error(`Anthropic API error: ${response.status} ${errorText}`);
        }

        const data = await response.json();
        
        // Convert to OpenAI-compatible format
        return {
            id: `anthropic-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: model,
            provider_used: 'anthropic',
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: data.content?.[0]?.text || ''
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: data.usage?.input_tokens || 0,
                completion_tokens: data.usage?.output_tokens || 0,
                total_tokens: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0)
            }
        };
    } catch (error) {
        console.error('❌ Anthropic API error:', error);
        throw error;
    }
}

// Providers endpoint to check what chat providers are available
router.get('/providers', verifyJWTOrApiKey('chat.access'), async (req, res) => {
    try {
        const userId = req.user?._id;
        console.log('🔍 Checking available providers for user:', userId);
        
        const providers = {
            local: { available: false, reason: 'Local LLM server offline' },
            google: { available: false, reason: 'No Google API key configured' },
            openai: { available: false, reason: 'No OpenAI API key configured' },
            anthropic: { available: false, reason: 'No Anthropic API key configured' }
        };

        // Check local LLM server
        try {
            const localResponse = await fetch(`${LLM_SERVER_URL}/models`, {
                method: 'GET',
                timeout: 3000
            });
            
            if (localResponse.ok) {
                providers.local = { 
                    available: true, 
                    endpoint: LLM_SERVER_URL,
                    status: 'connected'
                };
                console.log('✅ Local LLM server available');
            }
        } catch (error) {
            console.log('⚠️  Local LLM server not available:', error.message);
            providers.local.reason = error.message;
        }

        // Check user's API keys for external providers
        if (userId) {
            try {
                const { ApiKey } = await import('../models/apikey.model.js');
                const userApiKeys = await ApiKey.find({
                    userId: userId,
                    status: 'active',
                    permissions: { $in: ['chat.access', 'chat.completions'] }
                });

                console.log('🔑 Found user API keys:', userApiKeys.length);
                
                // Check each provider
                const googleKey = userApiKeys.find(key => {
                    const provider = (key.provider || key.externalProvider || '').toLowerCase();
                    return provider.includes('google');
                });
                
                if (googleKey) {
                    providers.google = { 
                        available: true, 
                        keyId: googleKey._id,
                        keyName: googleKey.name,
                        status: 'configured'
                    };
                }

                const openaiKey = userApiKeys.find(key => {
                    const provider = (key.provider || key.externalProvider || '').toLowerCase();
                    return provider.includes('openai');
                });
                
                if (openaiKey) {
                    providers.openai = { 
                        available: true, 
                        keyId: openaiKey._id,
                        keyName: openaiKey.name,
                        status: 'configured'
                    };
                }

                const anthropicKey = userApiKeys.find(key => {
                    const provider = (key.provider || key.externalProvider || '').toLowerCase();
                    return provider.includes('anthropic');
                });
                
                if (anthropicKey) {
                    providers.anthropic = { 
                        available: true, 
                        keyId: anthropicKey._id,
                        keyName: anthropicKey.name,
                        status: 'configured'
                    };
                }

            } catch (error) {
                console.error('❌ Error checking API keys:', error);
            }
        }

        const availableCount = Object.values(providers).filter(p => p.available).length;
        console.log(`✅ Found ${availableCount} available providers`);

        res.json({
            success: true,
            providers,
            totalProviders: Object.keys(providers).length,
            availableProviders: availableCount,
            message: availableCount > 0 ? 'Chat providers available' : 'No chat providers available',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error('❌ Error checking providers:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check providers',
            error: error.message
        });
    }
});

// Enhanced models endpoint with provider support
router.get('/models', verifyJWTOrApiKey('chat.access'), async (req, res) => {
    try {
        const provider = req.query.provider || 'all';
        const userId = req.user?._id;
        console.log('📋 Fetching models for provider:', provider, 'user:', userId);
        
        let models = {};

        // Check local LLM server availability
        if (provider === 'all' || provider === 'local') {
            try {
                const localResponse = await fetch(`${LLM_SERVER_URL}/models`, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' },
                    timeout: 3000
                });

                if (localResponse.ok) {
                    const localData = await localResponse.json();
                    models.local = {
                        available: true,
                        models: localData.data?.map(model => ({
                            id: model.id,
                            name: model.id,
                            description: 'Local LLM model',
                            type: 'local',
                            requiresApiKey: false
                        })) || [{
                            id: 'gemma-3-4b-it-qat',
                            name: 'Gemma 2B (Local)',
                            description: 'Local Gemma model running on localhost:1234',
                            type: 'local',
                            requiresApiKey: false
                        }]
                    };
                    console.log('✅ Local models available:', models.local.models.length);
                } else {
                    throw new Error('Local server not responding');
                }
            } catch (error) {
                console.log('⚠️  Local LLM server not available:', error.message);
                models.local = {
                    available: false,
                    error: error.message,
                    models: []
                };
            }
        }

        // Get user's API keys for external providers
        if (userId && (provider === 'all' || ['google', 'openai', 'anthropic'].includes(provider))) {
            try {
                const { ApiKey } = await import('../models/apikey.model.js');
                const userApiKeys = await ApiKey.find({
                    userId: userId,
                    status: 'active',
                    permissions: { $in: ['chat.access', 'chat.completions'] }
                });

                console.log('🔑 Found user API keys:', userApiKeys.length);

                // Google/Gemini models
                const googleKeys = userApiKeys.filter(key => 
                    (key.provider || key.externalProvider || '').toLowerCase().includes('google')
                );
                
                if (googleKeys.length > 0 && (provider === 'all' || provider === 'google')) {
                    models.google = {
                        available: true,
                        apiKeyCount: googleKeys.length,
                        models: [
                            {
                                id: 'gemini-1.5-flash',
                                name: 'Gemini 1.5 Flash',
                                description: 'Fast and efficient multimodal model for scaling across diverse tasks',
                                type: 'api',
                                provider: 'google',
                                requiresApiKey: true
                            },
                            {
                                id: 'gemini-1.5-pro',
                                name: 'Gemini 1.5 Pro',
                                description: 'Mid-size multimodal model that supports up to 2 million tokens',
                                type: 'api',
                                provider: 'google',
                                requiresApiKey: true
                            },
                            {
                                id: 'gemini-2.0-flash',
                                name: 'Gemini 2.0 Flash',
                                description: 'Latest fast and versatile multimodal model',
                                type: 'api',
                                provider: 'google',
                                requiresApiKey: true
                            }
                        ]
                    };
                }

                // OpenAI models
                const openaiKeys = userApiKeys.filter(key => 
                    (key.provider || key.externalProvider || '').toLowerCase().includes('openai')
                );
                
                if (openaiKeys.length > 0 && (provider === 'all' || provider === 'openai')) {
                    models.openai = {
                        available: true,
                        apiKeyCount: openaiKeys.length,
                        models: [
                            {
                                id: 'gpt-4',
                                name: 'GPT-4',
                                description: 'OpenAI GPT-4 model',
                                type: 'api',
                                provider: 'openai',
                                requiresApiKey: true
                            },
                            {
                                id: 'gpt-3.5-turbo',
                                name: 'GPT-3.5 Turbo',
                                description: 'Fast and cost-effective OpenAI model',
                                type: 'api',
                                provider: 'openai',
                                requiresApiKey: true
                            }
                        ]
                    };
                }

                // Anthropic models
                const anthropicKeys = userApiKeys.filter(key => 
                    (key.provider || key.externalProvider || '').toLowerCase().includes('anthropic')
                );
                
                if (anthropicKeys.length > 0 && (provider === 'all' || provider === 'anthropic')) {
                    models.anthropic = {
                        available: true,
                        apiKeyCount: anthropicKeys.length,
                        models: [
                            {
                                id: 'claude-3-haiku-20240307',
                                name: 'Claude 3 Haiku',
                                description: 'Anthropic Claude 3 Haiku model',
                                type: 'api',
                                provider: 'anthropic',
                                requiresApiKey: true
                            },
                            {
                                id: 'claude-3-sonnet-20240229',
                                name: 'Claude 3 Sonnet',
                                description: 'Anthropic Claude 3 Sonnet model',
                                type: 'api',
                                provider: 'anthropic',
                                requiresApiKey: true
                            }
                        ]
                    };
                }

            } catch (error) {
                console.error('❌ Error fetching user API keys:', error);
            }
        }

        // Flatten models for legacy compatibility
        const allModels = [];
        Object.values(models).forEach(providerData => {
            if (providerData.models) {
                allModels.push(...providerData.models);
            }
        });

        const response = {
            success: true,
            data: allModels, // Legacy format for compatibility
            providers: models, // New detailed format
            provider_requested: provider,
            user_id: userId,
            message: 'Models retrieved successfully'
        };

        console.log('✅ Models response:', {
            totalModels: allModels.length,
            providers: Object.keys(models),
            localAvailable: models.local?.available,
            apiProviders: Object.keys(models).filter(p => p !== 'local')
        });
        
        res.json(response);
        
    } catch (error) {
        console.error('❌ Error fetching models:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch models',
            error: error.message,
            providers: {}
        });
    }
});

// Health check for LLM server (no auth required)
console.log('🏥 Registering /health endpoint');
router.get('/health', async (req, res) => {
    console.log('🏥 Health endpoint called');
    try {
        const response = await fetch(`${LLM_SERVER_URL}/models`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        const isHealthy = response.ok;
        
        res.json({
            success: true,
            data: {
                llm_server: {
                    healthy: isHealthy,
                    url: LLM_SERVER_URL,
                    status: response.status
                }
            },
            message: 'LLM server health check completed'
        });
        
    } catch (error) {
        res.json({
            success: true,
            data: {
                llm_server: {
                    healthy: false,
                    url: LLM_SERVER_URL,
                    error: error.message
                }
            },
            message: 'LLM server health check completed'
        });
    }
});

// Unauthenticated test endpoint to verify backend is working
router.get('/test-unauth', (req, res) => {
    console.log('🧪 Unauthenticated test endpoint called');
    res.json({ 
        success: true,
        message: 'Backend server is working! This endpoint does not require authentication.',
        timestamp: new Date().toISOString(),
        server: 'Secure Bridge Backend',
        endpoints: {
            health: '/api/v1/chat/health',
            models: '/api/v1/chat/models (requires API key)',
            completions: '/api/v1/chat/completions (requires API key)',
            providers: '/api/v1/chat/providers (requires API key)'
        }
    });
});

// Test completions endpoint to check if local LLM is working
router.post('/test-local', async (req, res) => {
    console.log('🧪 Testing local LLM connection...');
    try {
        const testMessages = [
            { role: 'user', content: 'Hello! Please respond with just "Local LLM working" if you can see this.' }
        ];
        
        const localResponse = await fetch(`${LLM_SERVER_URL}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gemma-3-4b-it-qat',
                messages: testMessages,
                temperature: 0.7,
                max_tokens: 100
            }),
            timeout: 10000
        });

        if (localResponse.ok) {
            const data = await localResponse.json();
            res.json({
                success: true,
                message: 'Local LLM is working!',
                response: data?.choices?.[0]?.message?.content || 'No response content',
                provider: 'local',
                timestamp: new Date().toISOString()
            });
        } else {
            const errorText = await localResponse.text();
            res.json({
                success: false,
                message: 'Local LLM connection failed',
                error: `HTTP ${localResponse.status}: ${errorText}`,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error('❌ Local LLM test failed:', error);
        res.json({
            success: false,
            message: 'Local LLM test failed',
            error: error.message,
            suggestion: 'Make sure LM Studio or similar is running on localhost:1234',
            timestamp: new Date().toISOString()
        });
    }
});

// Demo API key creation endpoint (development only - no auth required)
if (process.env.NODE_ENV === 'development') {
    router.post('/create-demo-key', async (req, res) => {
        console.log('🔑 Creating demo API key for development testing...');
        try {
            const { ApiKey } = await import('../models/apikey.model.js');
            const crypto = await import('crypto');
            
            // Generate a demo API key
            const { key, keyPrefix, hashedKey } = ApiKey.generateKey();
            
            // Create demo user ID (just for testing)
            const demoUserId = new (await import('mongoose')).Types.ObjectId();
            
            const apiKeyData = {
                name: 'Demo API Key for Chat Testing',
                description: 'Temporary API key for testing chat functionality',
                userId: demoUserId,
                key,
                keyPrefix,
                hashedKey,
                isExternal: false,
                permissions: ["chat.access", "chat.completions", "fhe.encrypt", "mcp.connect"],
                rateLimit: {
                    requestsPerMinute: 100,
                    requestsPerHour: 1000,
                    requestsPerDay: 10000
                },
                ipWhitelist: [],
                status: 'active'
            };
            
            const apiKey = await ApiKey.create(apiKeyData);
            
            res.json({
                success: true,
                message: 'Demo API key created successfully!',
                data: {
                    id: apiKey._id,
                    key: key, // Only show once
                    name: apiKey.name,
                    permissions: apiKey.permissions,
                    status: apiKey.status,
                    usage: 'Include this key in X-API-Key header for authenticated requests'
                },
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            console.error('❌ Error creating demo API key:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create demo API key',
                error: error.message
            });
        }
    });

    // Get demo API key for frontend (development only - no auth required)
    router.get('/get-demo-key', async (req, res) => {
        console.log('🔑 Getting demo API key for frontend...');
        try {
            const { ApiKey } = await import('../models/apikey.model.js');
            
            // Find existing demo API key
            const demoKey = await ApiKey.findOne({
                name: 'Demo API Key for Chat Testing',
                status: 'active'
            }).select('-hashedKey');
            
            if (demoKey) {
                res.json({
                    success: true,
                    message: 'Demo API key retrieved successfully!',
                    data: {
                        _id: demoKey._id.toString(),
                        name: demoKey.name,
                        provider: 'internal',
                        status: demoKey.status,
                        permissions: demoKey.permissions,
                        key: demoKey.key, // Include for frontend use
                        encryptionEnabled: true,
                        usage: {
                            totalRequests: demoKey.usage?.totalRequests || 0,
                            requestsToday: 0,
                            lastUsed: demoKey.usage?.lastUsed || null
                        }
                    },
                    timestamp: new Date().toISOString()
                });
            } else {
                res.status(404).json({
                    success: false,
                    message: 'No demo API key found. Create one first.',
                    createEndpoint: '/api/v1/chat/create-demo-key'
                });
            }
            
        } catch (error) {
            console.error('❌ Error getting demo API key:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get demo API key',
                error: error.message
            });
        }
    });
}

export default router;
