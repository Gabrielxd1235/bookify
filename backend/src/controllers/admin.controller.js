const supabase = require("../config/supabase");

const USER_FIELDS =
  "id, full_name, email, role, is_active, created_at, updated_at";

const ALLOWED_ROLES = [
  "CLIENT",
  "BUSINESS_OWNER"
];

function isValidId(value) {
  return /^[1-9]\d*$/.test(String(value ?? "")) &&
    Number.isSafeInteger(Number(value));
}

function sendDatabaseError(res, error) {
  console.error("Admin database error:", error.message);

  return res.status(500).json({
    success: false,
    message: "Unable to complete the requested operation"
  });
}

// Verify the current administrator in the database
async function verifyCurrentAdmin(req, res, next) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, role, is_active")
      .eq("id", req.user.id)
      .maybeSingle();

    if (error) {
      return sendDatabaseError(res, error);
    }

    if (!data || !data.is_active) {
      return res.status(401).json({
        success: false,
        message: "Account is inactive or unavailable"
      });
    }

    if (data.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Administrator access required"
      });
    }

    next();

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

// GET /api/admin/users
async function getUsers(req, res) {
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

  const { role, is_active } = req.query;

  if (
    role !== undefined &&
    !["CLIENT", "BUSINESS_OWNER", "ADMIN"].includes(role)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid role filter"
    });
  }

  if (
    is_active !== undefined &&
    !["true", "false"].includes(is_active)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid account status filter"
    });
  }

  try {
    let query = supabase
      .from("users")
      .select(USER_FIELDS, { count: "exact" });

    if (role !== undefined) {
      query = query.eq("role", role);
    }

    if (is_active !== undefined) {
      query = query.eq("is_active", is_active === "true");
    }

    const { data, count, error } = await query
      .order("id", { ascending: false })
      .range(start, end);

    if (error) {
      return sendDatabaseError(res, error);
    }

    return res.status(200).json({
      success: true,
      users: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

// GET /api/admin/users/:id
async function getUserById(req, res) {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }

  try {
    const { data, error } = await supabase
      .from("users")
      .select(USER_FIELDS)
      .eq("id", req.params.id)
      .maybeSingle();

    if (error) {
      return sendDatabaseError(res, error);
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    return res.status(200).json({
      success: true,
      user: data
    });

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

// PATCH /api/admin/users/:id/role
async function updateUserRole(req, res) {
  const { id } = req.params;
  const { role } = req.body || {};

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }

  if (!ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({
      success: false,
      message: "Role must be CLIENT or BUSINESS_OWNER"
    });
  }

  try {
    const { data: user, error: findError } = await supabase
      .from("users")
      .select("id, role, is_active")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return sendDatabaseError(res, findError);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Administrator roles cannot be modified here
    if (user.role === "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Administrator roles cannot be modified"
      });
    }

    if (!user.is_active) {
      return res.status(409).json({
        success: false,
        message: "Activate the account before changing its role"
      });
    }

    // Prevent owners with businesses from becoming clients
    if (
      user.role === "BUSINESS_OWNER" &&
      role === "CLIENT"
    ) {
      const { count, error } = await supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", id);

      if (error) {
        return sendDatabaseError(res, error);
      }

      if (count > 0) {
        return res.status(409).json({
          success: false,
          message: "Business owners with registered businesses cannot become clients"
        });
      }
    }

    const { data, error } = await supabase
      .from("users")
      .update({
        role,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("role", user.role)
      .eq("is_active", true)
      .select(USER_FIELDS)
      .maybeSingle();

    if (error) {
      return sendDatabaseError(res, error);
    }

    if (!data) {
      return res.status(409).json({
        success: false,
        message: "User information changed. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      message: "User role updated successfully",
      user: data
    });

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

// PATCH /api/admin/users/:id/status
async function updateUserStatus(req, res) {
  const { id } = req.params;
  const { is_active } = req.body || {};

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });
  }

  if (typeof is_active !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "is_active must be a boolean"
    });
  }

  try {
    const { data: user, error: findError } = await supabase
      .from("users")
      .select("id, role, is_active")
      .eq("id", id)
      .maybeSingle();

    if (findError) {
      return sendDatabaseError(res, findError);
    }

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    // Do not allow administrators to deactivate administrators
    if (user.role === "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Administrator accounts cannot be modified here"
      });
    }

    if (user.is_active === is_active) {
      return res.status(200).json({
        success: true,
        message: "Account already has the requested status",
        user: {
          id: user.id,
          role: user.role,
          is_active: user.is_active
        }
      });
    }

    // Protect businesses with active services and reservations
    if (!is_active && user.role === "BUSINESS_OWNER") {
      const { count, error } = await supabase
        .from("businesses")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", id)
        .eq("is_active", true);

      if (error) {
        return sendDatabaseError(res, error);
      }

      if (count > 0) {
        return res.status(409).json({
          success: false,
          message: "Deactivate or reassign active businesses before disabling this owner"
        });
      }
    }

    const { data, error } = await supabase
      .from("users")
      .update({
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("is_active", user.is_active)
      .select(USER_FIELDS)
      .maybeSingle();

    if (error) {
      return sendDatabaseError(res, error);
    }

    if (!data) {
      return res.status(409).json({
        success: false,
        message: "Account status changed. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      message: is_active
        ? "Account activated successfully"
        : "Account deactivated successfully",
      user: data
    });

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

module.exports = {
  verifyCurrentAdmin,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus
};