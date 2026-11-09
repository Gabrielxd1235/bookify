
const express = require("express");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Client-only dashboard
router.get("/client", requireRole("CLIENT"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the client dashboard",
    role: req.user.role
  });
});

// Business owner-only dashboard
router.get(
  "/business",
  requireRole("BUSINESS_OWNER"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Welcome to the business dashboard",
      role: req.user.role
    });
  }
);

// Administrator-only dashboard
router.get("/admin", requireRole("ADMIN"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Welcome to the administration dashboard",
    role: req.user.role
  });
});

module.exports = router;
