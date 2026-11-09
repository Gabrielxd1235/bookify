// Environment configuration
require("dotenv").config();

// Main dependencies
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("node:path");

// Database connection
const supabase = require("./config/supabase");

// API routes
const authRoutes = require("./routes/auth.routes");
const roleRoutes = require("./routes/role.routes");
const categoryRoutes = require("./routes/category.routes");
const businessRoutes = require("./routes/business.routes");
const serviceRoutes = require("./routes/service.routes");
const businessHoursRoutes = require("./routes/businessHours.routes");
const reservationRoutes = require("./routes/reservation.routes");
const paymentRoutes = require("./routes/payment.routes");
const adminRoutes = require("./routes/admin.routes");
// BOOKIFY - Profile and Business Owner Extensions
const profileRoutes = require("./routes/profile.routes");
const ownerApplicationRoutes = require("./routes/business-owner-application.routes");
const ownerApplicationAdminRoutes = require("./routes/business-owner-admin.routes");
const businessMediaRoutes = require("./routes/business-media.routes");
const mockCheckoutRoutes = require("./routes/mock-checkout.routes");
// Background jobs
const {
  startReservationExpiryJob
} = require("./jobs/reservationExpiry.job");

// Initialize Express
const app = express();

// Security middleware
app.use(helmet());

// Configure allowed frontend origins
const allowedOrigins = (
  process.env.FRONTEND_URL || "http://localhost:5173"
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Configure CORS
app.use(cors({
  origin: (origin, callback) => {

    // Allow requests without Origin, but do not add CORS headers
    if (!origin) {
      return callback(null, false);
    }

    // Allow registered frontend origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, origin);
    }

    // Do not authorize unexpected origins
    return callback(null, false);
  },

  credentials: true,

  methods: [
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS"
  ],

  allowedHeaders: [
    "Content-Type",
    "Authorization"
  ]
}));

// Parse JSON request bodies
app.use(express.json({
  limit: "10kb"
}));

// Parse authentication cookies
app.use(cookieParser());

// Check whether the request comes from localhost
function isLocalRequest(req) {
  const localAddresses = [
    "127.0.0.1",
    "::1",
    "::ffff:127.0.0.1"
  ];

  return localAddresses.includes(req.ip);
}

// Validate rate limiter configuration
const configuredWindow = Number(
  process.env.RATE_LIMIT_WINDOW_MS || 900000
);

const configuredLimit = Number(
  process.env.RATE_LIMIT_MAX || 20000
);

const rateLimitWindow =
  Number.isSafeInteger(configuredWindow) &&
  configuredWindow > 0
    ? configuredWindow
    : 900000;

const rateLimitMax =
  Number.isSafeInteger(configuredLimit) &&
  configuredLimit > 0
    ? configuredLimit
    : 100;

// Configure API rate limiting
const apiLimiter = rateLimit({
  windowMs: rateLimitWindow,

  limit: rateLimitMax,

  // Skip limits only for local load testing
  skip: (req) => {
    return (
      process.env.NODE_ENV === "loadtest" &&
      isLocalRequest(req)
    );
  },

  standardHeaders: "draft-8",

  legacyHeaders: false,

  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

// Apply rate limiting to API routes
app.use("/api", apiLimiter);

// Health check
app.get("/api/health", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "BOOKIFY API is running",
    status: "OK"
  });
});

// Authentication routes
app.use("/api/auth", authRoutes);

// Role-based dashboard routes
app.use("/api/dashboard", roleRoutes);

// Category management
app.use("/api/categories", categoryRoutes);

// Business management
app.use("/api/businesses", businessRoutes);

// Service management
app.use("/api/services", serviceRoutes);

// Business hours management
app.use("/api/businesses", businessHoursRoutes);

// Reservation management
app.use("/api/reservations", reservationRoutes);

// Payment management
app.use("/api/payments", paymentRoutes);

// Administrator management
app.use("/api/admin", adminRoutes);

// BOOKIFY - New API Routes
app.use("/api/profile", profileRoutes);
app.use("/api/business-owner", ownerApplicationRoutes);
app.use("/api/admin", ownerApplicationAdminRoutes);
app.use("/api/businesses", businessMediaRoutes);
app.use("/api/mock-checkout", mockCheckoutRoutes);

// Database connection check
app.get("/api/db-check", async (req, res) => {
  try {
    const { count, error } = await supabase
      .from("categories")
      .select("*", {
        count: "exact",
        head: true
      });

    if (error) {
      console.error(
        "Database check failed:",
        error.message
      );

      return res.status(503).json({
        success: false,
        message: "Unable to query the database"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Successfully connected to Supabase",
      database: "bookify-db",
      totalCategories: count
    });

  } catch (error) {
    console.error(
      "Database connection error:",
      error.message
    );

    return res.status(503).json({
      success: false,
      message: "Database unavailable"
    });
  }
});

// Under development page
app.get("/under-development", (req, res) => {
  return res.status(200).sendFile(
    path.join(
      __dirname,
      "../public/under-development.html"
    )
  );
});

// Handle unknown routes
app.use((req, res) => {

  // Handle unknown API routes
  if (
    req.path === "/api" ||
    req.path.startsWith("/api/")
  ) {
    return res.status(404).json({
      success: false,
      message: "Route not found"
    });
  }

  // Display the HTML 404 page
  if (
    req.method === "GET" &&
    req.headers.accept?.includes("text/html")
  ) {
    return res.status(404).sendFile(
      path.join(
        __dirname,
        "../public/404.html"
      )
    );
  }

  return res.status(404).json({
    success: false,
    message: "Route not found"
  });
});

// Centralized error handling
app.use((err, req, res, next) => {

  if (res.headersSent) {
    return next(err);
  }

  // Handle invalid JSON
  if (
    err instanceof SyntaxError &&
    err.status === 400 &&
    "body" in err
  ) {
    return res.status(400).json({
      success: false,
      message: "The request body contains invalid JSON"
    });
  }

  // Handle oversized request bodies
  if (err.status === 413) {
    return res.status(413).json({
      success: false,
      message: "The request exceeds the allowed size"
    });
  }

  // Handle unexpected errors
  console.error(
    "Express error:",
    err.message
  );

  return res.status(500).json({
    success: false,
    message: "Internal server error"
  });
});

// Start the server
const PORT = process.env.PORT || 3000;

if (require.main === module) {

  // Bind load testing exclusively to localhost
  const HOST =
    process.env.NODE_ENV === "loadtest"
      ? "127.0.0.1"
      : (process.env.HOST || "0.0.0.0");

  app.listen(PORT, HOST, () => {

    console.log(
      `BOOKIFY API: http://localhost:${PORT}`
    );

    console.log(
      `Environment: ${process.env.NODE_ENV || "development"}`
    );

    console.log(
      `Rate limit: ${rateLimitMax} requests`
    );

    console.log(
      `Rate limit window: ${rateLimitWindow} ms`
    );

    // Start automatic reservation expiration
    if (process.env.NODE_ENV !== "test") {
      startReservationExpiryJob();
    }
  });
}

// Export Express for automated tests
module.exports = app;