// ============================================================
// NOTIFICATION ROUTES
//
// Two groups:
// 1. User routes — get and manage their own notifications
// 2. Admin routes — send notifications to users
//
// All routes require authentication.
// Send notification requires ADMIN role.
// ============================================================

const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const {
  sendNotificationValidation,
  validate,
} = require("../middlewares/validation.middleware");

// All notification routes require authentication
router.use(authenticate);

// ── USER ROUTES ──────────────────────────────────────────────

// GET /api/notifications?page=1&limit=20&unreadOnly=false
router.get("/", notificationController.getNotifications);

// GET /api/notifications/unread-count
router.get("/unread-count", notificationController.getUnreadCount);

// PATCH /api/notifications/read-all
router.patch("/read-all", notificationController.markAllAsRead);

// PATCH /api/notifications/:id/read
router.patch("/:id/read", notificationController.markAsRead);

// ── ADMIN ROUTES ─────────────────────────────────────────────

// POST /api/notifications/send  (Admin only)
router.post(
  "/send",
  requireRole("ADMIN"),
  sendNotificationValidation,
  validate,
  notificationController.sendNotification
);

module.exports = router;
