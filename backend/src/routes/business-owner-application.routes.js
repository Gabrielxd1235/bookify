const express = require("express");
const { wrapAsync } = require("../utils/extension.utils");
const { verifyToken } = require("../middlewares/auth.middleware");
const { imageUpload } = require("../middlewares/image-upload.middleware");
const controller = require("../controllers/business-owner-application.controller");

const router = express.Router();
router.use(verifyToken);
router.get("/application", wrapAsync(controller.getLatestApplication));
router.post("/applications", wrapAsync(controller.createApplication));
router.post("/applications/:id/logo", imageUpload, wrapAsync(controller.uploadApplicationLogo));
router.post("/applications/:id/cover", imageUpload, wrapAsync(controller.uploadApplicationCover));
module.exports = router;
