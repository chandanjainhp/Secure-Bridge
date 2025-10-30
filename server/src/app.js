import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from 'mongoose';

// Import enhanced middleware and services
import LoggingService from './services/loggingService.js';
import databaseService from './db/database.js';
import { 
  securityMiddleware, 
  rateLimiters, 
  slowDownMiddleware, 
  securityHeaders,
  securityLogging 
} from './middlewares/security.middleware.js';

// Create an Express application instance
const app = express();

// Apply security headers first
app.use(securityHeaders);

// Apply security middleware
app.use(securityMiddleware.helmet);
app.use(securityMiddleware.mongoSanitize);
app.use(securityMiddleware.compression);

// Apply general rate limiting and slow down
// TEMPORARILY DISABLED for API key access
// app.use(rateLimiters.general);
app.use(slowDownMiddleware.general);

// Apply security logging
app.use(securityLogging);

// Configure CORS with enhanced security
app.use(cors({
  origin: [
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : []),
    "http://localhost:3000",
    "http://localhost:3001", 
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8000",
    "http://localhost:8080",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:8000"
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin', 
    'X-Requested-With', 
    'Content-Type', 
    'Accept', 
    'Authorization', 
    'X-API-Key',
    'X-Model',
    'X-Encryption-Enabled',
    'x-encryption-enabled',
    'Cache-Control'
  ],
  exposedHeaders: [
    'X-RateLimit-Remaining-Daily',
    'X-RateLimit-Limit-Daily',
    'X-API-Key-ID',
    'X-Response-Time'
  ],
  maxAge: 86400 // 24 hours
}));

// Enhanced body parsing with size limits
app.use(express.json({
  limit: process.env.MAX_JSON_SIZE || "1mb",
  strict: true,
  type: ['application/json', 'application/*+json']
}));

app.use(express.urlencoded({
  extended: true,
  limit: process.env.MAX_URLENCODED_SIZE || "1mb",
  parameterLimit: 100
}));

// Static files with security headers
app.use(express.static("public", {
  maxAge: process.env.NODE_ENV === 'production' ? '7d' : '0',
  etag: true,
  lastModified: true,
  setHeaders: (res, path) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// Cookie parser with security options
app.use(cookieParser(process.env.COOKIE_SECRET, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000 // 24 hours
}));

// Request timing middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  
  // Override res.end to add timing header before sending response
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - req.startTime;
    if (!res.headersSent) {
      res.setHeader('X-Response-Time', `${duration}ms`);
    }
    
    // Log API requests
    LoggingService.logApiRequest(req, res, duration);
    
    // Call original end method
    originalEnd.apply(this, args);
  };
  
  next();
});

// ROUTES CONFIGURATION:
import userRouter from './routes/user.router.js';
import fheRouter from './routes/fhe.router.js';
import chatRouter from './routes/chat.router.js';
import testRouter from './routes/test.router.js';
import adminRouter from './routes/admin.router.js';
import apiKeyRouter from './routes/apikey.router.js';
// import mcpRoutes from './routes/mcpRoutes.js'; // Commented out - using standalone MCP server

// Log successful imports
LoggingService.info('✅ All routers imported successfully');

// ENHANCED HEALTH CHECK ROUTES:

// MongoDB health check with detailed information
app.get('/health/mongodb', async (req, res) => {
    try {
        const health = await databaseService.healthCheck();
        
        const statusCode = health.connected ? 200 : 503;
        
        LoggingService.logSystemHealth('mongodb', health.connected ? 'healthy' : 'unhealthy', health);
        
        res.status(statusCode).json({
            service: 'mongodb',
            ...health,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        LoggingService.logSystemHealth('mongodb', 'error', { error: error.message });
        res.status(503).json({
            service: 'mongodb',
            status: 'error',
            error: error.message,
            connected: false,
            timestamp: new Date().toISOString()
        });
    }
});

// LLM Server health check with enhanced error handling
app.get('/health/llm', async (req, res) => {
    try {
        const LLM_SERVER_URL = process.env.VITE_LOCAL_LLM_URL || 'http://localhost:1234';
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(`${LLM_SERVER_URL}/v1/models`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'SecureBridge-HealthCheck/1.0'
            }
        });
        
        clearTimeout(timeoutId);
        
        const responseData = response.ok ? await response.json().catch(() => ({})) : {};
        
        const healthData = {
            service: 'llm_server',
            status: response.ok ? 'healthy' : 'unhealthy',
            url: LLM_SERVER_URL,
            connected: response.ok,
            statusCode: response.status,
            models: responseData.data?.length || 0,
            timestamp: new Date().toISOString()
        };
        
        LoggingService.logSystemHealth('llm_server', response.ok ? 'healthy' : 'unhealthy', healthData);
        
        res.status(response.ok ? 200 : 503).json(healthData);
    } catch (error) {
        const LLM_SERVER_URL = process.env.VITE_LOCAL_LLM_URL || 'http://localhost:1234';
        const errorData = {
            service: 'llm_server',
            status: 'error',
            url: LLM_SERVER_URL,
            error: error.name === 'AbortError' ? 'Connection timeout' : error.message,
            connected: false,
            timestamp: new Date().toISOString()
        };
        
        LoggingService.logSystemHealth('llm_server', 'error', errorData);
        res.status(503).json(errorData);
    }
});

// System information endpoint
app.get('/health/system', async (req, res) => {
    try {
        const systemInfo = {
            service: 'system',
            status: 'healthy',
            node: {
                version: process.version,
                platform: process.platform,
                arch: process.arch,
                uptime: process.uptime()
            },
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        };
        
        // Add database stats if available
        if (databaseService.isHealthy) {
            try {
                const dbStats = await databaseService.getStats();
                systemInfo.database = {
                    collections: dbStats.collections,
                    documents: dbStats.documents,
                    dataSize: dbStats.dataSize,
                    storageSize: dbStats.storageSize
                };
            } catch (error) {
                systemInfo.database = { error: 'Unable to fetch database stats' };
            }
        }
        
        res.status(200).json(systemInfo);
    } catch (error) {
        LoggingService.error('System health check failed', { error: error.message });
        res.status(500).json({
            service: 'system',
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Combined health check with detailed status
app.get('/health', async (req, res) => {
    try {
        const healthChecks = await Promise.allSettled([
            databaseService.healthCheck(),
            (async () => {
                try {
                    const LLM_SERVER_URL = process.env.VITE_LOCAL_LLM_URL || 'http://localhost:1234';
                    const response = await fetch(`${LLM_SERVER_URL}/v1/models`, {
                        method: 'GET',
                        signal: AbortSignal.timeout(5000)
                    });
                    return { service: 'llm_server', healthy: response.ok, status: response.status };
                } catch (error) {
                    return { service: 'llm_server', healthy: false, error: error.message };
                }
            })()
        ]);
        
        const mongoHealth = healthChecks[0].status === 'fulfilled' 
            ? healthChecks[0].value 
            : { connected: false, error: healthChecks[0].reason?.message };
            
        const llmHealth = healthChecks[1].status === 'fulfilled' 
            ? healthChecks[1].value 
            : { healthy: false, error: healthChecks[1].reason?.message };
        
        const overallHealthy = mongoHealth.connected && llmHealth.healthy;
        
        const healthStatus = {
            status: overallHealthy ? 'healthy' : 'degraded',
            services: {
                mongodb: {
                    healthy: mongoHealth.connected,
                    details: mongoHealth
                },
                llm_server: {
                    healthy: llmHealth.healthy,
                    details: llmHealth
                },
                api: {
                    healthy: true,
                    uptime: process.uptime(),
                    memory: process.memoryUsage()
                }
            },
            timestamp: new Date().toISOString()
        };
        
        LoggingService.logSystemHealth('overall', overallHealthy ? 'healthy' : 'degraded', healthStatus);
        
        res.status(overallHealthy ? 200 : 503).json(healthStatus);
    } catch (error) {
        LoggingService.error('Overall health check failed', { error: error.message });
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// ROOT ROUTE - Comprehensive API information and status
app.get("/", async (req, res) => {
    try {
        LoggingService.info('Root endpoint accessed', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        const uptime = process.uptime();
        const uptimeFormatted = `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
        
        // Get database status
        let dbStatus = 'unknown';
        try {
            const dbHealth = await databaseService.checkHealth();
            dbStatus = dbHealth.status;
        } catch (error) {
            dbStatus = 'error';
            LoggingService.warn('Database health check failed in root endpoint', { error: error.message });
        }
        
        res.status(200).json({
            success: true,
            message: "🌉 Secure Bridge API - Advanced FHE & LLM Proxy System",
            version: "1.0.0",
            environment: process.env.NODE_ENV || 'development',
            uptime: uptimeFormatted,
            timestamp: new Date().toISOString(),
            status: {
                api: "operational",
                database: dbStatus,
                services: "operational"
            },
            
            // Comprehensive API Documentation
            api: {
                baseUrl: "/api/v1",
                documentation: "Visit /api/v1/docs for interactive API documentation",
                
                endpoints: {
                    health: {
                        description: "System health monitoring",
                        routes: {
                            general: "GET /health - Overall system health",
                            mongodb: "GET /health/mongodb - Database connectivity",
                            llm: "GET /health/llm - LLM service status",
                            system: "GET /health/system - System resources"
                        }
                    },
                    
                    authentication: {
                        description: "User authentication and JWT token management",
                        routes: {
                            register: "POST /api/v1/users/register - Create new user account",
                            login: "POST /api/v1/users/login - Authenticate user",
                            refresh: "POST /api/v1/users/refresh - Refresh JWT token",
                            profile: "GET /api/v1/users/profile - Get user profile",
                            logout: "POST /api/v1/users/logout - Invalidate session"
                        },
                        authentication: "Bearer JWT token required (except register/login)"
                    },
                    
                    apiKeys: {
                        description: "Secure API key management with AES-256-GCM encryption",
                        routes: {
                            list: "GET /api/v1/api-keys - List user's API keys",
                            create: "POST /api/v1/api-keys - Create new API key",
                            get: "GET /api/v1/api-keys/:id - Get specific API key",
                            update: "PUT /api/v1/api-keys/:id - Update API key settings",
                            delete: "DELETE /api/v1/api-keys/:id - Delete API key",
                            regenerate: "POST /api/v1/api-keys/:id/regenerate - Generate new key",
                            test: "POST /api/v1/api-keys/:id/test - Validate external API key",
                            analytics: "GET /api/v1/api-keys/analytics - Usage statistics",
                            bulk: "POST /api/v1/api-keys/bulk - Bulk operations",
                            export: "GET /api/v1/api-keys/export - Export keys (encrypted)"
                        },
                        authentication: "Bearer JWT token or API key",
                        supportedProviders: ["openai", "anthropic", "google", "azure", "huggingface", "custom"]
                    },
                    
                    chat: {
                        description: "LLM proxy service with unified interface",
                        routes: {
                            completions: "POST /api/v1/chat/completions - Chat completions",
                            providers: "GET /api/v1/chat/providers - Available providers",
                            models: "GET /api/v1/chat/models - Available models per provider"
                        },
                        authentication: "API key required",
                        rateLimits: "30 requests per minute per API key"
                    },
                    
                    fhe: {
                        description: "Fully Homomorphic Encryption operations using OpenFHE",
                        routes: {
                            encrypt: "POST /api/v1/fhe/encrypt - Encrypt plaintext data",
                            decrypt: "POST /api/v1/fhe/decrypt - Decrypt ciphertext",
                            compute: "POST /api/v1/fhe/compute - Perform computations on encrypted data",
                            keygen: "POST /api/v1/fhe/keygen - Generate FHE keypairs",
                            schemes: "GET /api/v1/fhe/schemes - Supported FHE schemes"
                        },
                        authentication: "Bearer JWT token or API key",
                        supportedSchemes: ["CKKS", "BGV", "BFV"]
                    },
                    
                    admin: {
                        description: "Administrative operations (admin role required)",
                        routes: {
                            users: "GET /api/v1/admin/users - Manage users",
                            analytics: "GET /api/v1/admin/analytics - System analytics",
                            logs: "GET /api/v1/admin/logs - System logs",
                            maintenance: "POST /api/v1/admin/maintenance - System maintenance"
                        },
                        authentication: "Bearer JWT token with admin role",
                        rateLimits: "20 requests per 15 minutes"
                    }
                }
            },
            
            // System Information
            system: {
                nodeVersion: process.version,
                platform: process.platform,
                architecture: process.arch,
                pid: process.pid,
                memoryUsage: {
                    rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`,
                    heapTotal: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)} MB`,
                    heapUsed: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`,
                    external: `${Math.round(process.memoryUsage().external / 1024 / 1024)} MB`
                },
                cpuUsage: process.cpuUsage()
            },
            
            // Security Features
            security: {
                features: [
                    "🔐 JWT Authentication with Refresh Tokens",
                    "🔑 API Key Management with AES-256-GCM Encryption",
                    "🛡️ Comprehensive Rate Limiting",
                    "✅ Input Validation & Sanitization", 
                    "🌐 CORS Protection with Configurable Origins",
                    "🔒 Helmet Security Headers",
                    "💉 MongoDB Injection Protection",
                    "📊 Comprehensive Audit Logging",
                    "🚫 IP/Domain Whitelisting Support",
                    "📈 Usage Analytics & Monitoring"
                ],
                rateLimits: {
                    general: "100 requests per 15 minutes per IP",
                    authentication: "5 login attempts per 15 minutes per IP",
                    admin: "20 requests per 15 minutes per user",
                    chat: "30 requests per minute per API key",
                    apiKeys: "50 requests per 15 minutes per user"
                },
                encryption: {
                    algorithm: "AES-256-GCM",
                    keyDerivation: "PBKDF2 with SHA-256",
                    ivGeneration: "Cryptographically secure random"
                }
            },
            
            // Development Information
            ...(process.env.NODE_ENV === 'development' && {
                development: {
                    debugEndpoint: "/api/v1/debug",
                    testEndpoints: "/api/v1/test/*",
                    logLevel: process.env.LOG_LEVEL || 'debug',
                    hotReload: "Enabled",
                    stackTraces: "Enabled in error responses"
                }
            })
        });
    } catch (error) {
        LoggingService.error('Error in root endpoint', {
            error: error.message,
            stack: error.stack
        });
        
        res.status(500).json({
            success: false,
            message: "🌉 Secure Bridge API",
            version: "1.0.0",
            status: "error",
            timestamp: new Date().toISOString(),
            error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
        });
    }
});

// MOUNT ROUTES with specific rate limiting where needed

// Mount the user router with auth-specific rate limiting for sensitive endpoints
app.use("/api/v1/users", userRouter);
LoggingService.info('🔗 User router mounted at /api/v1/users');

// Mount the FHE router for homomorphic encryption operations
app.use("/api/v1/fhe", fheRouter);
LoggingService.info('🔗 FHE router mounted at /api/v1/fhe');

// Mount the chat router for LLM proxy operations
app.use("/api/v1/chat", chatRouter);
LoggingService.info('🔗 Chat router mounted at /api/v1/chat');

// Mount test router for debugging (only in development)
if (process.env.NODE_ENV === 'development') {
    app.use("/api/v1/test", testRouter);
    LoggingService.info('🔗 Test router mounted at /api/v1/test');
}

// Mount admin router with strict rate limiting
app.use("/api/v1/admin", rateLimiters.admin, adminRouter);
LoggingService.info('🔗 Admin router mounted at /api/v1/admin');

// Mount API key router (has its own internal rate limiting)
app.use("/api/v1/api-keys", apiKeyRouter);
LoggingService.info('🔗 API key router mounted at /api/v1/api-keys');

// Mount MCP router for Model Context Protocol operations
// app.use("/api/v1/mcp", mcpRoutes); // Commented out - using standalone MCP server
// LoggingService.info('🔗 MCP router mounted at /api/v1/mcp');

// Direct debug route (development only)
if (process.env.NODE_ENV === 'development') {
    app.get('/api/v1/debug', (req, res) => {
        LoggingService.debug('Debug endpoint called', {
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        
        res.json({ 
            message: 'Direct route works!', 
            timestamp: new Date().toISOString(),
            environment: process.env.NODE_ENV,
            nodeVersion: process.version,
            uptime: process.uptime()
        });
    });
    LoggingService.info('🔗 Direct debug route registered');
}

// 404 handler for unmatched routes
app.use('*', (req, res) => {
    LoggingService.warn('404 - Route not found', {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent')
    });
    
    res.status(404).json({
        success: false,
        statusCode: 404,
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
        availableEndpoints: '/api/v1'
    });
});

// ENHANCED ERROR HANDLING MIDDLEWARE (must be placed AFTER all routes)
app.use((err, req, res, next) => {
    // Log the error with context
    const errorContext = {
        method: req.method,
        url: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?._id,
        apiKeyId: req.apiKey?._id,
        body: req.method !== 'GET' ? req.body : undefined,
        params: req.params,
        query: req.query
    };

    // Determine error details
    const statusCode = err.statusCode || err.status || 500;
    const message = err.message || "Internal Server Error";
    const isOperational = err.statusCode && err.statusCode < 500;

    // Log based on severity
    if (statusCode >= 500) {
        LoggingService.logErrorWithStack(err, errorContext);
    } else if (statusCode >= 400) {
        LoggingService.warn(`Client Error: ${message}`, {
            statusCode,
            ...errorContext
        });
    }

    // Log security-related errors
    if (statusCode === 401 || statusCode === 403 || statusCode === 429) {
        LoggingService.logSecurityEvent('access_denied', {
            statusCode,
            message,
            ...errorContext
        });
    }

    // Prepare error response
    const errorResponse = {
        success: false,
        statusCode,
        message,
        timestamp: new Date().toISOString(),
        requestId: req.id || Date.now().toString()
    };

    // Add additional error details in development
    if (process.env.NODE_ENV === 'development') {
        errorResponse.stack = err.stack;
        errorResponse.details = err.details || {};
    }

    // Add validation errors if present
    if (err.errors && Array.isArray(err.errors)) {
        errorResponse.validationErrors = err.errors;
    }

    // Add rate limit information if it's a rate limit error
    if (statusCode === 429) {
        errorResponse.retryAfter = err.retryAfter || '15 minutes';
        errorResponse.rateLimit = {
            message: "Rate limit exceeded. Please slow down your requests.",
            windowMs: err.windowMs || 900000, // 15 minutes default
            limit: err.limit || 100
        };
    }

    // Send response
    res.status(statusCode).json(errorResponse);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    LoggingService.error('Unhandled Promise Rejection', {
        reason: reason?.message || reason,
        stack: reason?.stack,
        promise: promise.toString()
    });
    
    // In production, you might want to gracefully shut down
    if (process.env.NODE_ENV === 'production') {
        console.error('Unhandled Promise Rejection. Shutting down gracefully...');
        process.exit(1);
    }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    LoggingService.error('Uncaught Exception', {
        message: error.message,
        stack: error.stack,
        name: error.name
    });
    
    console.error('Uncaught Exception. Shutting down...');
    process.exit(1);
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    LoggingService.info(`${signal} received. Starting graceful shutdown...`);
    
    try {
        // Close database connection
        if (databaseService) {
            await databaseService.disconnect();
        }
        
        // Close any other resources (Redis, etc.)
        // Add other cleanup tasks here
        
        LoggingService.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        LoggingService.error('Error during graceful shutdown', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
};

// Listen for shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export the configured Express app
export { app };
