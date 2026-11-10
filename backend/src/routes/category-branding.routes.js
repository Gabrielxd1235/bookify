"use strict";
const express = require("express");
const { verifyToken } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { imageUpload } = require("../middlewares/image-upload.middleware");
const { wrapAsync } = require("../utils/extension.utils");
const branding = require("../controllers/category-branding.controller");

const router = express.Router();

// Place this router BEFORE existing /api/categories routes to prevent /:id from capturing /branding.
router.get("/branding", wrapAsync(branding.listBranding));
router.get("/:id/branding", wrapAsync(branding.getBranding));
router.patch("/:id/icon", verifyToken, requireRole("ADMIN"), wrapAsync(branding.setIcon));
router.post("/:id/image", verifyToken, requireRole("ADMIN"), imageUpload, wrapAsync(branding.uploadImage));
router.delete("/:id/image", verifyToken, requireRole("ADMIN"), wrapAsync(branding.deleteImage));

module.exports = router;
