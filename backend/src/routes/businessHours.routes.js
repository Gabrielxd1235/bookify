const express = require("express");

const {
  getBusinessHours,
  createBusinessHours,
  updateBusinessHours,
  deleteBusinessHours
} = require("../controllers/businessHours.controller");

const { verifyToken } = require("../middlewares/auth.middleware");

const { requireRole } = require("../middlewares/role.middleware");

const router = express.Router();

// Public access to business schedules
router.get("/:businessId/hours", getBusinessHours);

// Business owner and administrator operations
router.post(
  "/:businessId/hours",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  createBusinessHours
);

router.put(
  "/:businessId/hours/:weekday",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  updateBusinessHours
);

router.delete(
  "/:businessId/hours/:weekday",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  deleteBusinessHours
);

module.exports = router;