// ============================================================
// CENTRALIZED CONFIGURATION
//
// Why centralize config?
// If you spread process.env.X across 50 files:
// - Hard to know all env vars your app needs
// - No validation (typos fail silently at runtime)
// - No default values
//
// Industry pattern: One config file → validated at startup.
// If a required env var is missing, crash immediately with a clear message.
// "Fail fast" is better than mysterious bugs hours later.
// ============================================================

require("dotenv").config();

const config = {
  env: process.env.NODE_ENV || "development",
  port: parseInt(process.env.PORT, 10) || 5000,

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || "7d",
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },

  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
  },

  rateLimit: {
    max: parseInt(process.env.RATE_LIMIT_MAX, 10) || 100,
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
  },
};

// ============================================================
// STARTUP VALIDATION
//
// Check required variables exist before the app starts.
// This prevents confusing "Cannot read property of undefined"
// errors deep in your code when you forgot to set an env var.
// ============================================================
function validateConfig() {
  const required = [
    { key: "DATABASE_URL", value: config.database.url },
    { key: "JWT_SECRET", value: config.jwt.secret },
  ];

  const missing = required
    .filter((item) => !item.value)
    .map((item) => item.key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        `Copy .env.example to .env and fill in the values.`
    );
  }
}

validateConfig();

module.exports = config;
