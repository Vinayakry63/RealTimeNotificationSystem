// ============================================================
// PRISMA CLIENT SINGLETON
//
// Why singleton? Prisma uses a connection pool internally.
// If you create a new PrismaClient() in every file, you'll
// exhaust your database connection limit instantly.
//
// PostgreSQL default: 100 max connections
// Each PrismaClient opens multiple connections (default pool: 5-10)
// One singleton = one pool shared across entire app ✓
// Multiple instances = connection exhaustion, app crash ✗
//
// This is the same pattern used by Next.js docs and major Node apps.
// ============================================================

const { PrismaClient } = require("@prisma/client");
const config = require("./index");

// In development, nodemon restarts the server on file changes.
// Without the global singleton, each restart creates a new PrismaClient
// while the old one's connections are still alive → connection leak.
// The global trick prevents this during development.

const globalForPrisma = global;

const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      config.env === "development"
        ? ["query", "info", "warn", "error"]
        : ["error"],
  });

if (config.env !== "production") {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown: release database connections on process exit.
// Without this, database server might hold "zombie" connections
// thinking the client is still connected.
process.on("beforeExit", async () => {
  await prisma.$disconnect();
});

module.exports = prisma;
