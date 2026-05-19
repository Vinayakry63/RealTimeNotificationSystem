// ============================================================
// JWT UTILITIES
//
// JWT (JSON Web Token) is a stateless authentication mechanism.
//
// HOW JWT WORKS:
// 1. User logs in with email + password
// 2. Server verifies credentials
// 3. Server creates a JWT: Base64(header).Base64(payload).HMAC_SHA256(secret)
//    Payload contains: { userId: 123, role: "USER", iat: timestamp, exp: timestamp }
// 4. JWT is sent to client (stored in localStorage or httpOnly cookie)
// 5. Client sends JWT in every request: Authorization: Bearer <token>
// 6. Server verifies signature without hitting database
//    This is the "stateless" part — no server-side session store needed
//
// WHY STATELESS MATTERS AT SCALE:
// Traditional sessions: Every request hits a session store (Redis/DB) to verify user
// JWT: Verification is pure math — one CPU operation, no network call
// At 100K requests/second, this difference is massive.
//
// SECURITY TRADEOFF:
// JWTs cannot be invalidated before expiry (no revocation by default).
// Solution: Short expiry (15min) + refresh tokens (7 days).
// We use 7-day tokens here for simplicity — production apps use refresh tokens.
// ============================================================

const jwt = require("jsonwebtoken");
const config = require("../config");

function generateToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
    issuer: "notification-platform",
    audience: "notification-platform-users",
  });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret, {
      issuer: "notification-platform",
      audience: "notification-platform-users",
    });
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("TOKEN_EXPIRED");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("TOKEN_INVALID");
    }
    throw error;
  }
}

module.exports = { generateToken, verifyToken };
