// ============================================================
// JWT AUTHENTICATION MIDDLEWARE
//
// Middleware is Express's pipeline concept.
// Every request flows through a series of functions before hitting
// the actual route handler. Think of it as airport security:
// Request → Middleware 1 → Middleware 2 → Route Handler → Response
//
// This middleware:
// 1. Extracts JWT from Authorization header
// 2. Verifies the signature
// 3. Decodes the payload (userId, role)
// 4. Attaches user info to req.user
// 5. Calls next() to continue to the route handler
//
// If token is invalid/missing: returns 401 Unauthorized immediately.
// The route handler never runs — clean separation of concerns.
//
// This is used by every protected route: /api/notifications, /api/users, etc.
// ============================================================

const { verifyToken } = require("../utils/jwt");
const { errorResponse } = require("../utils/response");
const prisma = require("../config/database");

async function authenticate(req, res, next) {
  try {
    // Standard format: "Authorization: Bearer eyJhbGc..."
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return errorResponse(res, "Access token required", 401);
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Verify and decode the token
    const decoded = verifyToken(token);

    // OPTIONAL DB LOOKUP: Verify user still exists in database.
    // Some apps skip this for performance (pure JWT validation).
    // Others do it to handle account deletion/banning in real-time.
    // Tradeoff: Security vs. Performance.
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, name: true, email: true, role: true },
    });

    if (!user) {
      return errorResponse(res, "User no longer exists", 401);
    }

    // Attach user to request object — available in all downstream middleware
    req.user = user;
    next();
  } catch (error) {
    if (error.message === "TOKEN_EXPIRED") {
      return errorResponse(res, "Token expired, please login again", 401);
    }
    if (error.message === "TOKEN_INVALID") {
      return errorResponse(res, "Invalid token", 401);
    }
    return errorResponse(res, "Authentication failed", 401);
  }
}

// ============================================================
// ROLE-BASED ACCESS CONTROL (RBAC)
//
// After authentication (who are you?), we check authorization (what can you do?).
// Admin-only routes use: authenticate → requireRole("ADMIN")
//
// Instagram has: regular users, verified accounts, business accounts, admins.
// Each role has different permissions. RBAC manages this cleanly.
// ============================================================

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, "Authentication required", 401);
    }

    if (!roles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Access denied. Required role: ${roles.join(" or ")}`,
        403
      );
    }

    next();
  };
}

module.exports = { authenticate, requireRole };
