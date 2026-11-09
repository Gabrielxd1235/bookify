const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");

const {
  REFRESH_TOKEN_MS,
  REFRESH_COOKIE_NAME,
  generateRefreshToken,
  hashRefreshToken,
  generateAccessToken,
  setRefreshCookie,
  clearRefreshCookie
} = require("../config/tokens");

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { full_name, email, password } = req.body || {};

    // Validate registration fields
    if (
      typeof full_name !== "string" ||
      typeof email !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, and password are required"
      });
    }

    const name = full_name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (name.length < 3 || name.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Full name must be between 3 and 100 characters"
      });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (
      normalizedEmail.length > 254 ||
      !emailRegex.test(normalizedEmail)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid email address"
      });
    }

    const passwordBytes = Buffer.byteLength(password, "utf8");

    if (password.length < 8 || passwordBytes > 72) {
      return res.status(400).json({
        success: false,
        message:
          "Password must contain at least 8 characters and at most 72 bytes"
      });
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, 12);

    // Register the user with the CLIENT role
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

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Email address is already registered"
        });
      }

      console.error("Registration error:", error.message);

      return res.status(500).json({
        success: false,
        message: "Unable to register the user"
      });
    }

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      user: data
    });

  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    // Validate login fields
    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      !password
    ) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required"
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Find the user
    const { data: user, error } = await supabase
      .from("users")
      .select(
        "id, full_name, email, password_hash, role, is_active"
      )
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (error) {
      console.error("Login query error:", error.message);

      return res.status(503).json({
        success: false,
        message: "Unable to process the login request"
      });
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Verify the password
    const passwordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Reject disabled accounts
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: "Account disabled"
      });
    }

    // Prepare the access token
    const accessToken = generateAccessToken(user);

    // Generate a refresh token
    const refreshToken = generateRefreshToken();
    const refreshTokenHash = hashRefreshToken(refreshToken);

    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_MS
    ).toISOString();

    // Store only the refresh token hash
    const { error: sessionError } = await supabase
      .from("refresh_tokens")
      .insert({
        user_id: user.id,
        token_hash: refreshTokenHash,
        expires_at: expiresAt
      });

    if (sessionError) {
      console.error(
        "Refresh session creation error:",
        sessionError.message
      );

      return res.status(503).json({
        success: false,
        message: "Unable to create the session"
      });
    }

    // Send the refresh token as an HttpOnly cookie
    setRefreshCookie(res, refreshToken);

    // Return the access token
    return res.status(200).json({
      success: true,
      message: "Login successful",
      accessToken,
      tokenType: "Bearer",
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role
      }
    });

  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
};

// POST /api/auth/refresh
const refresh = async (req, res) => {
  try {
    const oldRefreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME];

    if (
      typeof oldRefreshToken !== "string" ||
      !oldRefreshToken
    ) {
      return res.status(401).json({
        success: false,
        message: "Refresh token required"
      });
    }

    // Prepare a replacement refresh token
    const newRefreshToken = generateRefreshToken();

    const oldHash = hashRefreshToken(oldRefreshToken);
    const newHash = hashRefreshToken(newRefreshToken);

    const expiresAt = new Date(
      Date.now() + REFRESH_TOKEN_MS
    ).toISOString();

    // Rotate the token atomically in PostgreSQL
    const { data, error } = await supabase.rpc(
      "rotate_refresh_token",
      {
        p_old_hash: oldHash,
        p_new_hash: newHash,
        p_new_expires_at: expiresAt
      }
    );

    if (error) {
      console.error(
        "Refresh rotation error:",
        error.message
      );

      return res.status(503).json({
        success: false,
        message: "Unable to refresh the session"
      });
    }

    if (!data || data.status !== "OK") {
      clearRefreshCookie(res);

      return res.status(401).json({
        success: false,
        message: "Refresh session is invalid or expired"
      });
    }

    // Generate a new access token
    const accessToken = generateAccessToken(data.user);

    // Replace the old refresh cookie
    setRefreshCookie(res, newRefreshToken);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      accessToken,
      tokenType: "Bearer",
      expiresIn: process.env.JWT_EXPIRES_IN || "1h",
      user: data.user
    });

  } catch (error) {
    console.error("Refresh error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to refresh the session"
    });
  }
};

// POST /api/auth/logout
const logout = async (req, res) => {
  try {
    const refreshToken =
      req.cookies?.[REFRESH_COOKIE_NAME];

    if (typeof refreshToken === "string" && refreshToken) {
      const tokenHash = hashRefreshToken(refreshToken);

      // Revoke the current refresh token family
      const { error } = await supabase.rpc(
        "revoke_refresh_family",
        {
          p_token_hash: tokenHash
        }
      );

      if (error) {
        console.error("Logout error:", error.message);

        return res.status(503).json({
          success: false,
          message: "Unable to close the session"
        });
      }
    }

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully"
    });

  } catch (error) {
    console.error("Logout error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to close the session"
    });
  }
};

// POST /api/auth/logout-all
const logoutAll = async (req, res) => {
  try {
    // Revoke all refresh tokens belonging to the user
    const { error } = await supabase
      .from("refresh_tokens")
      .update({
        revoked_at: new Date().toISOString()
      })
      .eq("user_id", req.user.id)
      .is("revoked_at", null);

    if (error) {
      console.error("Logout all error:", error.message);

      return res.status(503).json({
        success: false,
        message: "Unable to close all sessions"
      });
    }

    clearRefreshCookie(res);

    return res.status(200).json({
      success: true,
      message: "All refresh sessions revoked successfully"
    });

  } catch (error) {
    console.error("Logout all error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to close all sessions"
    });
  }
};

// GET /api/auth/me
const getProfile = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Profile retrieved successfully",
    user: {
      id: req.user.id,
      full_name: req.user.full_name,
      email: req.user.email,
      role: req.user.role
    }
  });
};

module.exports = {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  getProfile
};