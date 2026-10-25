
const { rateLimit } = require("express-rate-limit");

// Limitar intentos de inicio de sesión
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  // Solo contar solicitudes que no sean exitosas
  skipSuccessfulRequests: true,

  message: {
    success: false,
    message: "Demasiados intentos de inicio de sesión. Intenta más tarde."
  }
});

// Limitar registros de nuevas cuentas
const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,

  message: {
    success: false,
    message: "Demasiados registros. Intenta nuevamente más tarde."
  }
});

module.exports = {
  loginLimiter,
  registerLimiter
};
