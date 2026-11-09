const supabase = require("../config/supabase");

// Fields returned by reservation queries
const RESERVATION_FIELDS = `
  id,
  user_id,
  service_id,
  business_id,
  starts_at,
  ends_at,
  status,
  notes,
  total_amount,
  deposit_amount,
  balance_amount,
  currency,
  payment_expires_at,
  created_at,
  updated_at
`;

// Validate positive integer IDs
function isValidId(value) {
  const number = Number(value);

  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isSafeInteger(number) &&
    number > 0
  );
}

// Validate pagination parameters
function getPagination(query) {
  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 10);

  if (
    !Number.isSafeInteger(page) ||
    !Number.isSafeInteger(limit) ||
    page < 1 ||
    limit < 1 ||
    limit > 100
  ) {
    return null;
  }

  const start = (page - 1) * limit;
  const end = start + limit - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end)
  ) {
    return null;
  }

  return { page, limit, start, end };
}

// Return a safe database error response
function handleDatabaseError(res, error, operation) {
  console.error(`${operation}:`, error);

  const knownErrors = {
    B4001: 400,
    B4040: 404,
    B4090: 409
  };

  const status = knownErrors[error.code] || 500;

  const message = knownErrors[error.code]
    ? error.message
    : "Internal server error";

  return res.status(status).json({
    success: false,
    message
  });
}

// Check if a user owns a business
async function ownsBusiness(user, businessId) {
  if (user.role === "ADMIN") {
    return true;
  }

  if (user.role !== "BUSINESS_OWNER") {
    return false;
  }

  const { data, error } = await supabase
    .from("businesses")
    .select("id")
    .eq("id", businessId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data);
}

// POST /api/reservations
async function createReservation(req, res) {
  const { service_id, starts_at, notes } = req.body || {};

  if (!isValidId(service_id)) {
    return res.status(400).json({
      success: false,
      message: "A valid service ID is required"
    });
  }

  if (
    typeof starts_at !== "string" ||
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(starts_at) ||
    Number.isNaN(Date.parse(starts_at))
  ) {
    return res.status(400).json({
      success: false,
      message: "A valid ISO 8601 date with timezone is required"
    });
  }

  if (
    notes !== undefined &&
    notes !== null &&
    (
      typeof notes !== "string" ||
      notes.length > 500
    )
  ) {
    return res.status(400).json({
      success: false,
      message: "Reservation notes must not exceed 500 characters"
    });
  }

  try {
    // The user ID comes from the verified JWT.
    // Prices and availability are calculated in PostgreSQL.
    const { data, error } = await supabase.rpc(
      "create_pending_reservation",
      {
        p_user_id: req.user.id,
        p_service_id: Number(service_id),
        p_starts_at: starts_at,
        p_notes: notes || null
      }
    );

    if (error) {
      return handleDatabaseError(
        res,
        error,
        "Error creating reservation"
      );
    }

    if (!data) {
      return res.status(500).json({
        success: false,
        message: "Reservation creation returned no data"
      });
    }

    return res.status(201).json({
      success: true,
      message: "Reservation created. Deposit payment is required.",
      reservation: data,
      payment: {
        required: true,
        percentage: 50,
        amount: data.deposit_amount,
        currency: data.currency,
        status: "PENDING",
        expires_at: data.payment_expires_at
      }
    });

  } catch (error) {
    console.error("Reservation error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// GET /api/reservations/mine
async function getMyReservations(req, res) {
  const pagination = getPagination(req.query);

  if (!pagination) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination parameters"
    });
  }

  try {
    const { data, count, error } = await supabase
      .from("reservations")
      .select(RESERVATION_FIELDS, { count: "exact" })
      .eq("user_id", req.user.id)
      .order("starts_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.start, pagination.end);

    if (error) {
      return handleDatabaseError(
        res,
        error,
        "Error retrieving reservations"
      );
    }

    return res.status(200).json({
      success: true,
      reservations: data || [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil(
          (count || 0) / pagination.limit
        )
      }
    });

  } catch (error) {
    console.error("Reservation query error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// GET /api/reservations/business/:businessId
async function getBusinessReservations(req, res) {
  const { businessId } = req.params;

  if (!isValidId(businessId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid business ID"
    });
  }

  const pagination = getPagination(req.query);

  if (!pagination) {
    return res.status(400).json({
      success: false,
      message: "Invalid pagination parameters"
    });
  }

  try {
    const allowed = await ownsBusiness(
      req.user,
      businessId
    );

    if (!allowed) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this business's reservations"
      });
    }

    const { data, count, error } = await supabase
      .from("reservations")
      .select(RESERVATION_FIELDS, { count: "exact" })
      .eq("business_id", businessId)
      .order("starts_at", { ascending: false })
      .order("id", { ascending: false })
      .range(pagination.start, pagination.end);

    if (error) {
      return handleDatabaseError(
        res,
        error,
        "Error retrieving business reservations"
      );
    }

    return res.status(200).json({
      success: true,
      reservations: data || [],
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: count || 0,
        totalPages: Math.ceil(
          (count || 0) / pagination.limit
        )
      }
    });

  } catch (error) {
    console.error("Business reservations error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// GET /api/reservations/:id
async function getReservationById(req, res) {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid reservation ID"
    });
  }

  try {
    const { data, error } = await supabase
      .from("reservations")
      .select(RESERVATION_FIELDS)
      .eq("id", id)
      .maybeSingle();

    if (error) {
      return handleDatabaseError(
        res,
        error,
        "Error retrieving reservation"
      );
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found"
      });
    }

    const isClientOwner =
      String(data.user_id) === String(req.user.id);

    const isBusinessManager = await ownsBusiness(
      req.user,
      data.business_id
    );

    if (!isClientOwner && !isBusinessManager) {
      return res.status(403).json({
        success: false,
        message: "You cannot access this reservation"
      });
    }

    return res.status(200).json({
      success: true,
      reservation: data
    });

  } catch (error) {
    console.error("Reservation details error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// PATCH /api/reservations/:id/cancel
async function cancelReservation(req, res) {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid reservation ID"
    });
  }

  try {
    const { data: existing, error: findError } = await supabase
      .from("reservations")
      .select("id, user_id, status")
      .eq("id", id)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (findError) {
      return handleDatabaseError(
        res,
        findError,
        "Error checking reservation"
      );
    }

    if (!existing) {
      return res.status(404).json({
        success: false,
        message: "Reservation not found"
      });
    }

    // Until refunds are integrated, only unpaid
    // reservations can be cancelled through this API.
    if (existing.status !== "PENDING_PAYMENT") {
      return res.status(409).json({
        success: false,
        message:
          "Only pending-payment reservations can be cancelled through this endpoint"
      });
    }

    const { data, error } = await supabase
      .from("reservations")
      .update({
        status: "CANCELLED",
        updated_at: new Date().toISOString()
      })
      .eq("id", id)
      .eq("user_id", req.user.id)
      .eq("status", "PENDING_PAYMENT")
      .select(RESERVATION_FIELDS)
      .maybeSingle();

    if (error) {
      return handleDatabaseError(
        res,
        error,
        "Error cancelling reservation"
      );
    }

    if (!data) {
      return res.status(409).json({
        success: false,
        message: "Reservation status changed. Please try again."
      });
    }

    return res.status(200).json({
      success: true,
      message: "Reservation cancelled successfully",
      reservation: data
    });

  } catch (error) {
    console.error("Reservation cancellation error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error"
    });
  }
}

// GET /api/reservations/availability
async function getAvailableSlots(req, res) {
  const { service_id, date } = req.query;

  if (!isValidId(service_id)) {
    return res.status(400).json({
      success: false,
      message: "A valid service ID is required"
    });
  }

  if (
    typeof date !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date)
  ) {
    return res.status(400).json({
      success: false,
      message: "Date must use the YYYY-MM-DD format"
    });
  }

  const parsedDate = new Date(`${date}T00:00:00Z`);

  if (
    Number.isNaN(parsedDate.getTime()) ||
    parsedDate.toISOString().slice(0, 10) !== date
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid reservation date"
    });
  }

  try {
    const { data, error } = await supabase.rpc(
      "get_available_slots",
      {
        p_service_id: Number(service_id),
        p_date: date
      }
    );

    if (error) {
      return handleDatabaseError(
        res,
        error,
        "Error retrieving available slots"
      );
    }

    const slots = data || [];

    return res.status(200).json({
      success: true,
      service_id: Number(service_id),
      date,
      timezone: "America/Lima",
      slots,
      availableSlots: slots.filter(
        (slot) => slot.available === true
      )
    });

  } catch (error) {
    console.error(
      "Availability error:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve available slots"
    });
  }
}

module.exports = {
  createReservation,
  getMyReservations,
  getBusinessReservations,
  getReservationById,
  cancelReservation,
  getAvailableSlots
};