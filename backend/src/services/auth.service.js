// ============================================================
// AUTH SERVICE - Business logic layer for authentication
//
// ARCHITECTURE PATTERN: MVC with Service Layer
//
// Controller: handles HTTP request/response
// Service: contains business logic (this file)
// Repository/ORM: talks to database (Prisma)
//
// WHY SEPARATE LAYERS?
// Without services, controllers become "fat controllers" with
// business logic, DB calls, and HTTP handling all mixed together.
// Hard to test, hard to reuse, hard to maintain.
//
// With services: controller is thin (just HTTP), service is testable
// in isolation, and the same service can be called from HTTP routes,
// WebSocket handlers, cron jobs, etc.
//
// This is the pattern used in NestJS, Spring Boot, Django — all mature frameworks.
// ============================================================

const bcrypt = require("bcryptjs");
const prisma = require("../config/database");
const { generateToken } = require("../utils/jwt");

class AuthService {
  // ============================================================
  // REGISTER USER
  //
  // Password hashing with bcrypt:
  // bcrypt is a slow hashing algorithm — intentionally slow.
  //
  // Why slow? To make brute-force attacks impractical.
  // SHA-256: can hash 10 billion passwords/second on modern GPU.
  // bcrypt (cost=12): ~300 hashes/second. 
  // At 1 billion attempts, SHA256 takes 0.1s. bcrypt takes 38 days.
  //
  // Salt: bcrypt automatically adds random salt to each hash.
  // Salt prevents rainbow table attacks (precomputed hash lookups).
  //
  // Cost factor 12: Each increment doubles computation time.
  // Industry standard: 10-12 for web apps.
  // ============================================================

  async register(name, email, password, role = "USER") {
    // Check if email already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      const error = new Error("Email already registered");
      error.statusCode = 409;
      throw error;
    }

    // Hash password with cost factor 12
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user in database
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate JWT token
    const token = generateToken({
      userId: user.id,
      role: user.role,
    });

    return { user, token };
  }

  // ============================================================
  // LOGIN USER
  //
  // Security: we always return the same error message regardless
  // of whether the email doesn't exist OR password is wrong.
  // Why? "Email not found" tells attacker which emails exist.
  // "Invalid credentials" reveals nothing.
  // This prevents user enumeration attacks.
  // ============================================================

  async login(email, password) {
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // Same error message for both "user not found" and "wrong password"
    const invalidCredentialsError = new Error("Invalid email or password");
    invalidCredentialsError.statusCode = 401;

    if (!user) {
      throw invalidCredentialsError;
    }

    // Compare provided password with stored hash
    // bcrypt.compare handles timing-safe comparison
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      throw invalidCredentialsError;
    }

    // Generate JWT
    const token = generateToken({
      userId: user.id,
      role: user.role,
    });

    const userWithoutPassword = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    return { user: userWithoutPassword, token };
  }

  async getProfile(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        _count: {
          select: {
            notifications: true,
          },
        },
      },
    });

    if (!user) {
      const error = new Error("User not found");
      error.statusCode = 404;
      throw error;
    }

    return user;
  }

  async getAllUsers() {
    return prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }
}

module.exports = new AuthService();
