import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  transports: [new winston.transports.Console()],
  defaultMeta: { service: 'secure-bridge-api' },
});

const redact = (value) => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redact);
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/password|token|secret|api.?key|authorization|cookie/i.test(key)) output[key] = '[REDACTED]';
    else output[key] = typeof item === 'object' ? redact(item) : item;
  }
  return output;
};

const LoggingService = {
  info(message, meta = {}) { logger.info(message, redact(meta)); },
  warn(message, meta = {}) { logger.warn(message, redact(meta)); },
  error(message, meta = {}) { logger.error(message, redact(meta)); },
  debug(message, meta = {}) { logger.debug(message, redact(meta)); },
};

export default LoggingService;
