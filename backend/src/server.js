// ============================================================
// SERVER ENTRY POINT
//
// This file:
// 1. Creates the HTTP server (from Express app)
// 2. Attaches Socket.IO to the HTTP server
// 3. Starts listening on port
// 4. Handles graceful shutdown
//
// WHY HTTP SERVER + Socket.IO on same port?
// Socket.IO upgrades HTTP connections to WebSocket.
// The initial WebSocket handshake IS an HTTP request (GET with Upgrade header).
// So both HTTP (REST API) and WebSocket traffic share the same port.
// No need for two ports.
// ============================================================

const http = require("http");
const app = require("./app");
const config = require("./config");
const socketManager = require("./sockets/socket.manager");
const notificationController = require("./controllers/notification.controller");
const { closeRedisConnections } = require("./config/redis");
const prisma = require("./config/database");
const logger = require("./utils/logger");

// Create HTTP server from Express app
const httpServer = http.createServer(app);

// Initialize Socket.IO and attach to HTTP server
socketManager.initialize(httpServer);

// Inject socket manager into notification controller
// (avoids circular imports — controller needs socket, socket needs notification service)
notificationController.setSocketManager(socketManager);

// Start listening
httpServer.listen(config.port, () => {
  logger.info("================================================");
  logger.info(`  Notification Platform Server`);
  logger.info(`  Environment: ${config.env}`);
  logger.info(`  HTTP + WebSocket: http://localhost:${config.port}`);
  logger.info(`  Health check:     http://localhost:${config.port}/health`);
  logger.info("================================================");
});

// ============================================================
// GRACEFUL SHUTDOWN
//
// When the server receives SIGTERM (from Docker, Kubernetes, Railway, etc.),
// we should:
// 1. Stop accepting new connections
// 2. Finish in-flight requests
// 3. Close database connections
// 4. Close Redis connections
// 5. Exit cleanly
//
// Without graceful shutdown:
// - In-flight database transactions are killed mid-way → data corruption
// - Socket clients see abrupt disconnection → poor UX
// - Database connection pool not released → orphaned connections on DB server
//
// Kubernetes sends SIGTERM 30 seconds before SIGKILL.
// That's your window to clean up. Always handle it.
// ============================================================

async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // Stop accepting new connections
  httpServer.close(async () => {
    logger.info("HTTP server closed");

    try {
      // Close database connections
      await prisma.$disconnect();
      logger.info("Database connections closed");

      // Close Redis connections
      await closeRedisConnections();
      logger.info("Redis connections closed");

      logger.info("Graceful shutdown complete");
      process.exit(0);
    } catch (error) {
      logger.error("Error during shutdown:", error);
      process.exit(1);
    }
  });

  // Force kill after 30 seconds if shutdown takes too long
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 30000);
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Handle unhandled promise rejections
// These are async errors that were never caught with .catch() or try/catch
process.on("unhandledRejection", (reason, promise) => {
  logger.error("Unhandled Promise Rejection:", reason);
  // Don't exit in production — log and continue
  // In development, this is often a bug worth crashing for
  if (config.env === "development") {
    process.exit(1);
  }
});

module.exports = httpServer;
