const express = require("express");
const { wrapAsync } = require("../utils/extension.utils");
const { verifyToken } = require("../middlewares/auth.middleware");
const { requireRole } = require("../middlewares/role.middleware");
const { listApplications, reviewApplication } = require("../controllers/business-owner-admin.controller");

const router = express.Router();
router.use(verifyToken, requireRole("ADMIN"));
router.get("/business-applications", wrapAsync(listApplications));
router.patch("/business-applications/:id", wrapAsync(reviewApplication));
module.exports = router;
