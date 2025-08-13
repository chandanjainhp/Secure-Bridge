import express from 'express';

console.log('🤖 Chat router loaded successfully');

const router = express.Router();

// Simple test route
router.get('/test', (req, res) => {
    console.log('🧪 Test endpoint called');
    res.json({ message: 'Chat router is working!', timestamp: new Date().toISOString() });
});

// LLM Server configuration
const LLM_SERVER_URL = 'http://localhost:1234/v1';

// Proxy chat completions to LLM server
router.post('/completions', async (req, res) => {
    try {
        console.log('🤖 Proxying chat request to LLM server:', req.body);
        
        const response = await fetch(`${LLM_SERVER_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body)
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('LLM server error:', response.status, errorText);
            return res.status(response.status).json({
                success: false,
                message: `LLM server error: ${response.statusText}`,
                error: errorText
            });
        }

        const data = await response.json();
        console.log('✅ LLM response received successfully');
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Error proxying to LLM server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to connect to LLM server',
            error: error.message
        });
    }
});

// Proxy models request to LLM server
router.get('/models', async (req, res) => {
    try {
        console.log('📋 Fetching models from LLM server');
        
        const response = await fetch(`${LLM_SERVER_URL}/models`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('LLM server error:', response.status, errorText);
            return res.status(response.status).json({
                success: false,
                message: `LLM server error: ${response.statusText}`,
                error: errorText
            });
        }

        const data = await response.json();
        console.log('✅ Models fetched successfully');
        
        res.json(data);
        
    } catch (error) {
        console.error('❌ Error fetching models from LLM server:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to connect to LLM server',
            error: error.message
        });
    }
});

// Health check for LLM server
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

export default router;
