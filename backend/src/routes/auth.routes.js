// ============================================================
// AUTH ROUTES
//
// Routes define the URL → controller mapping.
// Middleware chains run left-to-right before the controller.
//
// Pattern: router.method(path, ...middlewares, controller)
// ============================================================

const express = require("express");
const router = express.Router();
const authController = require("../controllers/auth.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const {
  registerValidation,
  loginValidation,
  validate,
} = require("../middlewares/validation.middleware");

// POST /api/auth/register
router.post("/register", registerValidation, validate, authController.register);

// POST /api/auth/login
router.post("/login", loginValidation, validate, authController.login);

// GET /api/auth/profile  (protected)
router.get("/profile", authenticate, authController.getProfile);

// GET /api/auth/users  (admin only)
router.get(
  "/users",
  authenticate,
  requireRole("ADMIN"),
  authController.getAllUsers
);

module.exports = router;
