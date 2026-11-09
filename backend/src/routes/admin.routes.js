const express = require("express");

const {
  verifyCurrentAdmin,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus
} = require("../controllers/admin.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const router = express.Router();

// Protect all administrator routes
router.use(
  verifyToken,
  verifyCurrentAdmin
);

// List users with pagination
router.get(
  "/users",
  getUsers
);

// Get user details
router.get(
  "/users/:id",
  getUserById
);

// Update user role
router.patch(
  "/users/:id/role",
  updateUserRole
);

// Activate or deactivate an account
router.patch(
  "/users/:id/status",
  updateUserStatus
);

module.exports = router;