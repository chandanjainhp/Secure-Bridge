// Unified server that combines basic Express app with optional MCP functionality
// This file serves as the main entry point when running in unified mode

import dotenv from "dotenv";
import { app } from "./app.js";
import connectDB from "./db/index.js";
import LoggingService from './services/loggingService.js';
import redisService from './services/redis.service.js';

// Configure environment variables
dotenv.config({
    path: `./.env`
});

// MCP Integration (optional)
let mcpServer = null;

// Function to start MCP server if enabled
async function startMCPServer() {
    if (process.env.ENABLE_MCP === 'true') {
        try {
            LoggingService.info('🚀 Starting MCP server...');
            
            // For now, we'll skip MCP server startup since it's separate
            LoggingService.info('✅ MCP server functionality available separately');
        } catch (error) {
            LoggingService.warn('⚠️  MCP server failed to start, continuing without MCP functionality', {
                error: error.message
            });
            // Continue without MCP functionality
        }
    } else {
        LoggingService.info('🔧 MCP server disabled via ENABLE_MCP environment variable');
    }
}

// Function to gracefully shutdown servers
async function gracefulShutdown(signal) {
    LoggingService.info(`${signal} received. Starting graceful shutdown...`);
    
    try {
        // Disconnect from Redis
        await redisService.disconnect();
        
        // Stop MCP server if running
        if (mcpServer && typeof mcpServer.close === 'function') {
            await mcpServer.close();
            LoggingService.info('✅ MCP server closed');
        }
        
        LoggingService.info('✅ Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        LoggingService.error('❌ Error during graceful shutdown', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Main startup function
async function startServer() {
    try {
        LoggingService.info('🌉 Starting Secure Bridge Unified Server...');
        LoggingService.info(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
        LoggingService.info(`🔧 MCP Enabled: ${process.env.ENABLE_MCP === 'true' ? 'Yes' : 'No'}`);
        
        // Connect to database first
        await connectDB();
        LoggingService.info('✅ Database connected successfully');
        
        // Connect to Redis (optional - won't fail if unavailable)
        await redisService.connect();
        
        // Start MCP server if enabled
        await startMCPServer();
        
        // Add error handling for Express app
        app.on('error', (error) => {
            LoggingService.error('Express app error', { error: error.message });
            throw error;
        });
        
        // Start the main Express server
        const PORT = process.env.PORT || 8001; // Changed from 8000 to avoid conflicts
        const server = app.listen(PORT, () => {
            LoggingService.info(`🚀 Express server running on port ${PORT}`);
            LoggingService.info(`🌐 API available at: http://localhost:${PORT}`);
            LoggingService.info(`📚 API documentation at: http://localhost:${PORT}/api/v1`);
            
            if (process.env.ENABLE_MCP === 'true') {
                LoggingService.info(`🔗 MCP server status: ${mcpServer ? 'Running' : 'Failed to start'}`);
            }
            
            LoggingService.info('✅ Secure Bridge server startup complete!');
        });
        
        // Store server reference for cleanup
        process.server = server;
        
        // Setup graceful shutdown handlers
        process.on('SIGTERM', gracefulShutdown);
        process.on('SIGINT', gracefulShutdown);
        
        return server;
        
    } catch (error) {
        LoggingService.error('❌ Server startup failed', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

// Start the server
startServer().catch((error) => {
    console.error('❌ Fatal error during server startup:', error);
    process.exit(1);
});

// Export for testing
export { app, startServer };
