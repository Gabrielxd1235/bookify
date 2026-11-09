const supabase = require("../config/supabase");

// Database fields returned by business queries
const BUSINESS_FIELDS =
  "id, owner_id, category_id, name, description, address, phone, is_active, created_at, updated_at";

// Validate database IDs
const isValidId = (value) => /^[1-9]\d*$/.test(String(value));

// Validate business information
function validateBusiness(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body" };
  }

  const values = {};

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string") {
      return { error: "Business name is required" };
    }

    const name = body.name.trim();

    if (name.length < 3 || name.length > 150) {
      return {
        error: "Business name must contain between 3 and 150 characters"
      };
    }

    values.name = name;
  }

  if (!partial || body.category_id !== undefined) {
    if (!isValidId(body.category_id)) {
      return { error: "A valid category ID is required" };
    }

    values.category_id = body.category_id;
  }

  const optionalFields = ["description", "address", "phone"];

  for (const field of optionalFields) {
    if (body[field] !== undefined) {
      if (body[field] !== null && typeof body[field] !== "string") {
        return { error: `${field} must be a string or null` };
      }

      values[field] =
        typeof body[field] === "string"
          ? body[field].trim()
          : null;
    }
  }

  if (values.phone && !/^[+\d()\s-]{7,25}$/.test(values.phone)) {
    return { error: "Invalid phone number format" };
  }

  if (partial && Object.keys(values).length === 0) {
    return { error: "At least one valid field must be provided" };
  }

  return { values };
}

// Verify category existence
async function categoryExists(categoryId) {
  const { data, error } = await supabase
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

// Verify that an owner account is valid
async function ownerExists(ownerId) {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("id", ownerId)
    .eq("role", "BUSINESS_OWNER")
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

// Count active businesses using the same public filters
async function countActiveBusinesses(categoryId) {
  let query = supabase
    .from("businesses")
    .select("id", {
      count: "exact",
      head: true
    })
    .eq("is_active", true);

  if (categoryId !== undefined) {
    query = query.eq("category_id", categoryId);
  }

  return await query;
}

// GET /api/businesses
async function getBusinesses(req, res) {
  try {
    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    if (
      !Number.isSafeInteger(page) ||
      !Number.isSafeInteger(limit) ||
      page < 1 ||
      limit < 1 ||
      limit > 100
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid pagination parameters"
      });
    }

    const start = (page - 1) * limit;
    const end = start + limit - 1;

    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end)
    ) {
      return res.status(400).json({
        success: false,
        message: "Pagination range is too large"
      });
    }

    const categoryId = req.query.category_id;

    if (
      categoryId !== undefined &&
      !isValidId(categoryId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID"
      });
    }

    let query = supabase
      .from("businesses")
      .select(BUSINESS_FIELDS, {
        count: "exact"
      })
      .eq("is_active", true);

    // Apply the optional category filter
    if (categoryId !== undefined) {
      query = query.eq("category_id", categoryId);
    }

    const { data, count, error } = await query
      .order("name", { ascending: true })
      .order("id", { ascending: true })
      .range(start, end);

    if (error) {
      // Handle pages beyond the available record range
      if (error.code === "PGRST103") {
        const {
          count: total,
          error: countError
        } = await countActiveBusinesses(categoryId);

        if (!countError && start >= (total ?? 0)) {
          return res.status(200).json({
            success: true,
            businesses: [],
            pagination: {
              page,
              limit,
              total: total ?? 0,
              totalPages: Math.ceil((total ?? 0) / limit)
            }
          });
        }

        if (countError) {
          console.error(
            "Business count error:",
            countError.code,
            countError.message
          );
        }
      }

      console.error(
        "Business query error:",
        error.code,
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to retrieve businesses"
      });
    }

    return res.status(200).json({
      success: true,
      businesses: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error(
      "Internal business error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// GET /api/businesses/:id
async function getBusinessById(req, res) {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID"
    });
  }

  try {
    const { data, error } = await supabase
      .from("businesses")
      .select(BUSINESS_FIELDS)
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Unable to retrieve business"
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Business not found"
      });
    }

    return res.status(200).json({
      success: true,
      business: data
    });

  } catch (error) {
    console.error(
      "Internal business error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// GET /api/businesses/mine
async function getMyBusinesses(req, res) {
  try {
    const { data, error } = await supabase
      .from("businesses")
      .select(BUSINESS_FIELDS)
      .eq("owner_id", req.user.id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({
        success: false,
        message: "Unable to retrieve your businesses"
      });
    }

    return res.status(200).json({
      success: true,
      businesses: data || []
    });

  } catch (error) {
    console.error(
      "Internal business error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// POST /api/businesses
async function createBusiness(req, res) {
  const validation = validateBusiness(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const values = validation.values;
    let ownerId;

    if (req.user.role === "ADMIN") {
      ownerId = req.body.owner_id;

      if (!isValidId(ownerId)) {
        return res.status(400).json({
          success: false,
          message: "A valid owner ID is required"
        });
      }
    } else {
      // Owners cannot assign businesses to other users
      ownerId = req.user.id;
    }

    if (!(await ownerExists(ownerId))) {
      return res.status(404).json({
        success: false,
        message: "Active business owner not found"
      });
    }

    if (!(await categoryExists(values.category_id))) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    const { data, error } = await supabase
      .from("businesses")
      .insert({
        ...values,
        owner_id: ownerId,
        is_active: true
      })
      .select(BUSINESS_FIELDS)
      .single();

    if (error) {
      console.error(
        "Business creation error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to create business"
      });
    }

    return res.status(201).json({
      success: true,
      message: "Business created successfully",
      business: data
    });

  } catch (error) {
    console.error(
      "Internal business error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// PUT /api/businesses/:id
async function updateBusiness(req, res) {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID"
    });
  }

  const validation = validateBusiness(req.body, true);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const { data: existing, error: findError } = await supabase
      .from("businesses")
      .select("id, owner_id")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (findError) {
      return res.status(500).json({
        success: false,
        message: "Unable to verify business"
      });
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Business not found"
      });
    }

    if (
      req.user.role !== "ADMIN" &&
      String(existing.owner_id) !== String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot modify another owner's business"
      });
    }

    if (
      validation.values.category_id !== undefined &&
      !(await categoryExists(validation.values.category_id))
    ) {
      return res.status(404).json({
        success: false,
        message: "Category not found"
      });
    }

    // Restrict updates to the authorized owner
    let updateQuery = supabase
      .from("businesses")
      .update({
        ...validation.values,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("is_active", true);

    if (req.user.role !== "ADMIN") {
      updateQuery = updateQuery.eq(
        "owner_id",
        req.user.id
      );
    }

    const { data, error } = await updateQuery
      .select(BUSINESS_FIELDS)
      .maybeSingle();

    if (error) {
      console.error(
        "Business update error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to update business"
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Business not found or no longer available"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Business updated successfully",
      business: data
    });

  } catch (error) {
    console.error(
      "Internal business error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// DELETE /api/businesses/:id
async function deleteBusiness(req, res) {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID"
    });
  }

  try {
    const { data: existing, error: findError } = await supabase
      .from("businesses")
      .select("id, owner_id")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (findError) {
      return res.status(500).json({
        success: false,
        message: "Unable to verify business"
      });
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Business not found"
      });
    }

    if (
      req.user.role !== "ADMIN" &&
      String(existing.owner_id) !== String(req.user.id)
    ) {
      return res.status(403).json({
        success: false,
        message: "You cannot deactivate another owner's business"
      });
    }

    // Soft deletion preserves related business data
    let deleteQuery = supabase
      .from("businesses")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("is_active", true);

    if (req.user.role !== "ADMIN") {
      deleteQuery = deleteQuery.eq(
        "owner_id",
        req.user.id
      );
    }

    const { data, error } = await deleteQuery
      .select("id")
      .maybeSingle();

    if (error) {
      console.error(
        "Business deactivation error:",
        error.message
      );

      return res.status(500).json({
        success: false,
        message: "Unable to deactivate business"
      });
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Business not found or already deactivated"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Business deactivated successfully"
    });

  } catch (error) {
    console.error(
      "Internal business error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

module.exports = {
  getBusinesses,
  getBusinessById,
  getMyBusinesses,
  createBusiness,
  updateBusiness,
  deleteBusiness
};