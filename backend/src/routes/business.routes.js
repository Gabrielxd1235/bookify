const express = require("express");

const {
  getBusinesses,
  getBusinessById,
  getMyBusinesses,
  createBusiness,
  updateBusiness,
  deleteBusiness
} = require("../controllers/business.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// Public business routes
router.get("/", getBusinesses);

// Business owner routes
// Important: /mine must be declared before /:id
router.get(
  "/mine",
  verifyToken,
  requireRole("BUSINESS_OWNER"),
  getMyBusinesses
);

// Public business details
router.get("/:id", getBusinessById);

// Create business
router.post(
  "/",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  createBusiness
);

// Update business
router.put(
  "/:id",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  updateBusiness
);

// Deactivate business
router.delete(
  "/:id",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  deleteBusiness
);

module.exports = router;