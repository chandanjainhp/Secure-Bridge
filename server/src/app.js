import express from "express";

// CORS middleware – allows cross‑origin requests
import cors from "cors";

// Cookie‑parser middleware – makes cookies available in req.cookies
import cookieParser from "cookie-parser";

// Security headers middleware
import helmet from "helmet";

// Security middleware collection
import {
  securityMiddleware,
  rateLimiters,
  slowDownMiddleware,
  securityHeaders,
  securityLogging,
} from "./middlewares/security.middleware.js";

// Create the Express app
const app = express();


// ------------------------------------------------------------
//  Security headers
// ------------------------------------------------------------
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: [
          "'self'",
          'https://api.openai.com',
          'https://api.anthropic.com',
          'https://generativelanguage.googleapis.com',
        ],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// ------------------------------------------------------------
//  Additional security middleware
// ------------------------------------------------------------
app.use(securityMiddleware.mongoSanitize);
app.use(securityMiddleware.compression);
app.use(securityHeaders);
app.use(securityLogging);

app.use('/api/', rateLimiters.general);
app.use('/api/auth/', rateLimiters.auth);
app.use('/api/auth/', slowDownMiddleware.auth);
app.use('/api/api-key/', rateLimiters.createApiKey);
app.use('/api/api-key/', rateLimiters.testApiKey);
app.use('/api/', slowDownMiddleware.general);

// ------------------------------------------------------------
//  CORS configuration
// ------------------------------------------------------------
app.use(
  cors({
    origin: process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
      : ["http://localhost:5173", "http://127.0.0.1:5173"],
    credentials: true, // allow cookies and auth headers
  }),
);

// ------------------------------------------------------------
//  Body parsing middleware
// ------------------------------------------------------------
app.use(
  express.json({
    limit: "16kb", // prevent large JSON payloads
  }),
);

app.use(
  express.urlencoded({
    extended: true, // allow nested objects in form data
    limit: "16kb",
  }),
);

// Serve static files from the 'public' folder
app.use(express.static("public"));

// ------------------------------------------------------------
//  Cookie parser
// ------------------------------------------------------------
app.use(cookieParser());

// ------------------------------------------------------------
//  Route imports
// ------------------------------------------------------------
import userRouter from "./routes/user.router.js";
import authRouter from "./routes/auth.router.js";
import fheRouter from "./routes/fhe.router.js";
import chatRouter from "./routes/chat.router.js";
import aiRouter from "./routes/ai.router.js";
import projectRouter from "./routes/project.router.js";
import apiKeyRouter from "./routes/apikey.router.js";
import usageRouter from "./routes/usage.router.js";
import mongoose from "mongoose";

// ------------------------------------------------------------
//  Health check endpoints
// ------------------------------------------------------------
app.get("/health/mongodb", async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const states = {
      0: "disconnected",
      1: "connected",
      2: "connecting",
      3: "disconnecting",
    };

    if (dbState === 1) {
      await mongoose.connection.db.admin().ping();
      res.status(200).json({
        service: "mongodb",
        status: "healthy",
        state: states[dbState],
        connected: true,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        service: "mongodb",
        status: "unhealthy",
        state: states[dbState],
        connected: false,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    res.status(503).json({
      service: "mongodb",
      status: "error",
      error: error.message,
      connected: false,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/health/llm", async (req, res) => {
  try {
    const LLM_SERVER_URL =
      process.env.VITE_LOCAL_LLM_URL || "http://localhost:1234";

    const response = await fetch(`${LLM_SERVER_URL}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = await response.json();
      res.status(200).json({
        service: "llm_server",
        status: "healthy",
        url: LLM_SERVER_URL,
        connected: true,
        models: data.data?.length || 0,
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(503).json({
        service: "llm_server",
        status: "unhealthy",
        url: LLM_SERVER_URL,
        connected: false,
        http_status: response.status,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    const LLM_SERVER_URL =
      process.env.VITE_LOCAL_LLM_URL || "http://localhost:1234";
    res.status(503).json({
      service: "llm_server",
      status: "error",
      url: LLM_SERVER_URL,
      error: error.message,
      connected: false,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get("/health", async (req, res) => {
  try {
    const mongoState = mongoose.connection.readyState;
    const mongoHealthy = mongoState === 1;

    let llmHealthy = false;
    let llmError = null;
    try {
      const LLM_SERVER_URL =
        process.env.VITE_LOCAL_LLM_URL || "http://localhost:1234";
      const response = await fetch(`${LLM_SERVER_URL}/v1/models`, {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      });
      llmHealthy = response.ok;
    } catch (error) {
      llmError = error.message;
    }

    const overallHealthy = mongoHealthy && llmHealthy;

    res.status(overallHealthy ? 200 : 503).json({
      status: overallHealthy ? "healthy" : "degraded",
      services: {
        mongodb: {
          healthy: mongoHealthy,
          state: ["disconnected", "connected", "connecting", "disconnecting"][
            mongoState
          ],
        },
        llm_server: {
          healthy: llmHealthy,
          error: llmError,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ------------------------------------------------------------
//  Root route
// ------------------------------------------------------------
app.get("/", (req, res) => {
  const baseEndpoints = {
    register: "/api/v1/users/register",
    login: "/api/v1/users/login",
    health: "/health",
    mongodb_health: "/health/mongodb",
    llm_health: "/health/llm",
    fhe_status: "/api/v1/fhe/status",
    fhe_encrypt: "/api/v1/fhe/encrypt",
    fhe_decrypt: "/api/v1/fhe/decrypt",
    fhe_compute: "/api/v1/fhe/compute",
  };

  const endpoints =
    process.env.NODE_ENV === "development"
      ? {
          ...baseEndpoints,
          create_test_user: "/api/v1/users/create-test-user",
          verify_user: "/api/v1/users/verify-user/:email",
        }
      : baseEndpoints;

  res.status(200).json({
    message: "🚀 API is running successfully!",
    environment: process.env.NODE_ENV || "production",
    endpoints,
    cors_enabled: true,
    allowed_origins: [
      "http://localhost:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ],
    ...(process.env.NODE_ENV === "development" && {
      development_notes: {
        email_verification: "Bypassed in development mode",
        test_user:
          "Use POST /api/v1/users/create-test-user to create test user",
        test_credentials: "email: test@example.com, password: password123",
      },
    }),
  });
});

// ------------------------------------------------------------
//  Mount API routers
// ------------------------------------------------------------
app.use("/api/v1/users", userRouter);
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/fhe", fheRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/ai", aiRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/api-key", apiKeyRouter);
app.use("/api/v1/usage", usageRouter);

// ------------------------------------------------------------
//  Global error handling middleware (must be last)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  console.error("API Error:", {
    statusCode,
    message,
    stack: err.stack,
    url: req.url,
    method: req.method,
  });

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: err.errors || [],
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ------------------------------------------------------------
//  Export the app
// ------------------------------------------------------------
export { app };
