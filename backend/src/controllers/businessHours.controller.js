const supabase = require("../config/supabase");

const HOURS_FIELDS =
  "id, business_id, weekday, opens_at, closes_at, is_closed";

const isValidId = (value) =>
  /^[1-9]\d*$/.test(String(value ?? ""));

const isValidWeekday = (value) => {
  const number = Number(value);

  return (
    value !== "" &&
    value !== null &&
    value !== undefined &&
    Number.isInteger(number) &&
    number >= 0 &&
    number <= 6
  );
};

// Convert HH:mm or HH:mm:ss to HH:mm:ss
function normalizeTime(value) {
  if (typeof value !== "string") {
    return null;
  }

  const time = value.trim();

  const pattern = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

  if (!pattern.test(time)) {
    return null;
  }

  return time.length === 5 ? `${time}:00` : time;
}

// Validate opening and closing times
function validateHours(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body" };
  }

  const isClosed = body.is_closed ?? false;

  if (typeof isClosed !== "boolean") {
    return {
      error: "is_closed must be a boolean"
    };
  }

  if (isClosed) {
    return {
      values: {
        opens_at: null,
        closes_at: null,
        is_closed: true
      }
    };
  }

  const opensAt = normalizeTime(body.opens_at);
  const closesAt = normalizeTime(body.closes_at);

  if (!opensAt || !closesAt) {
    return {
      error: "Valid opening and closing times are required"
    };
  }

  if (opensAt >= closesAt) {
    return {
      error: "Closing time must be later than opening time"
    };
  }

  return {
    values: {
      opens_at: opensAt,
      closes_at: closesAt,
      is_closed: false
    }
  };
}

// Find an active business
async function findBusiness(businessId) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, owner_id, is_active")
    .eq("id", businessId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// Check business management permissions
function canManage(user, business) {
  return (
    user.role === "ADMIN" ||
    (
      user.role === "BUSINESS_OWNER" &&
      String(user.id) === String(business.owner_id)
    )
  );
}

// GET /api/businesses/:businessId/hours
async function getBusinessHours(req, res) {
  const { businessId } = req.params;

  if (!isValidId(businessId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID"
    });
  }

  try {
    const business = await findBusiness(businessId);

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Business not found"
      });
    }

    const { data, error } = await supabase
      .from("business_hours")
      .select(HOURS_FIELDS)
      .eq("business_id", businessId)
      .order("weekday", { ascending: true });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      business_id: Number(businessId),
      hours: data || []
    });

  } catch (error) {
    console.error("Error retrieving business hours:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve business hours"
    });
  }
}

// POST /api/businesses/:businessId/hours
async function createBusinessHours(req, res) {
  const { businessId } = req.params;

  if (!isValidId(businessId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID"
    });
  }

  if (!isValidWeekday(req.body?.weekday)) {
    return res.status(400).json({
      success: false,
      message: "Weekday must be between 0 and 6"
    });
  }

  const validation = validateHours(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const business = await findBusiness(businessId);

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Active business not found"
      });
    }

    if (!canManage(req.user, business)) {
      return res.status(403).json({
        success: false,
        message: "You cannot manage this business"
      });
    }

    const weekday = Number(req.body.weekday);

    // Prevent duplicate schedules for the same weekday
    const { data: existing, error: checkError } = await supabase
      .from("business_hours")
      .select("id")
      .eq("business_id", businessId)
      .eq("weekday", weekday)
      .limit(1);

    if (checkError) {
      throw checkError;
    }

    if (existing && existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Business hours already exist for this weekday"
      });
    }

    const { data, error } = await supabase
      .from("business_hours")
      .insert({
        business_id: Number(businessId),
        weekday,
        ...validation.values
      })
      .select(HOURS_FIELDS)
      .single();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Business hours already exist for this weekday"
        });
      }

      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Business hours created successfully",
      hours: data
    });

  } catch (error) {
    console.error("Error creating business hours:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to create business hours"
    });
  }
}

// PUT /api/businesses/:businessId/hours/:weekday
async function updateBusinessHours(req, res) {
  const { businessId, weekday } = req.params;

  if (!isValidId(businessId) || !isValidWeekday(weekday)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID or weekday"
    });
  }

  const validation = validateHours(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const business = await findBusiness(businessId);

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Active business not found"
      });
    }

    if (!canManage(req.user, business)) {
      return res.status(403).json({
        success: false,
        message: "You cannot manage this business"
      });
    }

    const { data, error } = await supabase
      .from("business_hours")
      .update(validation.values)
      .eq("business_id", businessId)
      .eq("weekday", Number(weekday))
      .select(HOURS_FIELDS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Business hours not found for this weekday"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Business hours updated successfully",
      hours: data
    });

  } catch (error) {
    console.error("Error updating business hours:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to update business hours"
    });
  }
}

// DELETE /api/businesses/:businessId/hours/:weekday
async function deleteBusinessHours(req, res) {
  const { businessId, weekday } = req.params;

  if (!isValidId(businessId) || !isValidWeekday(weekday)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID or weekday"
    });
  }

  try {
    const business = await findBusiness(businessId);

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Active business not found"
      });
    }

    if (!canManage(req.user, business)) {
      return res.status(403).json({
        success: false,
        message: "You cannot manage this business"
      });
    }

    const { data, error } = await supabase
      .from("business_hours")
      .delete()
      .eq("business_id", businessId)
      .eq("weekday", Number(weekday))
      .select("id");

    if (error) {
      throw error;
    }

    if (!data || data.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Business hours not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Business hours deleted successfully"
    });

  } catch (error) {
    console.error("Error deleting business hours:", error.message);

    return res.status(500).json({
      success: false,
      message: "Unable to delete business hours"
    });
  }
}

module.exports = {
  getBusinessHours,
  createBusinessHours,
  updateBusinessHours,
  deleteBusinessHours
};