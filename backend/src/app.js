// ============================================================
// EXPRESS APPLICATION SETUP
//
// We separate app.js (Express config) from server.js (HTTP server start).
// WHY? Testing. In tests, you can import app.js and test routes
// without starting an actual HTTP server on a port.
// This is the standard pattern in every serious Node.js project.
// ============================================================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const config = require("./config");
const { errorHandler } = require("./middlewares/error.middleware");
const authRoutes = require("./routes/auth.routes");
const notificationRoutes = require("./routes/notification.routes");
const logger = require("./utils/logger");

const app = express();

// ============================================================
// SECURITY MIDDLEWARE
//
// helmet() sets various HTTP headers to protect against common attacks:
// - X-Content-Type-Options: nosniff  → prevents MIME type sniffing
// - X-Frame-Options: DENY           → prevents clickjacking (embedding in iframes)
// - X-XSS-Protection: 1; mode=block → enables browser XSS filter
// - Strict-Transport-Security       → forces HTTPS
// - Content-Security-Policy         → restricts resource loading
//
// 7 lines of protection that most developers forget.
// ============================================================
app.use(helmet());

// ============================================================
// CORS (Cross-Origin Resource Sharing)
//
// Browsers enforce same-origin policy: frontend at port 3000
// cannot fetch from backend at port 5000 without CORS headers.
//
// WRONG: cors({ origin: "*" }) — allows any website to call your API.
// RIGHT: specify exact frontend origins.
//
// credentials: true → allows cookies and Authorization headers cross-origin.
// ============================================================
app.use(
  cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse JSON request bodies (up to 10kb limit)
// Limit prevents large payload attacks (sending 1GB JSON to crash server)
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// HTTP request logging (dev: colored, prod: apache format)
if (config.env !== "test") {
  app.use(morgan(config.env === "development" ? "dev" : "combined"));
}

// ============================================================
// GLOBAL RATE LIMITER
//
// This is a broad limit on ALL API routes.
// More specific limits (like notification sending) are in the service layer.
//
// Why global limit?
// Prevents brute-force attacks on the auth endpoints.
// 100 requests per 15 minutes = enough for legitimate use,
// but impossible to enumerate 10,000 passwords.
// ============================================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests, please try again later.",
  },
});

app.use("/api/", globalLimiter);

// ── ROUTES ───────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/notifications", notificationRoutes);

// Health check endpoint — used by load balancers and monitoring
app.get("/health", (req, res) => {
  res.json({
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: config.env,
  });
});

// 404 handler — any route not matched above
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ── GLOBAL ERROR HANDLER (must be last) ──────────────────────
// Express identifies error middleware by its 4-parameter signature
app.use(errorHandler);

module.exports = app;
