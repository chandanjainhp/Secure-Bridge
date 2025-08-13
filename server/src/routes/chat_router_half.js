import express from 'express';

const router = express.Router();

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
