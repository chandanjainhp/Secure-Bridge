import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log levels
const logLevels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each log level
const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(logColors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf((info) => {
    const { timestamp, level, message, ...args } = info;
    const ts = timestamp.slice(0, 19).replace('T', ' ');
    return `${ts} [${level}]: ${message} ${Object.keys(args).length ? JSON.stringify(args, null, 2) : ''}`;
  })
);

// Custom format for file output
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Define different transports
const transports = [
  // Console transport for development
  new winston.transports.Console({
    format: consoleFormat,
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  }),

  // Error log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'error.log'),
    level: 'error',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Combined log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'combined.log'),
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
  }),

  // API operations log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'api-operations.log'),
    level: 'info',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5,
  }),

  // Security log file
  new winston.transports.File({
    filename: path.join(process.cwd(), 'logs', 'security.log'),
    level: 'warn',
    format: fileFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 10,
  }),
];

// Create the main logger
const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'development' ? 'debug' : 'info'),
  format: fileFormat,
  transports,
  exitOnError: false,
  handleExceptions: true,
  handleRejections: true,
});

// Create specialized loggers
export const apiLogger = winston.createLogger({
  levels: logLevels,
  level: 'info',
  format: fileFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'api-keys.log'),
      maxsize: 5242880,
      maxFiles: 5,
    }),
  ],
});

export const securityLogger = winston.createLogger({
  levels: logLevels,
  level: 'warn',
  format: fileFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'security.log'),
      maxsize: 5242880,
      maxFiles: 10,
    }),
    new winston.transports.Console({
      format: consoleFormat,
      level: 'error',
    }),
  ],
});

export const auditLogger = winston.createLogger({
  levels: logLevels,
  level: 'info',
  format: fileFormat,
  transports: [
    new winston.transports.File({
      filename: path.join(process.cwd(), 'logs', 'audit.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 20,
    }),
  ],
});

// Logging service class with specialized methods
class LoggingService {
  // General logging methods
  static info(message, meta = {}) {
    logger.info(message, meta);
  }

  static error(message, meta = {}) {
    logger.error(message, meta);
  }

  static warn(message, meta = {}) {
    logger.warn(message, meta);
  }

  static debug(message, meta = {}) {
    logger.debug(message, meta);
  }

  // API Key specific logging
  static logApiKeyOperation(operation, details) {
    const logData = {
      operation,
      timestamp: new Date().toISOString(),
      ...details,
    };

    apiLogger.info(`API Key ${operation}`, logData);
    
    // Also log to main logger if it's a significant operation
    if (['created', 'regenerated', 'revoked'].includes(operation)) {
      logger.info(`API Key ${operation}`, logData);
    }
  }

  // Security event logging
  static logSecurityEvent(event, details) {
    const logData = {
      event,
      timestamp: new Date().toISOString(),
      ...details,
    };

    securityLogger.warn(`Security Event: ${event}`, logData);
    
    // Also send critical events to main logger
    if (['suspicious_activity', 'rate_limit_exceeded', 'unauthorized_access'].includes(event)) {
      logger.error(`Security Alert: ${event}`, logData);
    }
  }

  // Audit logging for compliance
  static logAuditEvent(action, details) {
    const logData = {
      action,
      timestamp: new Date().toISOString(),
      ...details,
    };

    auditLogger.info(`Audit: ${action}`, logData);
  }

  // Authentication event logging
  static logAuthEvent(event, userId, details = {}) {
    const logData = {
      event,
      userId,
      timestamp: new Date().toISOString(),
      ...details,
    };

    const message = `Auth: ${event}`;
    
    if (['login_success', 'logout', 'token_refresh'].includes(event)) {
      logger.info(message, logData);
    } else if (['login_failed', 'invalid_token', 'session_expired'].includes(event)) {
      logger.warn(message, logData);
      securityLogger.warn(message, logData);
    } else {
      logger.error(message, logData);
      securityLogger.error(message, logData);
    }
  }

  // API request logging
  static logApiRequest(req, res, responseTime) {
    const logData = {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime: `${responseTime}ms`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      userId: req.user?._id,
      apiKeyId: req.apiKey?._id,
      timestamp: new Date().toISOString(),
    };

    // Log different levels based on status code
    if (res.statusCode >= 500) {
      logger.error('API Request Error', logData);
    } else if (res.statusCode >= 400) {
      logger.warn('API Request Client Error', logData);
    } else {
      logger.http('API Request', logData);
    }

    // Log API key usage separately
    if (req.apiKey) {
      this.logApiKeyOperation('used', {
        apiKeyId: req.apiKey._id,
        endpoint: req.originalUrl,
        method: req.method,
        statusCode: res.statusCode,
        responseTime,
        userId: req.user?._id,
      });
    }
  }

  // Database operation logging
  static logDatabaseOperation(operation, collection, details = {}) {
    const logData = {
      operation,
      collection,
      timestamp: new Date().toISOString(),
      ...details,
    };

    logger.debug(`Database: ${operation} on ${collection}`, logData);
  }

  // External API call logging
  static logExternalApiCall(provider, operation, details = {}) {
    const logData = {
      provider,
      operation,
      timestamp: new Date().toISOString(),
      ...details,
    };

    logger.info(`External API: ${provider} ${operation}`, logData);
  }

  // Performance monitoring
  static logPerformance(operation, duration, details = {}) {
    const logData = {
      operation,
      duration: `${duration}ms`,
      timestamp: new Date().toISOString(),
      ...details,
    };

    if (duration > 5000) { // Log slow operations (> 5 seconds)
      logger.warn(`Slow Operation: ${operation}`, logData);
    } else if (duration > 1000) { // Log moderately slow operations (> 1 second)
      logger.info(`Performance: ${operation}`, logData);
    } else {
      logger.debug(`Performance: ${operation}`, logData);
    }
  }

  // Error with stack trace logging
  static logErrorWithStack(error, context = {}) {
    const logData = {
      message: error.message,
      stack: error.stack,
      name: error.name,
      timestamp: new Date().toISOString(),
      ...context,
    };

    logger.error('Application Error', logData);
  }

  // Rate limiting events
  static logRateLimitEvent(type, details = {}) {
    const logData = {
      type,
      timestamp: new Date().toISOString(),
      ...details,
    };

    securityLogger.warn(`Rate Limit: ${type}`, logData);
  }

  // Configuration changes
  static logConfigChange(change, details = {}) {
    const logData = {
      change,
      timestamp: new Date().toISOString(),
      ...details,
    };

    auditLogger.info(`Config Change: ${change}`, logData);
    logger.info(`Configuration: ${change}`, logData);
  }

  // System health logging
  static logSystemHealth(component, status, details = {}) {
    const logData = {
      component,
      status,
      timestamp: new Date().toISOString(),
      ...details,
    };

    if (status === 'healthy') {
      logger.debug(`Health Check: ${component} is ${status}`, logData);
    } else {
      logger.error(`Health Check: ${component} is ${status}`, logData);
    }
  }

  // Cleanup old log files (to be called periodically)
  static async cleanupLogs(daysToKeep = 30) {
    const fs = await import('fs');
    const logsDir = path.join(process.cwd(), 'logs');
    
    try {
      const files = await fs.promises.readdir(logsDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      for (const file of files) {
        const filePath = path.join(logsDir, file);
        const stats = await fs.promises.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.promises.unlink(filePath);
          logger.info(`Cleaned up old log file: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Log cleanup failed', { error: error.message });
    }
  }
}

// Create logs directory if it doesn't exist
try {
  const fs = await import('fs');
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (error) {
  console.error('Failed to create logs directory:', error);
}

export default LoggingService;
export { logger };
