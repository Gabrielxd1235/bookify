const express = require("express");
const { wrapAsync } = require("../utils/extension.utils");
const { verifyToken } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { imageUpload } = require("../middlewares/image-upload.middleware");
const media = require("../controllers/business-media.controller");

const router = express.Router();
router.get("/:id/media", wrapAsync(media.getBusinessMedia));
router.post("/:id/logo", verifyToken, requireRole("BUSINESS_OWNER", "ADMIN"), imageUpload, wrapAsync(media.uploadLogo));
router.post("/:id/cover", verifyToken, requireRole("BUSINESS_OWNER", "ADMIN"), imageUpload, wrapAsync(media.uploadCover));
router.post("/:id/images", verifyToken, requireRole("BUSINESS_OWNER", "ADMIN"), imageUpload, wrapAsync(media.addGalleryImage));
router.delete("/:id/images/:imageId", verifyToken, requireRole("BUSINESS_OWNER", "ADMIN"), wrapAsync(media.deleteGalleryImage));
module.exports = router;
