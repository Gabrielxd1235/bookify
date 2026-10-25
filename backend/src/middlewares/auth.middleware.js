
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

// Verificar la autenticación del usuario
const verifyToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    // 1. Verificar que exista el encabezado Bearer
    if (
      !authorization ||
      !/^Bearer \S+$/i.test(authorization)
    ) {
      return res.status(401).json({
        success: false,
        message: "Token de autenticación requerido"
      });
    }

    const token = authorization.split(" ")[1];

    // 2. Comprobar la firma y expiración del JWT
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no configurado");
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"]
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Token inválido o expirado"
      });
    }

    // 3. Verificar que el token tenga un ID válido
    if (
      typeof decoded !== "object" ||
      !/^[1-9]\d*$/.test(decoded.sub || "")
    ) {
      return res.status(401).json({
        success: false,
        message: "Token inválido"
      });
    }

    // 4. Comprobar que el usuario aún exista
    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, email, role, is_active")
      .eq("id", decoded.sub)
      .maybeSingle();

    if (error) {
      console.error("Error verificando usuario:", error.message);

      return res.status(503).json({
        success: false,
        message: "No se pudo verificar la sesión"
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Sesión no válida"
      });
    }

    // 5. Impedir el acceso a cuentas deshabilitadas
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Cuenta deshabilitada"
      });
    }

    // 6. Adjuntar el usuario validado a la petición
    req.user = user;

    next();

  } catch (error) {
    console.error("Error de autenticación:", error.message);

    return res.status(500).json({
      success: false,
      message: "Error interno de autenticación"
    });
  }
};

module.exports = { verifyToken };
