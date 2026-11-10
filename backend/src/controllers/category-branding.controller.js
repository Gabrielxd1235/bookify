"use strict";

const supabase = require("../config/supabase");
const { uploadFile, removeFile } = require("../utils/image-storage.utils");
const { respondDbError } = require("../utils/extension.utils");
const {
  ICON_KEYS, BUCKET, PREFIX, isCategoryId, isIconKey, isOwnedCategoryImagePath
} = require("../utils/category-branding.utils");

const FIELDS = "id, icon_key, image_url, image_path";

async function findCategory(id) {
  const { data, error } = await supabase.from("categories")
    .select(FIELDS).eq("id", id).maybeSingle();
  return { data, error };
}

function handleInvalidId(req, res) {
  if (isCategoryId(req.params.id)) return false;
  res.status(400).json({ success: false, message: "Invalid category ID" });
  return true;
}

async function listBranding(req, res) {
  // Public metadata only. Do not send storage credentials or internal object paths.
  const { data, error } = await supabase.from("categories")
    .select("id, icon_key, image_url").order("name", { ascending: true }).limit(500);
  if (error) return respondDbError(res, error, "Unable to load category branding");
  return res.json({ success: true, categories: data || [], allowed_icons: ICON_KEYS });
}

async function getBranding(req, res) {
  if (handleInvalidId(req, res)) return;
  const { data, error } = await findCategory(req.params.id);
  if (error) return respondDbError(res, error, "Unable to load category branding");
  if (!data) return res.status(404).json({ success: false, message: "Category not found" });
  return res.json({ success: true, category: { id: data.id, icon_key: data.icon_key, image_url: data.image_url } });
}

async function setIcon(req, res) {
  if (handleInvalidId(req, res)) return;
  const icon = req.body?.icon_key;
  if (!isIconKey(icon)) {
    return res.status(400).json({ success: false, message: `Invalid icon. Choose one of: ${ICON_KEYS.join(", ")}` });
  }
  const { data, error } = await supabase.from("categories")
    .update({ icon_key: icon }).eq("id", req.params.id)
    .select("id, icon_key, image_url").maybeSingle();
  if (error) return respondDbError(res, error, "Unable to update category icon");
  if (!data) return res.status(404).json({ success: false, message: "Category not found" });
  return res.json({ success: true, category: data });
}

async function uploadImage(req, res) {
  if (handleInvalidId(req, res)) return;
  if (!req.file) return res.status(400).json({ success: false, message: "An image is required" });
  const id = req.params.id;
  const before = await findCategory(id);
  if (before.error) return respondDbError(res, before.error, "Unable to load category");
  if (!before.data) return res.status(404).json({ success: false, message: "Category not found" });

  // Upload a new object with a random path; never trust a user-provided filename/path.
  const uploaded = await uploadFile(BUCKET, `${PREFIX}/${id}`, req.file);
  if (uploaded.error) return res.status(400).json({ success: false, message: uploaded.error });
  if (uploaded.storageError) {
    console.error("Category image upload failed:", uploaded.storageError.message);
    return res.status(502).json({ success: false, message: "Unable to store category image" });
  }

  const { data, error } = await supabase.from("categories")
    .update({ image_path: uploaded.path, image_url: uploaded.url })
    .eq("id", id).select(FIELDS).maybeSingle();
  if (error || !data) {
    await removeFile(BUCKET, uploaded.path); // Best-effort rollback.
    if (error) return respondDbError(res, error, "Unable to update category image");
    return res.status(404).json({ success: false, message: "Category not found" });
  }
  if (isOwnedCategoryImagePath(id, before.data.image_path)) {
    await removeFile(BUCKET, before.data.image_path);
  }
  return res.json({ success: true, category: { id: data.id, image_url: data.image_url, icon_key: data.icon_key } });
}

async function deleteImage(req, res) {
  if (handleInvalidId(req, res)) return;
  const id = req.params.id;
  const before = await findCategory(id);
  if (before.error) return respondDbError(res, before.error, "Unable to load category");
  if (!before.data) return res.status(404).json({ success: false, message: "Category not found" });
  const { error } = await supabase.from("categories")
    .update({ image_path: null, image_url: null }).eq("id", id);
  if (error) return respondDbError(res, error, "Unable to remove category image");
  if (isOwnedCategoryImagePath(id, before.data.image_path)) {
    await removeFile(BUCKET, before.data.image_path);
  }
  return res.json({ success: true, category: { id: Number(id), image_url: null, icon_key: before.data.icon_key } });
}

module.exports = { listBranding, getBranding, setIcon, uploadImage, deleteImage };
