const supabase = require("../config/supabase");
const { isPositiveId, publicImageUrl, respondDbError } = require("../utils/extension.utils");
const { BUSINESS_BUCKET, uploadFile, removeFile } = require("../utils/image-storage.utils");

async function findBusiness(id) {
  const { data, error } = await supabase.from("businesses")
    .select("id, owner_id, is_active, logo_path, cover_path")
    .eq("id", id).maybeSingle();
  return { business: data, error };
}
function permitted(user, business) {
  return user.role === "ADMIN" || (user.role === "BUSINESS_OWNER" && String(user.id) === String(business.owner_id));
}
function photoDto(photo) {
  return { id: photo.id, caption: photo.caption, sort_order: photo.sort_order,
    url: publicImageUrl(BUSINESS_BUCKET, photo.storage_path) };
}

async function getBusinessMedia(req, res) {
  if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid business ID" });
  const { business, error: findError } = await findBusiness(req.params.id);
  if (findError) return respondDbError(res, findError, "Unable to find business");
  if (!business || !business.is_active) return res.status(404).json({ success: false, message: "Business not found" });
  const { data, error } = await supabase.from("business_images")
    .select("id, storage_path, caption, sort_order").eq("business_id", req.params.id)
    .order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (error) return respondDbError(res, error, "Unable to retrieve gallery");
  return res.json({ success: true, business_id: business.id,
    logo_url: publicImageUrl(BUSINESS_BUCKET, business.logo_path),
    cover_url: publicImageUrl(BUSINESS_BUCKET, business.cover_path),
    gallery: (data || []).map(photoDto)
  });
}

async function uploadBusinessImage(req, res, kind) {
  if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid business ID" });
  if (!req.file) return res.status(400).json({ success: false, message: "Upload image in multipart field 'image'" });
  const { business, error: findError } = await findBusiness(req.params.id);
  if (findError) return respondDbError(res, findError, "Unable to load business");
  if (!business || !business.is_active) return res.status(404).json({ success: false, message: "Active business not found" });
  if (!permitted(req.user, business)) return res.status(403).json({ success: false, message: "Cannot edit another owner's business" });

  const uploaded = await uploadFile(BUSINESS_BUCKET, `businesses/${business.id}/${kind}`, req.file);
  if (uploaded.error) return res.status(400).json({ success: false, message: uploaded.error });
  if (uploaded.storageError) return respondDbError(res, uploaded.storageError, "Business media storage unavailable");
  const column = kind === "logo" ? "logo_path" : "cover_path";
  const { data, error } = await supabase.from("businesses")
    .update({ [column]: uploaded.path, updated_at: new Date().toISOString() })
    .eq("id", business.id).eq("is_active", true)
    .select("id").maybeSingle();
  if (error || !data) {
    await removeFile(BUSINESS_BUCKET, uploaded.path);
    if (error) return respondDbError(res, error, "Unable to save business image");
    return res.status(409).json({ success: false, message: "Business was deactivated" });
  }
  await removeFile(BUSINESS_BUCKET, business[column]);
  return res.json({ success: true, [`${kind}_url`]: uploaded.url });
}

async function addGalleryImage(req, res) {
  if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid business ID" });
  if (!req.file) return res.status(400).json({ success: false, message: "Upload image in multipart field 'image'" });
  const { business, error: findError } = await findBusiness(req.params.id);
  if (findError) return respondDbError(res, findError, "Unable to load business");
  if (!business || !business.is_active) return res.status(404).json({ success: false, message: "Active business not found" });
  if (!permitted(req.user, business)) return res.status(403).json({ success: false, message: "Cannot edit another owner's business" });

  const caption = req.body?.caption;
  if (caption != null && (typeof caption !== "string" || caption.length > 180)) {
    return res.status(400).json({ success: false, message: "Caption exceeds 180 characters" });
  }
  const { count, error: countError } = await supabase.from("business_images")
    .select("id", { count: "exact", head: true }).eq("business_id", business.id);
  if (countError) return respondDbError(res, countError, "Unable to check gallery size");
  if ((count ?? 0) >= 10) return res.status(409).json({ success: false, message: "Maximum 10 gallery images per business" });

  const uploaded = await uploadFile(BUSINESS_BUCKET, `businesses/${business.id}/gallery`, req.file);
  if (uploaded.error) return res.status(400).json({ success: false, message: uploaded.error });
  if (uploaded.storageError) return respondDbError(res, uploaded.storageError, "Business gallery storage unavailable");
  const { data, error } = await supabase.from("business_images")
    .insert({ business_id: business.id, storage_path: uploaded.path, caption: caption?.trim() || null })
    .select("id, storage_path, caption, sort_order").single();
  if (error) {
    await removeFile(BUSINESS_BUCKET, uploaded.path);
    return respondDbError(res, error, "Unable to add gallery image");
  }
  return res.status(201).json({ success: true, image: photoDto(data) });
}

async function deleteGalleryImage(req, res) {
  if (!isPositiveId(req.params.id) || !isPositiveId(req.params.imageId)) {
    return res.status(400).json({ success: false, message: "Invalid business or image ID" });
  }
  const { business, error: findError } = await findBusiness(req.params.id);
  if (findError) return respondDbError(res, findError, "Unable to load business");
  if (!business) return res.status(404).json({ success: false, message: "Business not found" });
  if (!permitted(req.user, business)) return res.status(403).json({ success: false, message: "Cannot edit another owner's business" });
  const { data, error } = await supabase.from("business_images")
    .delete().eq("id", req.params.imageId).eq("business_id", business.id)
    .select("storage_path").maybeSingle();
  if (error) return respondDbError(res, error, "Unable to remove gallery image");
  if (!data) return res.status(404).json({ success: false, message: "Gallery image not found" });
  await removeFile(BUSINESS_BUCKET, data.storage_path);
  return res.json({ success: true, message: "Gallery image removed" });
}

module.exports = {
  getBusinessMedia,
  uploadLogo: (req, res) => uploadBusinessImage(req, res, "logo"),
  uploadCover: (req, res) => uploadBusinessImage(req, res, "cover"),
  addGalleryImage, deleteGalleryImage
};
