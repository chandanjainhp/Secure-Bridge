import express from "express";

// Import CORS (Cross-Origin Resource Sharing) middleware
// CORS allows your API to be accessed from different domains/origins
// Without CORS, browsers block requests from different domains for security
import cors from "cors"

// Import cookie-parser middleware 
// This middleware parses cookies from incoming requests and makes them available in req.cookies
// Useful for handling authentication tokens, user preferences, etc.
import cookieParser from "cookie-parser";

// Create an Express application instance
// This 'app' object represents your web server and will handle all HTTP requests
const app = express()

// Configure and apply CORS middleware to all routes
app.use(cors({
    // Set which domain(s) are allowed to make requests to this API
    // Allow multiple origins for development flexibility
    origin: [
        // Parse CORS_ORIGIN environment variable (supports comma-separated values)
        ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : []),
        "http://localhost:3000",
        "http://localhost:3001", 
        "http://localhost:5173",  // Vite dev server (default)
        "http://localhost:5174",  // Vite dev server (when 5173 is in use)
        "http://localhost:8000",  // Backend server
        "http://localhost:8080",
        "http://127.0.0.1:5173",  // Alternative localhost format
        "http://127.0.0.1:5174",  // Alternative localhost format for Vite
        "http://127.0.0.1:3000",
        "http://127.0.0.1:8000"   // Alternative localhost format for backend
    ],
    
    // Allow cookies and authorization headers to be sent with cross-origin requests
    // This is essential for authentication systems that use cookies or JWT tokens
    // Without this, the browser won't send cookies with requests from other domains
    credentials: true
}))



// Built-in Express middleware to parse JSON data from request bodies
// This allows your server to understand JSON data sent in POST/PUT requests
app.use(express.json({
    // limit: "16kb" - Sets maximum size of JSON payload to 16 kilobytes
    // This prevents clients from sending extremely large JSON data that could:
    // 1. Crash your server due to memory overload
    // 2. Slow down your application
    // 3. Be used in denial-of-service attacks
    // Example: When client sends {"name": "John", "age": 25}, it becomes available as req.body
    limit: "16kb"
}))

// Built-in Express middleware to parse URL-encoded data from HTML forms
// This handles data sent from HTML forms with method="POST"
app.use(express.urlencoded({
    // extended: true - Allows parsing of rich objects and arrays in URL-encoded data
    // With extended: true, you can send nested objects like: user[name]=John&user[age]=25
    // With extended: false, you can only send simple key-value pairs: name=John&age=25
    extended: true,
    
    // limit: "16kb" - Same as above, limits the size of form data to 16KB
    // Protects against large file uploads or malicious oversized form submissions
    limit: "16kb"
}))
app.use(express.static("public"))

// Apply cookie-parser middleware to all routes
// This middleware automatically parses Cookie headers and populates req.cookies object
// Apply cookie-parser middleware to all routes
// This middleware automatically parses Cookie headers and populates req.cookies object
// Example: If client sends "Cookie: token=abc123", you can access it via req.cookies.token
app.use(cookieParser())

// ROUTES CONFIGURATION:

// Import the user router that contains all user-related routes
// This router will handle all requests that start with /api/v1/users
import userRouter from './routes/user.router.js'

// Import the FHE router for privacy-preserving operations
import fheRouter from './routes/fhe.router.js'

// Import the chat router for LLM proxy operations
import chatRouter from './routes/chat.router.js'
console.log('✅ Chat router imported successfully');

// Import test router for debugging
import testRouter from './routes/test.router.js'
console.log('✅ Test router imported successfully');

// Import health check utilities
import mongoose from 'mongoose'

// HEALTH CHECK ROUTES:

// MongoDB health check
app.get('/health/mongodb', async (req, res) => {
    try {
        // Check MongoDB connection status
        const dbState = mongoose.connection.readyState;
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };
        
        if (dbState === 1) {
            // Ping the database to ensure it's responsive
            await mongoose.connection.db.admin().ping();
            res.status(200).json({
                service: 'mongodb',
                status: 'healthy',
                state: states[dbState],
                connected: true,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                service: 'mongodb',
                status: 'unhealthy',
                state: states[dbState],
                connected: false,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        res.status(503).json({
            service: 'mongodb',
            status: 'error',
            error: error.message,
            connected: false,
            timestamp: new Date().toISOString()
        });
    }
});

// LLM Server health check
app.get('/health/llm', async (req, res) => {
    try {
        const LLM_SERVER_URL = process.env.VITE_LOCAL_LLM_URL || 'http://localhost:1234';
        
        // Try to fetch from LLM server
        const response = await fetch(`${LLM_SERVER_URL}/v1/models`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000) // 5 second timeout
        });
        
        if (response.ok) {
            const data = await response.json();
            res.status(200).json({
                service: 'llm_server',
                status: 'healthy',
                url: LLM_SERVER_URL,
                connected: true,
                models: data.data?.length || 0,
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(503).json({
                service: 'llm_server',
                status: 'unhealthy',
                url: LLM_SERVER_URL,
                connected: false,
                http_status: response.status,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error) {
        const LLM_SERVER_URL = process.env.VITE_LOCAL_LLM_URL || 'http://localhost:1234';
        res.status(503).json({
            service: 'llm_server',
            status: 'error',
            url: LLM_SERVER_URL,
            error: error.message,
            connected: false,
            timestamp: new Date().toISOString()
        });
    }
});

// Combined health check
app.get('/health', async (req, res) => {
    try {
        // Check MongoDB
        const mongoState = mongoose.connection.readyState;
        const mongoHealthy = mongoState === 1;
        
        // Check LLM Server
        let llmHealthy = false;
        let llmError = null;
        try {
            const LLM_SERVER_URL = process.env.VITE_LOCAL_LLM_URL || 'http://localhost:1234';
            const response = await fetch(`${LLM_SERVER_URL}/v1/models`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            llmHealthy = response.ok;
        } catch (error) {
            llmError = error.message;
        }
        
        const overallHealthy = mongoHealthy && llmHealthy;
        
        res.status(overallHealthy ? 200 : 503).json({
            status: overallHealthy ? 'healthy' : 'degraded',
            services: {
                mongodb: {
                    healthy: mongoHealthy,
                    state: ['disconnected', 'connected', 'connecting', 'disconnecting'][mongoState]
                },
                llm_server: {
                    healthy: llmHealthy,
                    error: llmError
                }
            },
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            status: 'error',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// REMOVED: Direct controller import - not needed since it's handled in the router
// import { registerUser } from "./controllers/use.controller.js";

// Root route - handles requests to http://localhost:8000/
app.get('/', (req, res) => {
    const baseEndpoints = {
        register: "/api/v1/users/register",
        login: "/api/v1/users/login",
        health: "/health",
        mongodb_health: "/health/mongodb",
        llm_health: "/health/llm",
        fhe_status: "/api/v1/fhe/status",
        fhe_encrypt: "/api/v1/fhe/encrypt",
        fhe_decrypt: "/api/v1/fhe/decrypt",
        fhe_compute: "/api/v1/fhe/compute"
    };
    
    // Add development endpoints if in development mode
    const endpoints = process.env.NODE_ENV === 'development' 
        ? {
            ...baseEndpoints,
            create_test_user: "/api/v1/users/create-test-user",
            verify_user: "/api/v1/users/verify-user/:email"
        }
        : baseEndpoints;
    
    res.status(200).json({
        message: "🚀 API is running successfully!",
        environment: process.env.NODE_ENV || 'production',
        endpoints: endpoints,
        cors_enabled: true,
        allowed_origins: [
            "http://localhost:5173",
            "http://localhost:5174",
            "http://localhost:8000",
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:8080"
        ],
        ...(process.env.NODE_ENV === 'development' && {
            development_notes: {
                email_verification: "Bypassed in development mode",
                test_user: "Use POST /api/v1/users/create-test-user to create test user",
                test_credentials: "email: test@example.com, password: password123"
            }
        })
    });
});

// Mount the user router at the /api/v1/users path
// This means all routes defined in userRouter will be prefixed with /api/v1/users
// For example, if userRouter has a route "/register", the full path becomes "/api/v1/users/register"
app.use("/api/v1/users", userRouter)

// Mount the FHE router at the /api/v1/fhe path for homomorphic encryption operations
app.use("/api/v1/fhe", fheRouter)

// Mount the chat router at the /api/v1/chat path for LLM proxy operations
app.use("/api/v1/chat", chatRouter)
console.log('🔗 Chat router mounted at /api/v1/chat');

// Mount test router for debugging
app.use("/api/v1/test", testRouter)
console.log('🔗 Test router mounted at /api/v1/test');

// Direct test route in app.js
app.get('/api/v1/debug', (req, res) => {
    console.log('🐛 Debug endpoint called');
    res.json({ message: 'Direct route works!', timestamp: new Date().toISOString() });
});
console.log('🔗 Direct debug route registered');

// ERROR HANDLING MIDDLEWARE (must be placed AFTER all routes)
// Global error handler that catches all errors thrown in the application
app.use((err, req, res, next) => {
    // Default status code and message
    let statusCode = err.statusCode || 500;
    let message = err.message || "Internal Server Error";
    
    // Log the error for debugging
    console.error('API Error:', {
        statusCode,
        message,
        stack: err.stack,
        url: req.url,
        method: req.method
    });
    
    // Send JSON error response
    return res.status(statusCode).json({
        success: false,
        statusCode,
        message,
        errors: err.errors || [],
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// URL STRUCTURE:
// http://localhost:8000/ - Root route
// http://localhost:8000/api/v1/users/register - User registration

// Export the configured Express app so it can be imported in other files (like index.js)
export { app }
