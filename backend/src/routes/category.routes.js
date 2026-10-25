
const express = require("express");

const {
  getCategories,
  getCategoryById,
  createCategory
} = require("../controllers/category.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// Consultas públicas
router.get("/", getCategories);
router.get("/:id", getCategoryById);

// Crear categoría: solo administradores
router.post(
  "/",
  verifyToken,
  requireRole("ADMIN"),
  createCategory
);

module.exports = router;
