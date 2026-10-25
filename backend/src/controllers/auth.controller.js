const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");
const jwt = require("jsonwebtoken");

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { full_name, email, password } = req.body || {};

    // 1. Validar los datos recibidos
    if (
      typeof full_name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Nombre, correo y contraseña son obligatorios"
      });
    }

    const name = full_name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (name.length < 3 || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "El nombre debe tener entre 3 y 100 caracteres"
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      normalizedEmail.length > 254 ||
      !emailRegex.test(normalizedEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "El correo electrónico no es válido"
      });
    }

    // bcrypt admite como máximo 72 bytes de contraseña
    const passwordBytes = Buffer.byteLength(password, "utf8");

    if (password.length < 8 || passwordBytes > 72) {
      return res.status(400).json({
        success: false,
        message:
          "La contraseña debe tener al menos 8 caracteres y máximo 72 bytes"
      });
    }

    // 2. Generar el hash de la contraseña
    const passwordHash = await bcrypt.hash(password, 12);

    // 3. Registrar al usuario en Supabase
    const { data, error } = await supabase
      .from("users")
      .insert({
        full_name: name,
        email: normalizedEmail,
        password_hash: passwordHash,
        role: "CLIENT",
        is_active: true
      })
      .select("id, full_name, email, role, created_at")
      .single();

    // 4. Controlar errores de base de datos
    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "El correo electrónico ya está registrado"
        });
      }

      console.error("Error de registro:", error.code, error.message);

      return res.status(500).json({
        success: false,
        message: "No se pudo registrar el usuario"
      });
    }

    // 5. Respuesta exitosa
    return res.status(201).json({
      success: true,
      message: "Usuario registrado correctamente",
      user: data
    });
  } catch (error) {
    console.error("Error interno de registro:", error.message);

    return res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // 1. Validar los campos recibidos
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Correo y contraseña son obligatorios"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Buscar el usuario por correo
    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, email, password_hash, role, is_active")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error("Error de consulta:", error.message);

      return res.status(500).json({
        success: false,
        message: "No se pudo procesar el inicio de sesión"
      });
    }

    // 3. Comprobar usuario y contraseña
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Credenciales incorrectas"
      });
    }

    const passwordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Credenciales incorrectas"
      });
    }

    // 4. Comprobar que la cuenta esté habilitada
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Cuenta deshabilitada"
      });
    }

    // 5. Verificar que exista el secreto JWT
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET no configurado");
    }

    // 6. Firmar token con vencimiento
    const token = jwt.sign(
      {
        role: user.role
      },
      process.env.JWT_SECRET,
      {
        subject: String(user.id),
        expiresIn: process.env.JWT_EXPIRES_IN || "1h",
        algorithm: "HS256"
      }
    );

    // 7. Responder sin exponer el hash
    return res.status(200).json({
      success: true,
      message: "Inicio de sesión exitoso",
      accessToken: token,
      tokenType: "Bearer",
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    console.error("Error interno de login:", error.message);

    return res.status(500).json({
      success: false,
      message: "Error interno del servidor"
    });
  }
};

 // GET /api/auth/me
const getProfile = (req, res) => {
  // req.user viene del middleware verifyToken
  return res.status(200).json({
    success: true,
    message: "Perfil obtenido correctamente",
    user: {
      id: req.user.id,
      full_name: req.user.full_name,
      email: req.user.email,
      role: req.user.role
    }
  });
};


module.exports = { register, login, getProfile };