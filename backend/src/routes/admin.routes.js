const express = require("express");

const {
  verifyCurrentAdmin,
  getOverview,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  updateUserDetails,
  resetUserPassword
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

// Platform totals for the administrator dashboard
router.get(
  "/overview",
  getOverview
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

// Correct a user's contact details
router.patch(
  "/users/:id",
  updateUserDetails
);

// Set a temporary password for a locked-out user
router.patch(
  "/users/:id/password",
  resetUserPassword
);

module.exports = router;