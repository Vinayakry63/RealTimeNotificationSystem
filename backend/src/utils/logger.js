// ============================================================
// SIMPLE LOGGER UTILITY
//
// Production apps use structured logging (Winston, Pino).
// Structured logs are JSON — machine-parseable by tools like
// Datadog, CloudWatch, Splunk, or Grafana Loki.
//
// Example structured log:
// { "level": "error", "message": "DB timeout", "userId": 123, "ts": "2024-01..." }
//
// This allows querying: "show me all errors for user 123 in the last hour"
//
// For now: simple console wrapper. Replace with Winston in production.
// ============================================================

const config = require("../config");

const logger = {
  info: (...args) => {
    if (config.env !== "test") {
      console.log(`[INFO] ${new Date().toISOString()}`, ...args);
    }
  },

  warn: (...args) => {
    console.warn(`[WARN] ${new Date().toISOString()}`, ...args);
  },

  error: (...args) => {
    console.error(`[ERROR] ${new Date().toISOString()}`, ...args);
  },

  debug: (...args) => {
    if (config.env === "development") {
      console.log(`[DEBUG] ${new Date().toISOString()}`, ...args);
    }
  },

  socket: (...args) => {
    if (config.env === "development") {
      console.log(`[SOCKET] ${new Date().toISOString()}`, ...args);
    }
  },
};

module.exports = logger;
