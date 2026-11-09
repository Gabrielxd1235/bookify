
const jwt = require("jsonwebtoken");
const supabase = require("../config/supabase");

// Verify user authentication
const verifyToken = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization;

    // 1. Check for a Bearer authorization header
    if (
      !authorization ||
      !/^Bearer \S+$/i.test(authorization)
    ) {
      return res.status(401).json({
        success: false,
        message: "Authentication token required"
      });
    }

    const token = authorization.split(" ")[1];

    // 2. Verify the JWT signature and expiration
    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is not configured");
    }

    let decoded;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ["HS256"]
      });
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }

    // 3. Check that the token contains a valid ID
    if (
      typeof decoded !== "object" ||
      !/^[1-9]\d*$/.test(decoded.sub || "")
    ) {
      return res.status(401).json({
        success: false,
        message: "Invalid token"
      });
    }

    // 4. Check that the user still exists
    const { data: user, error } = await supabase
      .from("users")
      .select("id, full_name, email, role, is_active")
      .eq("id", decoded.sub)
      .maybeSingle();

    if (error) {
      console.error("Error verifying user:", error.message);

      return res.status(503).json({
        success: false,
        message: "Unable to verify the session"
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid session"
      });
    }

    // 5. Block access for disabled accounts
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account disabled"
      });
    }

    // 6. Attach the verified user to the request
    req.user = user;

    next();

  } catch (error) {
    console.error("Authentication error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal authentication error"
    });
  }
};

module.exports = { verifyToken };
