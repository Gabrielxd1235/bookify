const express = require("express");

const {
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory
} = require("../controllers/category.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// Public endpoints
router.get("/", getCategories);
router.get("/:id", getCategoryById);

// ADMIN-only endpoints
router.post(
  "/",
  verifyToken,
  requireRole("ADMIN"),
  createCategory
);

router.put(
  "/:id",
  verifyToken,
  requireRole("ADMIN"),
  updateCategory
);

router.delete(
  "/:id",
  verifyToken,
  requireRole("ADMIN"),
  deleteCategory
);

module.exports = router;