// ============================================================
// GLOBAL ERROR HANDLING MIDDLEWARE
//
// In Express, if any route/middleware throws an error or calls next(error),
// Express skips all normal middleware and jumps to error-handling middleware.
// Error middleware has 4 parameters: (err, req, res, next)
//
// WHY CENTRALIZED ERROR HANDLING?
// Without it, every route has try/catch blocks + different error formats.
// With it: routes just throw errors, and ONE place handles all of them.
//
// This is the "don't repeat yourself" (DRY) principle in error handling.
// Major companies use this pattern — Express docs recommend it.
// ============================================================

const logger = require("../utils/logger");
const config = require("../config");

class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational; // Operational: expected errors (invalid input, not found)
    // Non-operational: programming bugs (unhandled, crash worthy)
    Error.captureStackTrace(this, this.constructor);
  }
}

// Express error middleware: 4 parameters (err, req, res, next)
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal Server Error";

  // Prisma-specific errors
  if (err.code === "P2002") {
    // Unique constraint violation (e.g., email already exists)
    statusCode = 409;
    message = "Resource already exists";
  } else if (err.code === "P2025") {
    // Record not found
    statusCode = 404;
    message = "Resource not found";
  }

  // JWT errors (if not caught by auth middleware)
  if (err.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Invalid token";
  }

  // Log all errors in production
  if (statusCode >= 500) {
    logger.error("Unhandled error:", {
      message: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
    });
  }

  // IMPORTANT: Never expose stack traces or internal details in production.
  // Hackers use error messages to learn about your system.
  const response = {
    success: false,
    message,
  };

  if (config.env === "development") {
    response.stack = err.stack;
    response.code = err.code;
  }

  res.status(statusCode).json(response);
}

// Catch unhandled promise rejections (async errors not caught by try/catch)
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { errorHandler, AppError, asyncHandler };
