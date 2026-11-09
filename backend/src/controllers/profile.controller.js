const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");
const { isNonEmptyString, publicImageUrl, respondDbError } = require("../utils/extension.utils");
const { AVATAR_BUCKET, uploadFile, removeFile } = require("../utils/image-storage.utils");

const FIELDS = "id, full_name, email, role, phone, avatar_path, is_active";

function serializeProfile(user) {
  return {
    id: user.id,
    full_name: user.full_name,
    email: user.email,
    role: user.role,
    phone: user.phone ?? null,
    avatar_url: publicImageUrl(AVATAR_BUCKET, user.avatar_path),
    is_active: user.is_active
  };
}

async function getMe(req, res) {
  const { data, error } = await supabase.from("users").select(FIELDS)
    .eq("id", req.user.id).maybeSingle();
  if (error) return respondDbError(res, error, "Unable to retrieve profile");
  if (!data) return res.status(404).json({ success: false, message: "User not found" });
  return res.json({ success: true, user: serializeProfile(data) });
}

async function updateMe(req, res) {
  const body = req.body || {};
  const accepted = ["full_name", "phone"];
  if (typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0 ||
      Object.keys(body).some(key => !accepted.includes(key))) {
    return res.status(400).json({ success: false, message: "Only full_name and phone can be updated" });
  }
  const changes = {};
  if (Object.hasOwn(body, "full_name")) {
    if (!isNonEmptyString(body.full_name, 3, 100)) {
      return res.status(400).json({ success: false, message: "Full name must have 3-100 characters" });
    }
    changes.full_name = body.full_name.trim();
  }
  if (Object.hasOwn(body, "phone")) {
    if (body.phone !== null && (typeof body.phone !== "string" ||
        !/^[+\d\s()\-]{7,25}$/.test(body.phone.trim()))) {
      return res.status(400).json({ success: false, message: "Invalid phone number" });
    }
    changes.phone = body.phone === null ? null : body.phone.trim();
  }
  const { data, error } = await supabase.from("users").update(changes)
    .eq("id", req.user.id).select(FIELDS).maybeSingle();
  if (error) return respondDbError(res, error, "Unable to update profile");
  return res.json({ success: true, message: "Profile updated", user: serializeProfile(data) });
}

async function changePassword(req, res) {
  const { current_password: currentPassword, new_password: newPassword } = req.body || {};
  if (typeof currentPassword !== "string" || typeof newPassword !== "string" ||
      newPassword.length < 8 || Buffer.byteLength(newPassword, "utf8") > 72) {
    return res.status(400).json({ success: false, message: "Invalid password; use 8+ characters and at most 72 bytes" });
  }
  const { data: user, error } = await supabase.from("users")
    .select("id, password_hash").eq("id", req.user.id).maybeSingle();
  if (error) return respondDbError(res, error, "Unable to verify current password");
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  if (!(await bcrypt.compare(currentPassword, user.password_hash))) {
    return res.status(401).json({ success: false, message: "Current password is incorrect" });
  }
  if (await bcrypt.compare(newPassword, user.password_hash)) {
    return res.status(400).json({ success: false, message: "New password must be different" });
  }
  const hash = await bcrypt.hash(newPassword, 12);
  const { error: updateError } = await supabase.from("users")
    .update({ password_hash: hash, password_changed_at: new Date().toISOString() })
    .eq("id", req.user.id);
  if (updateError) return respondDbError(res, updateError, "Unable to change password");
  // IMPORTANT: Existing JWT/refresh sessions are not automatically revoked here.
  // Apply the session revocation integration described in INTEGRATION/SESSION_SECURITY.md.
  return res.json({ success: true, message: "Password updated successfully" });
}

async function uploadAvatar(req, res) {
  if (!req.file) return res.status(400).json({ success: false, message: "Upload image in multipart field 'image'" });
  const { data: user, error: findError } = await supabase.from("users")
    .select("id, avatar_path").eq("id", req.user.id).maybeSingle();
  if (findError) return respondDbError(res, findError, "Unable to load profile");
  if (!user) return res.status(404).json({ success: false, message: "User not found" });
  const uploaded = await uploadFile(AVATAR_BUCKET, `users/${req.user.id}`, req.file);
  if (uploaded.error) return res.status(400).json({ success: false, message: uploaded.error });
  if (uploaded.storageError) return respondDbError(res, uploaded.storageError, "Avatar storage unavailable");
  const { error } = await supabase.from("users").update({ avatar_path: uploaded.path }).eq("id", req.user.id);
  if (error) {
    await removeFile(AVATAR_BUCKET, uploaded.path);
    return respondDbError(res, error, "Unable to save avatar");
  }
  await removeFile(AVATAR_BUCKET, user.avatar_path);
  return res.json({ success: true, avatar_url: uploaded.url });
}

async function deleteAvatar(req, res) {
  const { data, error } = await supabase.from("users").select("avatar_path")
    .eq("id", req.user.id).maybeSingle();
  if (error) return respondDbError(res, error, "Unable to load profile");
  if (!data) return res.status(404).json({ success: false, message: "User not found" });
  const { error: updateError } = await supabase.from("users").update({ avatar_path: null }).eq("id", req.user.id);
  if (updateError) return respondDbError(res, updateError, "Unable to remove avatar");
  await removeFile(AVATAR_BUCKET, data.avatar_path);
  return res.json({ success: true, message: "Avatar removed" });
}

module.exports = { getMe, updateMe, changePassword, uploadAvatar, deleteAvatar };
