import express from "express";

// CORS middleware – allows cross‑origin requests
import cors from "cors";

// Cookie‑parser middleware – makes cookies available in req.cookies
import cookieParser from "cookie-parser";

// Security headers middleware
import dotenv from "dotenv";
dotenv.config({ path: new URL("../.env", import.meta.url) });

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

const allowedOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin is not allowed"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
  ],
};

// ------------------------------------------------------------
//  Security headers
// ------------------------------------------------------------
app.use(securityMiddleware.helmet);

// ------------------------------------------------------------
//  CORS configuration
// ------------------------------------------------------------
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

app.use((req, res, next) => {
  const origin = req.get("Origin");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  if (!origin || allowedOrigins.includes(origin)) return next();
  return res
    .status(403)
    .json({
      success: false,
      statusCode: 403,
      message: "Origin is not allowed",
    });
});

// ------------------------------------------------------------
//  Additional security middleware
// ------------------------------------------------------------
app.use(securityMiddleware.mongoSanitize);
app.use(securityMiddleware.compression);
app.use(securityHeaders);
app.use(securityLogging);

app.use("/api/", rateLimiters.general);
app.use("/api/v1/auth/", rateLimiters.auth);
app.use("/api/v1/auth/", slowDownMiddleware.auth);
app.use("/api/v1/api-key/", rateLimiters.createApiKey);
app.use("/api/v1/api-key/", rateLimiters.testApiKey);
app.use("/api/", slowDownMiddleware.general);

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
import authRouter from "./features/auth/routes/auth.router.js";
import fheRouter from "./routes/fhe.router.js";
import chatRouter from "./features/chat/routes/chat.router.js";
import projectRouter from "./features/projects/routes/project.router.js";
import apiKeyRouter from "./features/api-key/routes/apiKey.router.js";
import usageRouter from "./features/usage/routes/usageRoutes.js";
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
      process.env.LLM_SERVER_URL || "http://localhost:1234/v1";

    const response = await fetch(
      `${LLM_SERVER_URL.replace(/\/$/, "")}/models`,
      {
        method: "GET",
        signal: AbortSignal.timeout(5000),
      },
    );

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
      process.env.LLM_SERVER_URL || "http://localhost:1234/v1";
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
        process.env.LLM_SERVER_URL || "http://localhost:1234/v1";
      const response = await fetch(
        `${LLM_SERVER_URL.replace(/\/$/, "")}/models`,
        {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        },
      );
      llmHealthy = response.ok;
    } catch (error) {
      llmError = error.message;
    }

    const overallHealthy = mongoHealthy;

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
    register: "/api/v1/auth/register",
    login: "/api/v1/auth/login",
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
        }
      : baseEndpoints;

  res.status(200).json({
    message: "🚀 API is running successfully!",
    environment: process.env.NODE_ENV || "production",
    endpoints,
    cors_enabled: true,
    allowed_origins: allowedOrigins,
    ...(process.env.NODE_ENV === "development" && {
      development_notes: {
        email_verification: "Bypassed in development mode",
        test_credentials: "email: test@example.com, password: password123",
      },
    }),
  });
});

// ------------------------------------------------------------
//  Mount API routers
// ------------------------------------------------------------
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/fhe", fheRouter);
app.use("/api/v1/chat", chatRouter);
app.use("/api/v1/projects", projectRouter);
app.use("/api/v1/api-key", apiKeyRouter);
app.use("/api/v1/usage", usageRouter);

// ------------------------------------------------------------
//  Global error handling middleware (must be last)
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  if (err?.name === "MulterError") {
    err.statusCode = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    err.message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Uploaded file is too large"
        : "Invalid file upload";
  }
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  if (err?.name === "ValidationError") {
    statusCode = 400;
    message = "Request validation failed";
  } else if (err?.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource identifier";
  } else if (err?.code === 11000) {
    statusCode = 409;
    message = "A resource with the same unique value already exists";
  }

  console.error("API Error", {
    statusCode,
    name: err?.name,
    method: req.method,
    url: req.originalUrl,
  });

  return res.status(statusCode).json({
    success: false,
    statusCode,
    message,
    errors: Array.isArray(err?.errors) ? err.errors : [],
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

// ------------------------------------------------------------
//  Export the app
// ------------------------------------------------------------
export { app };
