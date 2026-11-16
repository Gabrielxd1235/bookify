
const { rateLimit } = require("express-rate-limit");
const { isLoadTestRequest } = require("./loadTest.middleware");

// Limit login attempts: 10 failed attempts lock the client for 3 minutes
const loginLimiter = rateLimit({
  windowMs: 3 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  // Count only unsuccessful requests
  skipSuccessfulRequests: true,

  // Authorized load tests (LOAD_TEST_KEY) are not limited
  skip: isLoadTestRequest,

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

  // Authorized load tests (X-Load-Test-Key) are not limited
  skip: isLoadTestRequest,

  message: {
    success: false,
    message: "Too many registrations. Please try again later."
  }
});

module.exports = {
  loginLimiter,
  registerLimiter
};
