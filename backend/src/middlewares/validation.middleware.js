// ============================================================
// INPUT VALIDATION MIDDLEWARE
//
// CRITICAL SECURITY CONCEPT: Never trust user input.
//
// Why validate?
// 1. SQL Injection: malicious SQL in input fields
//    (Prisma parameterizes queries so this is mitigated, but still validate)
// 2. XSS: JavaScript code in text fields executed in browsers
// 3. Business logic: email must be valid, password must be strong
// 4. Server crashes: undefined.toLowerCase() from missing fields
//
// We use express-validator — battle-tested library used by major Node.js apps.
//
// OWASP Top 10 includes "Injection" and "Broken Access Control" —
// proper validation mitigates many of these vulnerabilities.
// ============================================================

const { validationResult, body } = require("express-validator");
const { errorResponse } = require("../utils/response");

// Middleware to check validation results from express-validator
function validate(req, res, next) {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return errorResponse(
      res,
      "Validation failed",
      400,
      errors.array().map((e) => ({ field: e.path, message: e.msg }))
    );
  }

  next();
}

// Register validation rules
const registerValidation = [
  body("name")
    .trim()
    .notEmpty().withMessage("Name is required")
    .isLength({ min: 2, max: 100 }).withMessage("Name must be 2-100 characters"),

  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required")
    .isLength({ min: 6 }).withMessage("Password must be at least 6 characters")
    .matches(/\d/).withMessage("Password must contain at least one number"),
];

const loginValidation = [
  body("email")
    .trim()
    .notEmpty().withMessage("Email is required")
    .isEmail().withMessage("Must be a valid email address")
    .normalizeEmail(),

  body("password")
    .notEmpty().withMessage("Password is required"),
];

const sendNotificationValidation = [
  body("userId")
    .notEmpty().withMessage("userId is required")
    .isInt({ min: 1 }).withMessage("userId must be a positive integer"),

  body("type")
    .notEmpty().withMessage("type is required")
    .isIn([
      "PAYMENT_SUCCESS", "ORDER_PLACED", "ORDER_PACKED",
      "ORDER_SHIPPED", "ORDER_DELIVERED", "PROMO_OFFER",
      "SYSTEM_ALERT", "GENERAL"
    ]).withMessage("Invalid notification type"),

  body("message")
    .trim()
    .notEmpty().withMessage("message is required")
    .isLength({ min: 1, max: 500 }).withMessage("Message must be 1-500 characters"),
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  sendNotificationValidation,
};
