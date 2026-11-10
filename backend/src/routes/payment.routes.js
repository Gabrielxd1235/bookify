const express = require("express");

const {
  startMockPayment,
  completeMockPayment,
  getMockPaymentById
} = require("../controllers/payment.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// Mock payments are strictly limited to local development.
function requireLocalMockEnvironment(req, res, next) {
  const allowedAddresses = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1"
  ];

  const remoteAddress = req.socket.remoteAddress;

  const enabled =
    process.env.NODE_ENV === "development" &&
    process.env.PAYMENT_MODE === "MOCK" &&
    process.env.ENABLE_MOCK_PAYMENTS === "true" &&
    allowedAddresses.includes(remoteAddress);

  if (!enabled) {
    return res.status(404).json({
      success: false,
      message: "Endpoint not available"
    });
  }

  next();
}

// All mock payment routes require authentication
router.use(
  requireLocalMockEnvironment,
  verifyToken,
  requireRole("CLIENT", "BUSINESS_OWNER")
);

// Start a simulated payment
router.post(
  "/mock/start",
  startMockPayment
);

// Complete a simulated payment
router.post(
  "/mock/complete",
  completeMockPayment
);

// Get a simulated payment
router.get(
  "/mock/:id",
  getMockPaymentById
);

module.exports = router;