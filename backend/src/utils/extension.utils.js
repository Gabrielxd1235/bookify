const supabase = require("../config/supabase");

function wrapAsync(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function isPositiveId(value) {
  return /^[1-9]\d*$/.test(String(value ?? ""));
}

function isNonEmptyString(value, min, max) {
  return typeof value === "string" &&
    value.trim().length >= min && value.trim().length <= max;
}

function publicImageUrl(bucket, path) {
  if (!path) return null;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

function respondDbError(res, error, fallback = "Database operation failed") {
  console.error("BOOKIFY extension database error:", error?.code, error?.message);
  const status = {
    "23505": 409, "23503": 409,
    "B4001": 400, "B4040": 404, "B4090": 409, "42501": 403
  }[error?.code] || 500;
  return res.status(status).json({
    success: false,
    message: status < 500 ? (error?.message || fallback) : fallback
  });
}

module.exports = { wrapAsync, isPositiveId, isNonEmptyString, publicImageUrl, respondDbError };
