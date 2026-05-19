// ============================================================
// NOTIFICATION SERVICE
//
// This is the core business logic of our entire platform.
// Every notification lifecycle event flows through here:
// create → store → emit → deliver → mark as read
//
// WHY THIS MATTERS:
// Notification systems are deceptively complex at scale.
// WhatsApp delivers 100 billion messages/day.
// Instagram sends billions of notifications/day.
// The architecture here scales from 10 users to 10 million.
// ============================================================

const prisma = require("../config/database");
const { getRedisClient } = require("../config/redis");
const logger = require("../utils/logger");

// Redis key patterns (namespacing prevents key collisions)
const REDIS_KEYS = {
  unreadCount: (userId) => `notif:unread:${userId}`,
  offlineQueue: (userId) => `notif:offline:${userId}`,
  rateLimitKey: (identifier) => `ratelimit:notif:${identifier}`,
};

class NotificationService {
  // ============================================================
  // CREATE AND PERSIST NOTIFICATION
  //
  // FLOW:
  // 1. Save to PostgreSQL (persistent storage)
  // 2. Invalidate Redis cache (stale data prevention)
  // 3. Return notification for real-time delivery
  //
  // Why save to DB FIRST, then emit socket event?
  // If socket emission fails, notification is still saved.
  // User will see it on next page load.
  // If we emitted first then saved, a crash between these steps
  // would result in a "ghost notification" — seen but not persisted.
  // Always persist first in reliable systems.
  // ============================================================

  async createNotification({ userId, type, message, metadata = null }) {
    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: parseInt(userId) },
      select: { id: true, name: true },
    });

    if (!user) {
      const error = new Error(`User with ID ${userId} not found`);
      error.statusCode = 404;
      throw error;
    }

    // Save to PostgreSQL
    const notification = await prisma.notification.create({
      data: {
        userId: parseInt(userId),
        type,
        message,
        metadata,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Invalidate cached unread count — it's now stale
    try {
      const redis = getRedisClient();
      await redis.del(REDIS_KEYS.unreadCount(userId));
    } catch (redisError) {
      // Redis failure is non-fatal — DB is source of truth
      logger.warn("Redis cache invalidation failed:", redisError.message);
    }

    logger.info(`Notification created: ID=${notification.id} for User=${userId}`);
    return notification;
  }

  // ============================================================
  // GET USER NOTIFICATIONS
  //
  // Pagination is CRITICAL for production.
  // Imagine a user with 10,000 notifications — you can't load all at once.
  // Industry standard: cursor-based pagination for infinite scroll.
  // We use offset pagination here (simpler, good for most apps).
  //
  // Instagram uses cursor-based pagination.
  // SQL OFFSET gets slower on large datasets (scans all rows up to offset).
  // Cursor-based (WHERE id < lastId) stays fast regardless of depth.
  // ============================================================

  async getUserNotifications(userId, { page = 1, limit = 20, unreadOnly = false } = {}) {
    const skip = (page - 1) * limit;
    const take = parseInt(limit);

    const where = {
      userId: parseInt(userId),
      ...(unreadOnly && { isRead: false }),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.notification.count({ where }),
    ]);

    return {
      notifications,
      pagination: {
        page: parseInt(page),
        limit: take,
        total,
        totalPages: Math.ceil(total / take),
        hasMore: skip + take < total,
      },
    };
  }

  // ============================================================
  // GET UNREAD COUNT (with Redis caching)
  //
  // This is called every time the notification bell renders.
  // If you have 1M users each checking every 30 seconds:
  // That's 33,000 DB queries/second just for unread counts.
  // Cache it in Redis: 99% cache hit rate → ~330 DB queries/second.
  //
  // Cache TTL (Time To Live): 5 minutes
  // Tradeoff: slight staleness (up to 5 min) vs. massive DB reduction
  // When a new notification arrives, we invalidate this cache immediately
  // so the count stays accurate for the important case (new notification).
  // ============================================================

  async getUnreadCount(userId) {
    const cacheKey = REDIS_KEYS.unreadCount(userId);

    try {
      const redis = getRedisClient();
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return parseInt(cached);
      }
    } catch (redisError) {
      logger.warn("Redis read failed, falling back to DB:", redisError.message);
    }

    // Cache miss: query database
    const count = await prisma.notification.count({
      where: { userId: parseInt(userId), isRead: false },
    });

    // Store in Redis with 5-minute TTL
    try {
      const redis = getRedisClient();
      await redis.setex(cacheKey, 300, count.toString());
    } catch (redisError) {
      logger.warn("Redis write failed:", redisError.message);
    }

    return count;
  }

  // ============================================================
  // MARK NOTIFICATION AS READ
  //
  // When user clicks a notification, mark it read.
  // This is a common pattern in all notification systems.
  // We also invalidate the unread count cache.
  // ============================================================

  async markAsRead(notificationId, userId) {
    const notification = await prisma.notification.findFirst({
      where: {
        id: parseInt(notificationId),
        userId: parseInt(userId),
      },
    });

    if (!notification) {
      const error = new Error("Notification not found");
      error.statusCode = 404;
      throw error;
    }

    if (notification.isRead) {
      return notification; // Already read, no update needed
    }

    const updated = await prisma.notification.update({
      where: { id: parseInt(notificationId) },
      data: { isRead: true },
    });

    // Invalidate unread count cache
    try {
      const redis = getRedisClient();
      await redis.del(REDIS_KEYS.unreadCount(userId));
    } catch (redisError) {
      logger.warn("Redis cache invalidation failed:", redisError.message);
    }

    return updated;
  }

  async markAllAsRead(userId) {
    await prisma.notification.updateMany({
      where: { userId: parseInt(userId), isRead: false },
      data: { isRead: true },
    });

    // Invalidate unread count cache
    try {
      const redis = getRedisClient();
      await redis.del(REDIS_KEYS.unreadCount(userId));
    } catch (redisError) {
      logger.warn("Redis cache invalidation failed:", redisError.message);
    }

    return { message: "All notifications marked as read" };
  }

  // ============================================================
  // OFFLINE NOTIFICATION QUEUE (Redis List)
  //
  // Problem: User is offline. Admin sends notification.
  // We store it in DB (persistent), but no socket to deliver to.
  //
  // Redis List acts as a temporary delivery queue.
  // When user reconnects, we drain the queue and deliver via socket.
  //
  // Why Redis List (not just re-query DB)?
  // Because we want to deliver ONLY the missed notifications,
  // not re-deliver everything the user has already seen.
  // The queue contains exactly what was missed since last connect.
  //
  // TTL: 24 hours. If user doesn't reconnect in 24h, notifications
  // are still in DB — just won't get the "you missed X" delivery.
  // ============================================================

  async queueOfflineNotification(userId, notification) {
    try {
      const redis = getRedisClient();
      const key = REDIS_KEYS.offlineQueue(userId);

      // LPUSH adds to front of list (newest first)
      await redis.lpush(key, JSON.stringify(notification));

      // Set TTL: auto-expire after 24 hours
      await redis.expire(key, 86400);

      logger.debug(`Queued offline notification for user ${userId}`);
    } catch (redisError) {
      logger.warn("Failed to queue offline notification:", redisError.message);
      // Not fatal — notification is still in PostgreSQL
    }
  }

  async getAndClearOfflineQueue(userId) {
    try {
      const redis = getRedisClient();
      const key = REDIS_KEYS.offlineQueue(userId);

      // LRANGE gets all items, DEL removes the key
      const items = await redis.lrange(key, 0, -1);
      await redis.del(key);

      return items.map((item) => JSON.parse(item));
    } catch (redisError) {
      logger.warn("Failed to retrieve offline queue:", redisError.message);
      return [];
    }
  }

  // ============================================================
  // DISTRIBUTED RATE LIMITING WITH REDIS
  //
  // PROBLEM: Without rate limiting, one admin could send 10,000 notifications/second.
  // This would: spam users, overwhelm the database, crash the server.
  //
  // NAIVE SOLUTION: In-memory counter per server.
  // Problem: If you have 5 servers, each allows 100/min = 500/min total.
  // The limit isn't respected across the cluster.
  //
  // REDIS SOLUTION: Shared atomic counter.
  // INCR is atomic — no race conditions even with concurrent requests.
  // All servers share one counter → true distributed rate limiting.
  //
  // This is how companies like Stripe, Twilio, and Cloudflare implement rate limiting.
  // ============================================================

  async checkRateLimit(identifier, maxRequests = 100, windowSeconds = 60) {
    try {
      const redis = getRedisClient();
      const key = REDIS_KEYS.rateLimitKey(identifier);

      // Atomic increment and get
      const count = await redis.incr(key);

      // Set TTL only on first request (count === 1)
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }

      const ttl = await redis.ttl(key);

      if (count > maxRequests) {
        return {
          allowed: false,
          count,
          remaining: 0,
          resetIn: ttl,
        };
      }

      return {
        allowed: true,
        count,
        remaining: maxRequests - count,
        resetIn: ttl,
      };
    } catch (redisError) {
      // Redis failure: allow the request (fail open)
      // Fail open vs fail closed: tradeoff between availability and security.
      // For rate limiting, availability is usually more important.
      logger.warn("Rate limit check failed:", redisError.message);
      return { allowed: true, count: 0, remaining: maxRequests, resetIn: windowSeconds };
    }
  }
}

module.exports = new NotificationService();
