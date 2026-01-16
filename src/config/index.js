require("dotenv").config();
const Joi = require("joi");
const logger = require("../utils/logger");

const configSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "production", "test").default("development"),
  PORT: Joi.number().port().default(3000),
  SSH_HOST: Joi.string().ip().required(),
  SSH_USER: Joi.string().required(),
  PASSWORD_HASH: Joi.string().required(),
  SESSION_TTL_MINUTES: Joi.number().integer().min(1).default(60),
  ALLOWED_ORIGINS: Joi.string().default("*"),
  RATE_LIMIT_WINDOW_MS: Joi.number().integer().default(15 * 60 * 1000),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().integer().default(10),
  LOG_LEVEL: Joi.string().valid("trace", "debug", "info", "warn", "error", "fatal").default("info"),
  CLEANUP_INTERVAL_MS: Joi.number().integer().default(5 * 60 * 1000),
  PROCESS_TIMEOUT_MS: Joi.number().integer().default(30 * 60 * 1000),
});

const { error, value: envVars } = configSchema.validate(process.env, {
  allowUnknown: true,
  stripUnknown: true,
});

if (error) {
  logger.fatal("Config validation error:", error.message);
  process.exit(1);
}

const config = {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  ssh: {
    host: envVars.SSH_HOST,
    user: envVars.SSH_USER,
  },
  auth: {
    passwordHash: envVars.PASSWORD_HASH,
    sessionTtlMinutes: envVars.SESSION_TTL_MINUTES,
  },
  cors: {
    allowedOrigins: envVars.ALLOWED_ORIGINS.split(",").map((origin) => origin.trim()),
  },
  rateLimit: {
    windowMs: envVars.RATE_LIMIT_WINDOW_MS,
    maxRequests: envVars.RATE_LIMIT_MAX_REQUESTS,
  },
  logging: {
    level: envVars.LOG_LEVEL,
  },
  processes: {
    cleanupIntervalMs: envVars.CLEANUP_INTERVAL_MS,
    timeoutMs: envVars.PROCESS_TIMEOUT_MS,
  },
};

module.exports = config;