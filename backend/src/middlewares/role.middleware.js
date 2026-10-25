
 // BOOKIFY - Middleware de autorización por roles

const requireRole = (...allowedRoles) => {
  return (req, res, next) => {

    // Comprobar que exista un usuario autenticado
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Autenticación requerida"
      });
    }

    // Revisar si su rol está autorizado
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "No tienes permisos para acceder a este recurso"
      });
    }

    // Permitir que continúe la solicitud
    next();
  };
};

module.exports = { requireRole };
