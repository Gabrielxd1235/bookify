
const express = require("express");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  requireRole
} = require("../middlewares/role.middleware");

const router = express.Router();

// Todas las rutas necesitan autenticación
router.use(verifyToken);

// Panel exclusivo de clientes
router.get("/client", requireRole("CLIENT"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Bienvenido al panel del cliente",
    role: req.user.role
  });
});

// Panel exclusivo de propietarios
router.get(
  "/business",
  requireRole("BUSINESS_OWNER"),
  (req, res) => {
    res.status(200).json({
      success: true,
      message: "Bienvenido al panel del negocio",
      role: req.user.role
    });
  }
);

// Panel exclusivo de administradores
router.get("/admin", requireRole("ADMIN"), (req, res) => {
  res.status(200).json({
    success: true,
    message: "Bienvenido al panel de administración",
    role: req.user.role
  });
});

module.exports = router;
