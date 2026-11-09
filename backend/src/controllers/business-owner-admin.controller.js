const supabase = require("../config/supabase");
const { isPositiveId, respondDbError, publicImageUrl } = require("../utils/extension.utils");
const { BUSINESS_BUCKET } = require("../utils/image-storage.utils");

const FIELDS = "id, user_id, category_id, business_name, description, address, phone, status, logo_path, cover_path, admin_note, reviewed_at, reviewed_by, created_at";

async function listApplications(req, res) {
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const status = req.query.status;
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 ||
      (status !== undefined && !["PENDING", "APPROVED", "REJECTED"].includes(status))) {
    return res.status(400).json({ success: false, message: "Invalid pagination or status filter" });
  }
  const start = (page - 1) * limit;
  const end = start + limit - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
    return res.status(400).json({ success: false, message: "Pagination range too large" });
  }

  let counting = supabase.from("business_owner_applications")
    .select("id", { count: "exact", head: true });
  if (status) counting = counting.eq("status", status);
  const { count, error: countError } = await counting;
  if (countError) return respondDbError(res, countError, "Unable to count applications");
  const total = count ?? 0;
  if (start >= total) {
    return res.json({ success: true, applications: [], pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  }

  let query = supabase.from("business_owner_applications").select(FIELDS);
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false })
    .order("id", { ascending: false }).range(start, end);
  if (error) return respondDbError(res, error, "Unable to retrieve applications");
  return res.json({
    success: true,
    applications: (data || []).map(a => ({
      ...a,
      logo_url: publicImageUrl(BUSINESS_BUCKET, a.logo_path),
      cover_url: publicImageUrl(BUSINESS_BUCKET, a.cover_path)
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
  });
}

async function reviewApplication(req, res) {
  if (!isPositiveId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid application ID" });
  const { decision, admin_note } = req.body || {};
  if (!["APPROVED", "REJECTED"].includes(decision) ||
      (admin_note != null && (typeof admin_note !== "string" || admin_note.length > 1000))) {
    return res.status(400).json({ success: false, message: "Decision must be APPROVED or REJECTED" });
  }
  // Atomic SQL transaction promotes the client and creates the business.
  const { data, error } = await supabase.rpc("review_business_owner_application", {
    p_application_id: Number(req.params.id),
    p_admin_id: Number(req.user.id),
    p_decision: decision,
    p_admin_note: admin_note?.trim() || null
  });
  if (error) return respondDbError(res, error, "Unable to review application");
  return res.json({ success: true, message: "Application reviewed", result: data });
}

module.exports = { listApplications, reviewApplication };
