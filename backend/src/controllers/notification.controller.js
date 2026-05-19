// ============================================================
// NOTIFICATION CONTROLLER
//
// Handles all HTTP requests related to notifications.
// The real magic happens in the socket layer (real-time delivery)
// but REST APIs are needed for:
// - Initial page load (get existing notifications)
// - Mark as read
// - Admin sending notifications
// ============================================================

const notificationService = require("../services/notification.service");
const { successResponse, errorResponse, createdResponse } = require("../utils/response");
const { asyncHandler } = require("../middlewares/error.middleware");
const logger = require("../utils/logger");

// Will be set by server.js after socket manager is initialized
let socketManager = null;

function setSocketManager(manager) {
  socketManager = manager;
}

// ============================================================
// SEND NOTIFICATION (Admin only)
//
// This is the core admin action. Flow:
// 1. Validate input (done by middleware before this runs)
// 2. Check rate limit
// 3. Save notification to PostgreSQL
// 4. Try to deliver via Socket.IO (real-time)
// 5. If user offline: queue in Redis for later delivery
// ============================================================

const sendNotification = asyncHandler(async (req, res) => {
  const { userId, type, message, metadata } = req.body;

  // Rate limiting: max 100 notifications/minute per admin
  const rateLimitResult = await notificationService.checkRateLimit(
    `admin:${req.user.id}`,
    100,
    60
  );

  if (!rateLimitResult.allowed) {
    return errorResponse(
      res,
      `Rate limit exceeded. Try again in ${rateLimitResult.resetIn} seconds.`,
      429
    );
  }

  // Add rate limit info to response headers (standard practice)
  res.set({
    "X-RateLimit-Remaining": rateLimitResult.remaining,
    "X-RateLimit-Reset": rateLimitResult.resetIn,
  });

  // Create and persist notification
  const notification = await notificationService.createNotification({
    userId,
    type,
    message,
    metadata,
  });

  // Attempt real-time delivery via Socket.IO
  if (socketManager) {
    const delivered = socketManager.sendToUser(userId, "new_notification", {
      notification,
      timestamp: new Date().toISOString(),
    });

    if (!delivered) {
      // User is offline — queue for when they reconnect
      await notificationService.queueOfflineNotification(userId, notification);
      logger.info(`User ${userId} offline. Notification queued.`);
    } else {
      logger.info(`Notification delivered in real-time to user ${userId}`);
    }
  }

  return createdResponse(res, { notification }, "Notification sent successfully");
});

// GET /api/notifications — User's own notifications
const getNotifications = asyncHandler(async (req, res) => {
  const { page, limit, unreadOnly } = req.query;

  const result = await notificationService.getUserNotifications(req.user.id, {
    page: parseInt(page) || 1,
    limit: parseInt(limit) || 20,
    unreadOnly: unreadOnly === "true",
  });

  return successResponse(res, result);
});

// GET /api/notifications/unread-count
const getUnreadCount = asyncHandler(async (req, res) => {
  const count = await notificationService.getUnreadCount(req.user.id);
  return successResponse(res, { count });
});

// PATCH /api/notifications/:id/read
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const notification = await notificationService.markAsRead(id, req.user.id);
  return successResponse(res, { notification }, "Marked as read");
});

// PATCH /api/notifications/read-all
const markAllAsRead = asyncHandler(async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user.id);
  return successResponse(res, result);
});

module.exports = {
  sendNotification,
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  setSocketManager,
};
