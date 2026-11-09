const express = require("express");

const {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService
} = require("../controllers/service.controller");

const { verifyToken } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");

const router = express.Router();

// Public routes
router.get("/", getServices);
router.get("/:id", getServiceById);

// Business owner and administrator routes
router.post(
  "/",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  createService
);

router.put(
  "/:id",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  updateService
);

router.delete(
  "/:id",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  deleteService
);

module.exports = router;