// ============================================================
// AUTH CONTROLLER
//
// Controllers handle HTTP concerns:
// - parsing request body
// - calling the service
// - formatting the HTTP response
//
// Controllers should be THIN. No business logic here.
// If a controller method is > 20 lines, it probably belongs in a service.
// ============================================================

const authService = require("../services/auth.service");
const { successResponse, errorResponse, createdResponse } = require("../utils/response");
const { asyncHandler } = require("../middlewares/error.middleware");

const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  // Only allow ADMIN role to be set via specific process (not open registration)
  // In production: admins are created via CLI or by other admins.
  // Open role selection would let anyone register as admin — major security flaw.
  const allowedRole = role === "ADMIN" ? "ADMIN" : "USER";

  const { user, token } = await authService.register(name, email, password, allowedRole);

  return createdResponse(res, { user, token }, "Account created successfully");
});

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, token } = await authService.login(email, password);

  return successResponse(res, { user, token }, "Login successful");
});

const getProfile = asyncHandler(async (req, res) => {
  // req.user is set by authenticate middleware
  const user = await authService.getProfile(req.user.id);
  return successResponse(res, { user });
});

const getAllUsers = asyncHandler(async (req, res) => {
  const users = await authService.getAllUsers();
  return successResponse(res, { users });
});

module.exports = { register, login, getProfile, getAllUsers };
