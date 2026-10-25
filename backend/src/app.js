
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const supabase = require("./config/supabase");
const authRoutes = require("./routes/auth.routes");
const roleRoutes = require("./routes/role.routes");
const categoryRoutes = require("./routes/category.routes");
const path = require("node:path");

const app = express();

// Middleware de seguridad
app.use(helmet());
app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "10kb" }));

// Limitar solicitudes para proteger la API
app.use("/api", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-8",
  legacyHeaders: false
}));



// Endpoint para comprobar que el servidor funciona
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "API de BOOKIFY funcionando",
    status: "OK"
  });
});
// Rutas de autenticación
app.use("/api/auth", authRoutes);
// Rutas protegidas por roles
app.use("/api/dashboard", roleRoutes);
// CRUD inicial de categorías
app.use("/api/categories", categoryRoutes);

 // BOOKIFY - Prueba temporal de conexión
app.get("/api/db-check", async (req, res) => {
  try {
    // Consultar el número de categorías registradas
    const { count, error } = await supabase
      .from("categories")
      .select("*", {
        count: "exact",
        head: true
      });

    // Controlar errores de Supabase
    if (error) {
      console.error("Error Supabase:", error.message);

      return res.status(503).json({
        success: false,
        message: "No se pudo consultar la base de datos"
      });
    }

    // Conexión satisfactoria
    return res.status(200).json({
      success: true,
      message: "Conexión con Supabase correcta",
      database: "bookify-db",
      totalCategorias: count
    });

  } catch (error) {
    console.error("Error:", error.message);

    return res.status(503).json({
      success: false,
      message: "Base de datos no disponible"
    });
  }
});


// Página temporal: sección en desarrollo
app.get("/en-desarrollo", (req, res) => {
  res.status(200).sendFile(
    path.join(__dirname, "../public/en-desarrollo.html")
  );
});

// Manejar rutas que no existen
app.use((req, res) => {
  // La API siempre devuelve errores en JSON
  if (req.path === "/api" || req.path.startsWith("/api/")) {
    return res.status(404).json({
      success: false,
      message: "Ruta no encontrada"
    });
  }

  // Mostrar página visual en solicitudes del navegador
  if (
    req.method === "GET" &&
    req.accepts("html") &&
    req.headers.accept?.includes("text/html")
  ) {
    return res.status(404).sendFile(
      path.join(__dirname, "../public/404.html")
    );
  }

  return res.status(404).json({
    success: false,
    message: "Ruta no encontrada"
  });
});

// Manejo centralizado de errores de Express
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  // JSON inválido enviado por el cliente
  if (err instanceof SyntaxError && err.status === 400 && "body" in err) {
    return res.status(400).json({
      success: false,
      message: "El cuerpo JSON de la solicitud no es válido"
    });
  }

  // Solicitud demasiado grande
  if (err.status === 413) {
    return res.status(413).json({
      success: false,
      message: "La solicitud supera el tamaño permitido"
    });
  }

  console.error("Error de Express:", err.message);

  return res.status(500).json({
    success: false,
    message: "Error interno del servidor"
  });
});


// Iniciar servidor
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`BOOKIFY API: http://localhost:${PORT}`);
});
