const bcrypt = require("bcrypt");
const supabase = require("../config/supabase");

const {
  attachReservationDetails
} = require("../utils/reservation-details.utils");

const USER_FIELDS =
  "id, full_name, email, phone, role, is_active, created_at, updated_at";

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

// Count rows of a table with optional equality filters
async function countRows(table, filters = {}) {
  let query = supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  for (const [field, value] of Object.entries(filters)) {
    query = query.eq(field, value);
  }

  const { count, error } = await query;

  if (error) {
    throw error;
  }

  return count || 0;
}

const RESERVATION_STATUSES = [
  "PENDING_PAYMENT",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
  "PAYMENT_FAILED",
  "NO_SHOW"
];

// GET /api/admin/overview
// Read-only platform totals for the administrator dashboard.
async function getOverview(req, res) {
  try {
    const [
      clients,
      owners,
      admins,
      activeBusinesses,
      inactiveBusinesses,
      categories,
      pendingApplications,
      ...statusCounts
    ] = await Promise.all([
      countRows("users", { role: "CLIENT" }),
      countRows("users", { role: "BUSINESS_OWNER" }),
      countRows("users", { role: "ADMIN" }),
      countRows("businesses", { is_active: true }),
      countRows("businesses", { is_active: false }),
      countRows("categories"),
      countRows("business_owner_applications", { status: "PENDING" }),
      ...RESERVATION_STATUSES.map((status) =>
        countRows("reservations", { status })
      )
    ]);

    const byStatus = {};

    RESERVATION_STATUSES.forEach((status, index) => {
      if (statusCounts[index] > 0) {
        byStatus[status] = statusCounts[index];
      }
    });

    const { data: paid, error: paidError } = await supabase
      .from("reservations")
      .select("deposit_amount, total_amount")
      .in("status", ["CONFIRMED", "COMPLETED"])
      .limit(5000);

    if (paidError) {
      return sendDatabaseError(res, paidError);
    }

    const sum = (field) =>
      Math.round(
        (paid || []).reduce(
          (total, row) => total + (Number(row[field]) || 0),
          0
        ) * 100
      ) / 100;

    const { data: recent, error: recentError } = await supabase
      .from("reservations")
      .select(
        "id, user_id, service_id, business_id, status, starts_at, total_amount, deposit_amount, currency, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(6);

    if (recentError) {
      return sendDatabaseError(res, recentError);
    }

    return res.status(200).json({
      success: true,
      overview: {
        users: {
          total: clients + owners + admins,
          clients,
          owners,
          admins
        },
        businesses: {
          active: activeBusinesses,
          inactive: inactiveBusinesses
        },
        categories,
        pendingApplications,
        reservations: {
          total: Object.values(byStatus).reduce(
            (total, value) => total + value,
            0
          ),
          byStatus
        },
        confirmedDeposits: sum("deposit_amount"),
        confirmedValue: sum("total_amount"),
        currency: "PEN"
      },
      recentReservations: await attachReservationDetails(
        recent,
        { includeClient: true }
      )
    });

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

// Load a non-administrator account that an administrator may edit
async function findEditableUser(id, res) {
  if (!isValidId(id)) {
    res.status(400).json({
      success: false,
      message: "Invalid user ID"
    });

    return null;
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id, role, is_active, email")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    sendDatabaseError(res, error);
    return null;
  }

  if (!user) {
    res.status(404).json({
      success: false,
      message: "User not found"
    });

    return null;
  }

  // Administrator accounts are managed outside this dashboard
  if (user.role === "ADMIN") {
    res.status(403).json({
      success: false,
      message: "Administrator accounts cannot be modified here"
    });

    return null;
  }

  return user;
}

// PATCH /api/admin/users/:id
// Correct a user's contact details (full_name, email, phone).
async function updateUserDetails(req, res) {
  const body = req.body || {};
  const accepted = ["full_name", "email", "phone"];
  const keys =
    typeof body === "object" && !Array.isArray(body)
      ? Object.keys(body)
      : [];

  if (
    keys.length === 0 ||
    keys.some((key) => !accepted.includes(key))
  ) {
    return res.status(400).json({
      success: false,
      message: "Only full_name, email and phone can be updated"
    });
  }

  const changes = {};

  if (Object.hasOwn(body, "full_name")) {
    const fullName =
      typeof body.full_name === "string"
        ? body.full_name.trim()
        : "";

    if (fullName.length < 3 || fullName.length > 100) {
      return res.status(400).json({
        success: false,
        message: "Full name must have 3-100 characters"
      });
    }

    changes.full_name = fullName;
  }

  if (Object.hasOwn(body, "email")) {
    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : "";

    if (
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required"
      });
    }

    changes.email = email;
  }

  if (Object.hasOwn(body, "phone")) {
    if (
      body.phone !== null &&
      (
        typeof body.phone !== "string" ||
        !/^[+\d\s()\-]{7,25}$/.test(body.phone.trim())
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid phone number"
      });
    }

    changes.phone =
      body.phone === null ? null : body.phone.trim();
  }

  try {
    const user = await findEditableUser(req.params.id, res);

    if (!user) {
      return undefined;
    }

    // Reject an email that already belongs to another account
    if (changes.email && changes.email !== user.email) {
      const { data: taken, error: takenError } = await supabase
        .from("users")
        .select("id")
        .eq("email", changes.email)
        .neq("id", user.id)
        .maybeSingle();

      if (takenError) {
        return sendDatabaseError(res, takenError);
      }

      if (taken) {
        return res.status(409).json({
          success: false,
          message: "Another account already uses this email"
        });
      }
    }

    const { data, error } = await supabase
      .from("users")
      .update({
        ...changes,
        updated_at: new Date().toISOString()
      })
      .eq("id", user.id)
      .neq("role", "ADMIN")
      .select(USER_FIELDS)
      .maybeSingle();

    if (error) {
      if (error.code === "23505") {
        return res.status(409).json({
          success: false,
          message: "Another account already uses this email"
        });
      }

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
      message: "User details updated successfully",
      user: data
    });

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

// PATCH /api/admin/users/:id/password
// Set a temporary password for a locked-out user and close their sessions.
async function resetUserPassword(req, res) {
  const { new_password: newPassword } = req.body || {};

  if (
    typeof newPassword !== "string" ||
    newPassword.length < 8 ||
    Buffer.byteLength(newPassword, "utf8") > 72
  ) {
    return res.status(400).json({
      success: false,
      message: "Password must have 8+ characters and at most 72 bytes"
    });
  }

  try {
    const user = await findEditableUser(req.params.id, res);

    if (!user) {
      return undefined;
    }

    const now = new Date().toISOString();
    const passwordHash = await bcrypt.hash(newPassword, 12);

    const { data, error } = await supabase
      .from("users")
      .update({
        password_hash: passwordHash,
        password_changed_at: now,
        updated_at: now
      })
      .eq("id", user.id)
      .neq("role", "ADMIN")
      .select("id")
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

    // Close every open session so the old password stops working everywhere
    const { error: revokeError } = await supabase
      .from("refresh_tokens")
      .update({ revoked_at: now })
      .eq("user_id", user.id)
      .is("revoked_at", null);

    if (revokeError) {
      console.error(
        "Session revocation after password reset failed:",
        revokeError.message
      );
    }

    return res.status(200).json({
      success: true,
      message: "Password reset. The user must sign in again."
    });

  } catch (error) {
    return sendDatabaseError(res, error);
  }
}

module.exports = {
  verifyCurrentAdmin,
  getOverview,
  getUsers,
  getUserById,
  updateUserRole,
  updateUserStatus,
  updateUserDetails,
  resetUserPassword
};