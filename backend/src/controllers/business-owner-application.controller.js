const supabase = require("../config/supabase");
const { isPositiveId, isNonEmptyString, publicImageUrl, respondDbError } = require("../utils/extension.utils");
const { BUSINESS_BUCKET, uploadFile, removeFile } = require("../utils/image-storage.utils");

const FIELDS = "id, user_id, category_id, business_name, description, address, phone, logo_path, cover_path, status, admin_note, reviewed_by, reviewed_at, created_at";

function present(application) {
  if (!application) return null;
  return {
    ...application,
    logo_url: publicImageUrl(BUSINESS_BUCKET, application.logo_path),
    cover_url: publicImageUrl(BUSINESS_BUCKET, application.cover_path)
  };
}

function validateNewApplication(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body" };
  }
  const { category_id, business_name, description, address, phone } = body;
  if (!isPositiveId(category_id)) return { error: "Valid category_id is required" };
  if (!isNonEmptyString(business_name, 3, 150)) return { error: "Business name must have 3-150 characters" };
  if (!isNonEmptyString(address, 5, 300)) return { error: "Address must have 5-300 characters" };
  if (description != null && (typeof description !== "string" || description.length > 1000)) {
    return { error: "Description must contain at most 1000 characters" };
  }
  if (phone != null && (typeof phone !== "string" || !/^[+\d()\s-]{7,30}$/.test(phone))) {
    return { error: "Invalid phone number" };
  }
  return {
    values: {
      category_id: Number(category_id),
      business_name: business_name.trim(),
      description: description?.trim() || null,
      address: address.trim(),
      phone: phone?.trim() || null
    }
  };
}

async function getLatestApplication(req, res) {
  const { data, error } = await supabase.from("business_owner_applications")
    .select(FIELDS).eq("user_id", req.user.id)
    .order("created_at", { ascending: false }).limit(1);
  if (error) return respondDbError(res, error, "Unable to retrieve application");
  return res.json({ success: true, application: present(data?.[0] || null) });
}

async function createApplication(req, res) {
  if (req.user.role !== "CLIENT") {
    return res.status(409).json({ success: false, message: "Only CLIENT accounts can apply" });
  }
  const validation = validateNewApplication(req.body);
  if (validation.error) return res.status(400).json({ success: false, message: validation.error });
  const { data: category, error: categoryError } = await supabase.from("categories")
    .select("id").eq("id", validation.values.category_id).maybeSingle();
  if (categoryError) return respondDbError(res, categoryError, "Unable to validate category");
  if (!category) return res.status(404).json({ success: false, message: "Category not found" });

  const { data, error } = await supabase.from("business_owner_applications")
    .insert({ user_id: req.user.id, ...validation.values })
    .select(FIELDS).single();
  if (error) return respondDbError(res, error, "Unable to create business application");
  return res.status(201).json({
    success: true,
    message: "Application submitted for administrator review",
    application: present(data)
  });
}

async function uploadApplicationImage(req, res, kind) {
  if (req.user.role !== "CLIENT") {
    return res.status(403).json({ success: false, message: "Only applicants can edit pending applications" });
  }
  if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid application ID" });
  if (!req.file) return res.status(400).json({ success: false, message: "Upload image in multipart field 'image'" });
  const { data: application, error: findError } = await supabase.from("business_owner_applications")
    .select("id, user_id, status, logo_path, cover_path")
    .eq("id", req.params.id).eq("user_id", req.user.id).maybeSingle();
  if (findError) return respondDbError(res, findError, "Unable to load application");
  if (!application) return res.status(404).json({ success: false, message: "Application not found" });
  if (application.status !== "PENDING") {
    return res.status(409).json({ success: false, message: "Reviewed applications cannot be edited" });
  }
  const column = kind === "logo" ? "logo_path" : "cover_path";
  const uploaded = await uploadFile(BUSINESS_BUCKET, `applications/${req.user.id}/${application.id}/${kind}`, req.file);
  if (uploaded.error) return res.status(400).json({ success: false, message: uploaded.error });
  if (uploaded.storageError) return respondDbError(res, uploaded.storageError, "Image storage unavailable");
  const { data, error: updateError } = await supabase.from("business_owner_applications")
    .update({ [column]: uploaded.path, updated_at: new Date().toISOString() })
    .eq("id", application.id).eq("user_id", req.user.id).eq("status", "PENDING")
    .select("id").maybeSingle();
  if (updateError || !data) {
    await removeFile(BUSINESS_BUCKET, uploaded.path);
    if (updateError) return respondDbError(res, updateError, "Unable to save application image");
    return res.status(409).json({ success: false, message: "Application status changed" });
  }
  await removeFile(BUSINESS_BUCKET, application[column]);
  return res.json({ success: true, [`${kind}_url`]: uploaded.url });
}

module.exports = {
  getLatestApplication,
  createApplication,
  uploadApplicationLogo: (req, res) => uploadApplicationImage(req, res, "logo"),
  uploadApplicationCover: (req, res) => uploadApplicationImage(req, res, "cover")
};
