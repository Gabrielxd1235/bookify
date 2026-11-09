const crypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const REFRESH_TOKEN_DAYS = 30;
const REFRESH_TOKEN_MS =
  REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000;

const REFRESH_COOKIE_NAME = "bookify_refresh";

// Generate a cryptographically secure refresh token
function generateRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

// Hash a refresh token before storing it
function hashRefreshToken(token) {
  return crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");
}

// Generate a short-lived access token
function generateAccessToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
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
}

// Configure the refresh token cookie
function getRefreshCookieOptions() {
  const production = process.env.NODE_ENV === "production";

  return {
    httpOnly: true,
    secure: production,
    sameSite: production ? "none" : "lax",
    path: "/api/auth",
    maxAge: REFRESH_TOKEN_MS
  };
}

// Store the refresh token in an HttpOnly cookie
function setRefreshCookie(res, token) {
  res.cookie(
    REFRESH_COOKIE_NAME,
    token,
    getRefreshCookieOptions()
  );
}

// Delete the refresh token cookie
function clearRefreshCookie(res) {
  const { maxAge, ...options } = getRefreshCookieOptions();

  res.clearCookie(
    REFRESH_COOKIE_NAME,
    options
  );
}

module.exports = {
  REFRESH_TOKEN_MS,
  REFRESH_COOKIE_NAME,
  generateRefreshToken,
  hashRefreshToken,
  generateAccessToken,
  setRefreshCookie,
  clearRefreshCookie
};