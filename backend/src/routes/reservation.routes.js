const express = require("express");

const {
  createReservation,
  getMyReservations,
  getBusinessReservations,
  getBusinessReservationSummary,
  getReservationById,
  cancelReservation,
  getAvailableSlots
} = require("../controllers/reservation.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// ============================================
// PUBLIC ROUTES
// ============================================

// Get available appointment slots
router.get(
  "/availability",
  getAvailableSlots
);

// ============================================
// CLIENT ROUTES
// ============================================

// Create a pending reservation
router.post(
  "/",
  verifyToken,
  requireRole("CLIENT", "BUSINESS_OWNER"),
  createReservation
);

// Get authenticated client's reservations
router.get(
  "/mine",
  verifyToken,
  requireRole("CLIENT", "BUSINESS_OWNER"),
  getMyReservations
);

// Cancel a pending reservation
router.patch(
  "/:id/cancel",
  verifyToken,
  requireRole("CLIENT", "BUSINESS_OWNER"),
  cancelReservation
);

// ============================================
// BUSINESS OWNER AND ADMIN ROUTES
// ============================================

// Get dashboard totals for a specific business
router.get(
  "/business/:businessId/summary",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  getBusinessReservationSummary
);

// Get reservations for a specific business
router.get(
  "/business/:businessId",
  verifyToken,
  requireRole("BUSINESS_OWNER", "ADMIN"),
  getBusinessReservations
);

// ============================================
// PROTECTED RESERVATION ROUTES
// ============================================

// Get reservation details by ID
router.get(
  "/:id",
  verifyToken,
  getReservationById
);

module.exports = router;