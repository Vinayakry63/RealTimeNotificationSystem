// ============================================================
// REDIS CLIENT CONFIGURATION
//
// We use ioredis — the most production-grade Redis client for Node.js.
// Used by companies like Vercel, Shopify, and thousands of startups.
//
// Why Redis in a notification system?
//
// 1. CACHING: Store frequently-accessed data (user sessions, counts)
//    Redis reads are ~0.1ms vs PostgreSQL ~1-10ms.
//    At 1M users, this difference is enormous.
//
// 2. PUB/SUB: Cross-server event broadcasting.
//    When you have 10 backend servers, a socket event emitted on Server A
//    won't reach users connected to Server B.
//    Redis Pub/Sub acts as a message bus between all servers.
//    This is how Instagram/WhatsApp deliver messages across their fleet.
//
// 3. RATE LIMITING: Distributed counters across multiple servers.
//    A rate limiter in-memory only works for one server.
//    Redis counters work across all servers in your cluster.
//
// 4. OFFLINE QUEUE: Store notifications for offline users.
//    If user is disconnected, push to Redis queue.
//    When user reconnects, drain the queue.
//
// ============================================================

const Redis = require("ioredis");
const config = require("./index");

// We create TWO Redis clients:
// 1. Regular client (commands: GET, SET, INCR, LPUSH, etc.)
// 2. Subscriber client (dedicated to SUBSCRIBE — a subscribed client
//    cannot run regular commands, Redis protocol restriction)

let redisClient = null;
let redisSubscriber = null;

function createRedisClient(name) {
  const client = new Redis(config.redis.url, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      // Exponential backoff: wait 100ms, 200ms, 400ms... max 3000ms
      const delay = Math.min(times * 100, 3000);
      console.log(`[Redis:${name}] Retrying connection in ${delay}ms...`);
      return delay;
    },
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("connect", () => {
    console.log(`[Redis:${name}] Connected successfully`);
  });

  client.on("ready", () => {
    console.log(`[Redis:${name}] Ready to accept commands`);
  });

  client.on("error", (err) => {
    // Log but don't crash — Redis might be temporarily unavailable.
    // The app can still work (degraded mode) without Redis caching.
    // Notifications will still be saved to PostgreSQL.
    console.error(`[Redis:${name}] Error:`, err.message);
  });

  client.on("close", () => {
    console.log(`[Redis:${name}] Connection closed`);
  });

  return client;
}

function getRedisClient() {
  if (!redisClient) {
    redisClient = createRedisClient("main");
  }
  return redisClient;
}

function getRedisSubscriber() {
  if (!redisSubscriber) {
    redisSubscriber = createRedisClient("subscriber");
  }
  return redisSubscriber;
}

async function closeRedisConnections() {
  if (redisClient) await redisClient.quit();
  if (redisSubscriber) await redisSubscriber.quit();
}

module.exports = { getRedisClient, getRedisSubscriber, closeRedisConnections };
