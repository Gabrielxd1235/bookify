"use strict";
const supabase = require("../config/supabase");

// Star ratings and written reviews for each business, plus testimonials
// about BOOKIFY itself. Only clients with a confirmed or completed booking
// at a business can review it (verified reviews); owners cannot review their
// own business.

const MAX_LIMIT = 20;

function positiveId(value) {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function readRating(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function cleanText(value) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

// "Lucía Fernández" -> "Lucía F."
function publicName(fullName) {
  const parts = cleanText(fullName).split(" ").filter(Boolean);
  if (parts.length === 0) return "BOOKIFY user";
  return parts.length === 1 ? parts[0] : `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

function dbError(res, error, label) {
  console.error(`${label}:`, error?.code, error?.message);
  return res.status(500).json({ success: false, message: "Unable to process reviews right now" });
}

async function loadAuthors(rows) {
  const ids = [...new Set(rows.map((r) => r.user_id))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase.from("users").select("id, full_name").in("id", ids);
  if (error) throw error;
  return new Map((data || []).map((u) => [String(u.id), publicName(u.full_name)]));
}

function summarize(rows) {
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  for (const r of rows) {
    distribution[r.rating] += 1;
    sum += r.rating;
  }
  return {
    average: rows.length ? Math.round((sum / rows.length) * 10) / 10 : 0,
    count: rows.length,
    distribution
  };
}

// ---------------------------------------------------------------------
// Business reviews
// ---------------------------------------------------------------------

// GET /api/reviews/business-ratings  -> average and count for every business
async function getBusinessRatings(req, res) {
  const { data, error } = await supabase
    .from("business_rating_summary")
    .select("business_id, average_rating, review_count");

  if (error) return dbError(res, error, "Business ratings error");

  return res.status(200).json({
    success: true,
    ratings: (data || []).map((r) => ({
      business_id: r.business_id,
      average: Number(r.average_rating),
      count: r.review_count
    }))
  });
}

// GET /api/businesses/:id/reviews?page=1&limit=10
async function listBusinessReviews(req, res) {
  const businessId = positiveId(req.params.id);
  if (!businessId) return res.status(400).json({ success: false, message: "Invalid business ID" });

  const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.parseInt(req.query.limit, 10) || 6));

  // Ratings only (small) for the summary; the page of reviews separately
  const [all, pageResult] = await Promise.all([
    supabase.from("business_reviews").select("rating").eq("business_id", businessId),
    supabase
      .from("business_reviews")
      .select("id, user_id, rating, comment, is_verified, created_at, updated_at", { count: "exact" })
      .eq("business_id", businessId)
      .order("created_at", { ascending: false })
      .range((page - 1) * limit, page * limit - 1)
  ]);

  if (all.error) return dbError(res, all.error, "Business reviews summary error");
  if (pageResult.error) return dbError(res, pageResult.error, "Business reviews list error");

  try {
    const authors = await loadAuthors(pageResult.data || []);
    const total = pageResult.count || 0;
    return res.status(200).json({
      success: true,
      summary: summarize(all.data || []),
      reviews: (pageResult.data || []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        is_verified: r.is_verified,
        author: authors.get(String(r.user_id)) || "BOOKIFY user",
        created_at: r.created_at,
        edited: r.updated_at && r.created_at && new Date(r.updated_at) - new Date(r.created_at) > 60000
      })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) }
    });
  } catch (error) {
    return dbError(res, error, "Review authors error");
  }
}

// GET /api/businesses/:id/reviews/mine
async function getMyBusinessReview(req, res) {
  const businessId = positiveId(req.params.id);
  if (!businessId) return res.status(400).json({ success: false, message: "Invalid business ID" });

  const [review, eligibility] = await Promise.all([
    supabase
      .from("business_reviews")
      .select("id, rating, comment, is_verified, created_at, updated_at")
      .eq("business_id", businessId)
      .eq("user_id", req.user.id)
      .maybeSingle(),
    canReview(req.user, businessId)
  ]);

  if (review.error) return dbError(res, review.error, "My review error");

  return res.status(200).json({
    success: true,
    review: review.data || null,
    canReview: eligibility.allowed,
    reason: eligibility.reason
  });
}

async function canReview(user, businessId) {
  const { data: business, error } = await supabase
    .from("businesses")
    .select("id, owner_id, is_active")
    .eq("id", businessId)
    .maybeSingle();

  if (error) throw error;
  if (!business || business.is_active === false) return { allowed: false, reason: "This business is not available" };
  if (String(business.owner_id) === String(user.id)) return { allowed: false, reason: "You cannot review your own business" };
  if (user.role === "ADMIN") return { allowed: false, reason: "Administrators cannot write reviews" };

  const { count, error: bookingError } = await supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("user_id", user.id)
    .in("status", ["CONFIRMED", "COMPLETED"]);

  if (bookingError) throw bookingError;
  if (!count) return { allowed: false, reason: "Book and pay a service at this business to leave a review" };
  return { allowed: true, reason: null };
}

// PUT /api/businesses/:id/reviews   body: { rating, comment }
async function upsertBusinessReview(req, res) {
  const businessId = positiveId(req.params.id);
  if (!businessId) return res.status(400).json({ success: false, message: "Invalid business ID" });

  const rating = readRating(req.body?.rating);
  const comment = cleanText(req.body?.comment);

  if (!rating) return res.status(400).json({ success: false, message: "Choose between 1 and 5 stars" });
  if (comment && (comment.length < 3 || comment.length > 800)) {
    return res.status(400).json({ success: false, message: "The review must be between 3 and 800 characters" });
  }

  try {
    const eligibility = await canReview(req.user, businessId);
    if (!eligibility.allowed) return res.status(403).json({ success: false, message: eligibility.reason });

    const { data, error } = await supabase
      .from("business_reviews")
      .upsert(
        {
          business_id: businessId,
          user_id: req.user.id,
          rating,
          comment: comment || null,
          is_verified: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: "business_id,user_id" }
      )
      .select("id, rating, comment, is_verified, created_at, updated_at")
      .single();

    if (error) return dbError(res, error, "Save review error");

    console.info("Business review saved", { businessId, rating });
    return res.status(200).json({ success: true, message: "Thank you for your review", review: data });
  } catch (error) {
    return dbError(res, error, "Save review error");
  }
}

// DELETE /api/businesses/:id/reviews/mine
async function deleteMyBusinessReview(req, res) {
  const businessId = positiveId(req.params.id);
  if (!businessId) return res.status(400).json({ success: false, message: "Invalid business ID" });

  const { error } = await supabase
    .from("business_reviews")
    .delete()
    .eq("business_id", businessId)
    .eq("user_id", req.user.id);

  if (error) return dbError(res, error, "Delete review error");
  return res.status(200).json({ success: true, message: "Your review was removed" });
}

// DELETE /api/reviews/:reviewId   (admin moderation)
async function adminDeleteBusinessReview(req, res) {
  const id = positiveId(req.params.reviewId);
  if (!id) return res.status(400).json({ success: false, message: "Invalid review ID" });

  const { data, error } = await supabase.from("business_reviews").delete().eq("id", id).select("id");
  if (error) return dbError(res, error, "Admin delete review error");
  if (!data?.length) return res.status(404).json({ success: false, message: "Review not found" });
  return res.status(200).json({ success: true, message: "Review removed" });
}

// ---------------------------------------------------------------------
// Platform testimonials ("What people say about BOOKIFY")
// ---------------------------------------------------------------------

// GET /api/platform-reviews?limit=9
async function listPlatformReviews(req, res) {
  const limit = Math.min(30, Math.max(1, Number.parseInt(req.query.limit, 10) || 9));

  const [all, latest] = await Promise.all([
    supabase.from("platform_reviews").select("rating").eq("is_published", true),
    supabase
      .from("platform_reviews")
      .select("id, user_id, rating, comment, created_at")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(limit)
  ]);

  if (all.error) return dbError(res, all.error, "Platform reviews summary error");
  if (latest.error) return dbError(res, latest.error, "Platform reviews list error");

  try {
    const authors = await loadAuthors(latest.data || []);
    return res.status(200).json({
      success: true,
      summary: summarize(all.data || []),
      reviews: (latest.data || []).map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        author: authors.get(String(r.user_id)) || "BOOKIFY user",
        created_at: r.created_at
      }))
    });
  } catch (error) {
    return dbError(res, error, "Platform review authors error");
  }
}

// GET /api/platform-reviews/mine
async function getMyPlatformReview(req, res) {
  const { data, error } = await supabase
    .from("platform_reviews")
    .select("id, rating, comment, is_published, created_at, updated_at")
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (error) return dbError(res, error, "My platform review error");
  return res.status(200).json({ success: true, review: data || null });
}

// PUT /api/platform-reviews/mine   body: { rating, comment }
async function upsertPlatformReview(req, res) {
  const rating = readRating(req.body?.rating);
  const comment = cleanText(req.body?.comment);

  if (!rating) return res.status(400).json({ success: false, message: "Choose between 1 and 5 stars" });
  if (comment.length < 10 || comment.length > 600) {
    return res.status(400).json({ success: false, message: "Your opinion must be between 10 and 600 characters" });
  }

  const { data, error } = await supabase
    .from("platform_reviews")
    .upsert(
      { user_id: req.user.id, rating, comment, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
    .select("id, rating, comment, is_published, created_at, updated_at")
    .single();

  if (error) return dbError(res, error, "Save platform review error");

  console.info("Platform review saved", { rating });
  return res.status(200).json({ success: true, message: "Thanks for sharing your opinion", review: data });
}

// DELETE /api/platform-reviews/mine
async function deleteMyPlatformReview(req, res) {
  const { error } = await supabase.from("platform_reviews").delete().eq("user_id", req.user.id);
  if (error) return dbError(res, error, "Delete platform review error");
  return res.status(200).json({ success: true, message: "Your opinion was removed" });
}

// PATCH /api/admin/platform-reviews/:reviewId   body: { is_published }
async function adminPublishPlatformReview(req, res) {
  const id = positiveId(req.params.reviewId);
  if (!id) return res.status(400).json({ success: false, message: "Invalid review ID" });
  if (typeof req.body?.is_published !== "boolean") {
    return res.status(400).json({ success: false, message: "is_published must be true or false" });
  }

  const { data, error } = await supabase
    .from("platform_reviews")
    .update({ is_published: req.body.is_published, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, is_published");

  if (error) return dbError(res, error, "Publish platform review error");
  if (!data?.length) return res.status(404).json({ success: false, message: "Review not found" });
  return res.status(200).json({ success: true, review: data[0] });
}

module.exports = {
  getBusinessRatings,
  listBusinessReviews,
  getMyBusinessReview,
  upsertBusinessReview,
  deleteMyBusinessReview,
  adminDeleteBusinessReview,
  listPlatformReviews,
  getMyPlatformReview,
  upsertPlatformReview,
  deleteMyPlatformReview,
  adminPublishPlatformReview,
  publicName
};
