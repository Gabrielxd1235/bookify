
const { rateLimit } = require("express-rate-limit");

// Limit login attempts: 10 failed attempts lock the client for 3 minutes
const loginLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  // Count only unsuccessful requests
  skipSuccessfulRequests: true,

  message: {
    success: false,
    message: "Too many login attempts. Please try again in 3 minutes."
  }
});

// Limit new account registrations
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many registrations. Please try again later."
  }
});

module.exports = {
  loginLimiter,
  registerLimiter
};
