"use strict";
const express = require("express");
const { verifyToken } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const reviews = require("../controllers/review.controller");

const router = express.Router();

// Express 5 forwards rejected promises to the error handler
const users = [verifyToken, requireRole("CLIENT", "BUSINESS_OWNER")];
const admin = [verifyToken, requireRole("ADMIN")];

// Business ratings and reviews
router.get("/reviews/business-ratings", reviews.getBusinessRatings);
router.get("/businesses/:id/reviews", reviews.listBusinessReviews);
router.get("/businesses/:id/reviews/mine", ...users, reviews.getMyBusinessReview);
router.put("/businesses/:id/reviews", ...users, reviews.upsertBusinessReview);
router.delete("/businesses/:id/reviews/mine", ...users, reviews.deleteMyBusinessReview);
router.delete("/reviews/:reviewId", ...admin, reviews.adminDeleteBusinessReview);

// Opinions about BOOKIFY
router.get("/platform-reviews", reviews.listPlatformReviews);
router.get("/platform-reviews/mine", ...users, reviews.getMyPlatformReview);
router.put("/platform-reviews/mine", ...users, reviews.upsertPlatformReview);
router.delete("/platform-reviews/mine", ...users, reviews.deleteMyPlatformReview);
router.patch("/admin/platform-reviews/:reviewId", ...admin, reviews.adminPublishPlatformReview);

module.exports = router;
