
const express = require("express");

const {
  register,
  login,
  getProfile
} = require("../controllers/auth.controller");

const {
  verifyToken
} = require("../middlewares/auth.middleware");

const {
  loginLimiter,
  registerLimiter
} = require("../middlewares/rateLimit.middleware");

const router = express.Router();

// Registro con límite de peticiones
router.post("/register", registerLimiter, register);

// Login con límite de intentos fallidos
router.post("/login", loginLimiter, login);

// Perfil protegido con JWT
router.get("/me", verifyToken, getProfile);

module.exports = router;
