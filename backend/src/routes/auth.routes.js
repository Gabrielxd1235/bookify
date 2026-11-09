const express = require("express");

const {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getProfile
} = require("../controllers/auth.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const { loginLimiter, registerLimiter } = require("../middlewares/rateLimit.middleware");

const router = express.Router();

// Allow state-changing cookie requests from the frontend
function checkAuthOrigin(req, res, next) {
  const origin = req.get("origin");

  // Requests without Origin are supported for API clients
  if (!origin) {
    return next();
  }

  const allowedOrigins = (
    process.env.FRONTEND_URL || "http://localhost:5173"
  )
    .split(",")
    .map((value) => value.trim());

  if (!allowedOrigins.includes(origin)) {
    return res.status(403).json({
      success: false,
      message: "Origin not allowed"
    });
  }

  next();
}

// Register a new client
router.post("/register", registerLimiter, register);

// Authenticate a user
router.post("/login", loginLimiter, login);

// Renew the session
router.post("/refresh", checkAuthOrigin, refresh);

// Close the current session
router.post("/logout", checkAuthOrigin, logout);

// Close all refresh sessions
router.post(
  "/logout-all",
  checkAuthOrigin,
  verifyToken,
  logoutAll
);

// Get the authenticated user profile
router.get("/me", verifyToken, getProfile);

module.exports = router;