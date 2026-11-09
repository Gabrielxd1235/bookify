const express = require("express");
const { wrapAsync } = require("../utils/extension.utils");
const { rateLimit } = require("express-rate-limit");
const { verifyToken } = require("../middlewares/auth.middleware");
const { imageUpload } = require("../middlewares/image-upload.middleware");
const profile = require("../controllers/profile.controller");

const router = express.Router();
const passwordLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 5,
  standardHeaders: "draft-8", legacyHeaders: false });
router.use(verifyToken);
router.get("/me", wrapAsync(profile.getMe));
router.patch("/me", wrapAsync(profile.updateMe));
router.patch("/password", passwordLimiter, wrapAsync(profile.changePassword));
router.post("/avatar", imageUpload, wrapAsync(profile.uploadAvatar));
router.delete("/avatar", wrapAsync(profile.deleteAvatar));
module.exports = router;
