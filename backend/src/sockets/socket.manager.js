// ============================================================
// SOCKET MANAGER — The heart of real-time communication
//
// ════════════════════════════════════════════════════════════
// WEBSOCKET vs HTTP: FUNDAMENTAL DIFFERENCE
// ════════════════════════════════════════════════════════════
//
// HTTP (Request-Response):
// Client → "give me data" → Server → "here's data" → connection closed
// Client has to ASK. Server cannot push unsolicited data.
// This is why old notification systems used "polling":
// Client asks every 5 seconds: "any new notifications?" 
// 99% of polls return nothing. Massive waste of bandwidth + server resources.
//
// WebSocket (Full-Duplex):
// Client ←→ Server: persistent bidirectional connection
// Server can PUSH data anytime without client asking.
// This enables true real-time: Instagram stories, WhatsApp messages, Swiggy tracking.
//
// Socket.IO builds on top of WebSockets with:
// - Auto-reconnection
// - Room-based broadcasting
// - Fallback to HTTP long-polling (for restrictive firewalls)
// - Acknowledgements (delivery receipts)
// - Namespaces (logical separation of socket channels)
//
// ════════════════════════════════════════════════════════════
// ROOMS: WHY WE DON'T BROADCAST TO EVERYONE
// ════════════════════════════════════════════════════════════
//
// NAIVE APPROACH: socket.emit("notification", data) to all connected clients
// Problem: User 1 sees User 2's private payment notification. Privacy violation.
//
// ROOM APPROACH: Each user has a private room named "user:123"
// Admin sends to room "user:123" → only sockets in that room receive it
// User 123's phone, tablet, and laptop are all in room "user:123"
// Multi-device support comes for free!
//
// This is exactly how WhatsApp delivers messages to specific users.
// ════════════════════════════════════════════════════════════
//
// ════════════════════════════════════════════════════════════
// SCALING PROBLEM WITH MULTIPLE SERVERS
// ════════════════════════════════════════════════════════════
//
// Single server (works fine):
// User A ──── Server 1 ──── Socket connection lives here
// Admin sends notification → Server 1 finds room "user:A" → delivers ✓
//
// Multiple servers (PROBLEM):
// User A ──── Server 1 (socket stored here)
// Admin request → Server 2 (different server!)
// Server 2: "I don't have a socket for user A" → no delivery ✗
//
// This is the fundamental challenge of horizontal scaling with stateful WebSockets.
// Each server only knows about ITS OWN connected clients.
//
// SOLUTION: Redis Adapter
// All servers share socket state via Redis.
// Server 2 publishes event to Redis → Redis broadcasts to Server 1 → delivers ✓
// We implement this below with Redis Pub/Sub.
// ════════════════════════════════════════════════════════════

const { Server } = require("socket.io");
const { verifyToken } = require("../utils/jwt");
const notificationService = require("../services/notification.service");
const { getRedisClient, getRedisSubscriber } = require("../config/redis");
const logger = require("../utils/logger");
const config = require("../config");

// Channel name for Redis Pub/Sub
// All servers subscribe to this channel
// When any server publishes here, ALL servers receive it
const REDIS_NOTIFICATION_CHANNEL = "notifications:broadcast";

class SocketManager {
  constructor() {
    this.io = null;
    // Map: userId → Set of socket IDs
    // One user can have multiple active connections (phone + laptop)
    this.userSockets = new Map();
  }

  // ============================================================
  // INITIALIZE SOCKET.IO SERVER
  //
  // Attaches Socket.IO to the HTTP server.
  // Also sets up Redis Pub/Sub for multi-server support.
  // ============================================================

  initialize(httpServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.cors.origin,
        methods: ["GET", "POST"],
        credentials: true,
      },
      // Transports: try WebSocket first, fall back to HTTP long-polling
      // Long-polling works even behind restrictive corporate firewalls
      transports: ["websocket", "polling"],

      // Ping configuration for connection health
      // If client doesn't respond to ping in 10s, disconnect it
      pingTimeout: 10000,
      pingInterval: 25000,
    });

    // Set up authentication middleware for sockets
    this.setupAuthMiddleware();

    // Set up event handlers
    this.setupEventHandlers();

    // Set up Redis Pub/Sub for multi-server delivery
    this.setupRedisPubSub();

    logger.info("Socket.IO server initialized");
    return this.io;
  }

  // ============================================================
  // SOCKET AUTHENTICATION MIDDLEWARE
  //
  // Socket.IO middleware runs before the "connection" event.
  // Think of it as the bouncer at the door.
  //
  // HOW JWT REACHES THE SOCKET:
  // Client sends JWT during handshake:
  //   socket = io("http://server", { auth: { token: "eyJ..." } })
  // Server extracts: socket.handshake.auth.token
  //
  // This runs ONCE per connection, not on every event.
  // After authentication, socket.data.user is available in all handlers.
  // ============================================================

  setupAuthMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        // Extract token from handshake auth or query params
        const token =
          socket.handshake.auth?.token ||
          socket.handshake.query?.token;

        if (!token) {
          return next(new Error("Authentication token required"));
        }

        // Verify JWT
        const decoded = verifyToken(token);

        // Attach user data to socket — available for the lifetime of this connection
        socket.data.user = {
          id: decoded.userId,
          role: decoded.role,
        };

        logger.socket(`Socket authenticated: userId=${decoded.userId}`);
        next();
      } catch (error) {
        logger.socket(`Socket auth failed: ${error.message}`);
        next(new Error("Authentication failed: " + error.message));
      }
    });
  }

  // ============================================================
  // CONNECTION AND EVENT HANDLERS
  //
  // The "connection" event fires when a new client connects
  // and passes authentication middleware.
  // ============================================================

  setupEventHandlers() {
    this.io.on("connection", async (socket) => {
      const userId = socket.data.user.id;

      logger.socket(`User ${userId} connected. Socket ID: ${socket.id}`);

      // ── JOIN PERSONAL ROOM ─────────────────────────────────
      // Every user gets a private room named "user:123"
      // This is the KEY mechanism for targeted notification delivery.
      // emit to room "user:123" → only sockets in that room receive it
      const userRoom = `user:${userId}`;
      socket.join(userRoom);

      // Track socket in our map (for connection status checks)
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId).add(socket.id);

      // ── DELIVER OFFLINE QUEUE ──────────────────────────────
      // User just connected — check if they missed notifications while offline
      // This is the reconnect delivery mechanism
      await this.deliverOfflineNotifications(socket, userId);

      // ── EMIT CONNECTION CONFIRMATION ───────────────────────
      // Tell the client they're connected and which room they're in
      socket.emit("connected", {
        message: "Real-time connection established",
        userId,
        room: userRoom,
      });

      // ── EVENT: MARK NOTIFICATION AS READ ──────────────────
      // Client emits this when user clicks a notification
      socket.on("mark_read", async (data) => {
        try {
          const { notificationId } = data;
          await notificationService.markAsRead(notificationId, userId);

          // Emit updated unread count back to this user's room (all their devices)
          const count = await notificationService.getUnreadCount(userId);
          this.io.to(userRoom).emit("unread_count_update", { count });

          logger.socket(`Notification ${notificationId} marked read by user ${userId}`);
        } catch (error) {
          socket.emit("error", { message: error.message });
        }
      });

      // ── EVENT: MARK ALL AS READ ────────────────────────────
      socket.on("mark_all_read", async () => {
        try {
          await notificationService.markAllAsRead(userId);
          this.io.to(userRoom).emit("unread_count_update", { count: 0 });
          socket.emit("all_marked_read", { success: true });
        } catch (error) {
          socket.emit("error", { message: error.message });
        }
      });

      // ── DISCONNECT HANDLER ─────────────────────────────────
      // Clean up socket tracking when user disconnects
      socket.on("disconnect", (reason) => {
        const userSocketSet = this.userSockets.get(userId);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          if (userSocketSet.size === 0) {
            this.userSockets.delete(userId);
            logger.socket(`User ${userId} fully disconnected (no more active sockets). Reason: ${reason}`);
          } else {
            logger.socket(`User ${userId} socket ${socket.id} disconnected. Still has ${userSocketSet.size} active connections.`);
          }
        }
      });
    });
  }

  // ============================================================
  // REDIS PUB/SUB SETUP
  //
  // This is the bridge for multi-server notification delivery.
  //
  // PUBLISHER: When admin sends notification via Server A,
  //   Server A publishes to Redis channel "notifications:broadcast"
  //
  // SUBSCRIBER: All servers (including Server B, C, D...) are subscribed.
  //   When Redis receives the published message, it broadcasts to ALL subscribers.
  //   Each server then checks: "do I have a socket for this userId?"
  //   The server that has the socket delivers it via Socket.IO.
  //
  // DATA FLOW:
  // Admin → Server A → PostgreSQL (save) → Redis PUBLISH
  //                                              ↓
  //                              Redis Channel "notifications:broadcast"
  //                                    ↙         ↓         ↘
  //                              Server A    Server B    Server C
  //                                              ↓
  //                             User connected to Server B → DELIVERED ✓
  //
  // This is exactly how Instagram, LinkedIn, and Slack scale their
  // real-time notification delivery across hundreds of servers.
  // ============================================================

  setupRedisPubSub() {
    try {
      const subscriber = getRedisSubscriber();

      subscriber.subscribe(REDIS_NOTIFICATION_CHANNEL, (err) => {
        if (err) {
          logger.error("Failed to subscribe to Redis channel:", err.message);
          return;
        }
        logger.info(`Subscribed to Redis channel: ${REDIS_NOTIFICATION_CHANNEL}`);
      });

      subscriber.on("message", (channel, message) => {
        if (channel !== REDIS_NOTIFICATION_CHANNEL) return;

        try {
          const { userId, event, data } = JSON.parse(message);

          // Emit to the user's room on THIS server
          // If the user is connected to this server → delivered
          // If not → no-op (another server handled it or user is offline)
          const userRoom = `user:${userId}`;
          this.io.to(userRoom).emit(event, data);

          logger.socket(`Redis→Socket: Event "${event}" delivered to room ${userRoom}`);
        } catch (parseError) {
          logger.error("Failed to parse Redis message:", parseError.message);
        }
      });
    } catch (error) {
      logger.warn("Redis Pub/Sub setup failed (running in single-server mode):", error.message);
    }
  }

  // ============================================================
  // SEND NOTIFICATION TO USER
  //
  // Called by the notification controller after saving to DB.
  // Returns true if user is online, false if offline.
  //
  // This first tries direct Socket.IO delivery (same server).
  // Then also publishes to Redis so OTHER servers can deliver it.
  // This handles both single-server and multi-server setups.
  // ============================================================

  sendToUser(userId, event, data) {
    const userRoom = `user:${userId}`;
    const userIdInt = parseInt(userId);

    // Check if user has any active sockets on THIS server
    const isConnectedLocally = this.userSockets.has(userIdInt) &&
      this.userSockets.get(userIdInt).size > 0;

    // Emit to the room on this server
    this.io.to(userRoom).emit(event, data);

    // ALSO publish to Redis for other servers in the cluster
    this.publishToRedis(userIdInt, event, data);

    logger.socket(`Sent event "${event}" to user ${userId} (local: ${isConnectedLocally})`);

    return isConnectedLocally;
  }

  // Publish event to Redis for cross-server delivery
  publishToRedis(userId, event, data) {
    try {
      const redis = getRedisClient();
      const payload = JSON.stringify({ userId, event, data });
      redis.publish(REDIS_NOTIFICATION_CHANNEL, payload);
    } catch (error) {
      logger.warn("Redis publish failed:", error.message);
      // Not fatal — direct socket emission may have already worked
    }
  }

  // ============================================================
  // DELIVER OFFLINE NOTIFICATIONS ON RECONNECT
  //
  // When user connects, check if they have queued offline notifications.
  // Drain the queue and deliver all at once.
  //
  // WHY THIS MATTERS:
  // User closes their app. Admin sends 3 notifications. User reopens app.
  // Without this: user sees nothing until next refresh.
  // With this: user immediately sees all missed notifications in real-time.
  //
  // This is the "inbox sync" behavior you see in WhatsApp, Slack, etc.
  // ============================================================

  async deliverOfflineNotifications(socket, userId) {
    try {
      const queued = await notificationService.getAndClearOfflineQueue(userId);

      if (queued.length > 0) {
        logger.socket(`Delivering ${queued.length} offline notifications to user ${userId}`);

        // Send all queued notifications at once
        socket.emit("offline_notifications", {
          notifications: queued,
          count: queued.length,
        });
      }
    } catch (error) {
      logger.warn(`Failed to deliver offline notifications for user ${userId}:`, error.message);
    }
  }

  // Check if user is currently connected to this server
  isUserOnline(userId) {
    const userIdInt = parseInt(userId);
    return this.userSockets.has(userIdInt) &&
      this.userSockets.get(userIdInt).size > 0;
  }

  // Get count of connected users on this server
  getConnectionStats() {
    return {
      connectedUsers: this.userSockets.size,
      totalSockets: [...this.userSockets.values()].reduce(
        (sum, set) => sum + set.size, 0
      ),
    };
  }
}

// Export singleton
module.exports = new SocketManager();
