const supabase = require("../config/supabase");

// Database fields returned by service queries
const SERVICE_FIELDS =
  "id, business_id, name, description, price, duration_minutes, service_type, billing_period, sessions_included, validity_days, is_active, created_at, updated_at";

// How a service is sold
const SERVICE_TYPES = [
  "APPOINTMENT",
  "SUBSCRIPTION",
  "PACKAGE",
  "DAY_PASS"
];

const BILLING_PERIODS = ["WEEK", "MONTH", "QUARTER", "YEAR"];

// Session length used when a non-appointment service does not send one
const DEFAULT_SESSION_MINUTES = 60;

const isMissing = (value) =>
  value === undefined || value === null || value === "";

// Validate the fields that depend on the service model.
// Fields that do not belong to the chosen model are cleared, so a
// service can never keep stale values from a previous model.
function validateServiceModel(body, partial, values) {
  const modelFields = [
    "billing_period",
    "sessions_included",
    "validity_days"
  ];

  if (body.service_type === undefined) {
    if (
      partial &&
      modelFields.some((field) => body[field] !== undefined)
    ) {
      return "service_type is required when changing the service model";
    }

    if (partial) {
      return null;
    }
  }

  const type = body.service_type ?? "APPOINTMENT";

  if (!SERVICE_TYPES.includes(type)) {
    return "Service type must be APPOINTMENT, SUBSCRIPTION, PACKAGE or DAY_PASS";
  }

  values.service_type = type;
  values.billing_period = null;
  values.sessions_included = null;
  values.validity_days = null;

  if (type === "SUBSCRIPTION") {
    if (!BILLING_PERIODS.includes(body.billing_period)) {
      return "Subscriptions need a billing period: WEEK, MONTH, QUARTER or YEAR";
    }

    values.billing_period = body.billing_period;
  }

  if (type === "PACKAGE") {
    const sessions = Number(body.sessions_included);

    if (
      isMissing(body.sessions_included) ||
      !Number.isInteger(sessions) ||
      sessions < 1 ||
      sessions > 500
    ) {
      return "Packages need between 1 and 500 sessions";
    }

    const validity = isMissing(body.validity_days)
      ? 90
      : Number(body.validity_days);

    if (
      !Number.isInteger(validity) ||
      validity < 1 ||
      validity > 730
    ) {
      return "Package validity must be between 1 and 730 days";
    }

    values.sessions_included = sessions;
    values.validity_days = validity;
  }

  // Everything except an appointment is paid up front, so it cannot be free
  if (
    type !== "APPOINTMENT" &&
    values.price !== undefined &&
    values.price <= 0
  ) {
    return "Subscriptions, packages and day passes need a price above zero";
  }

  return null;
}

// Validate database IDs
const isValidId = (value) =>
  /^[1-9]\d*$/.test(String(value ?? ""));

// Validate service information
function validateService(body, partial = false) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Invalid request body" };
  }

  const values = {};

  if (partial && body.business_id !== undefined) {
    return {
      error: "A service cannot be transferred to another business"
    };
  }

  if (!partial || body.business_id !== undefined) {
    if (!isValidId(body.business_id)) {
      return { error: "A valid business ID is required" };
    }

    values.business_id = body.business_id;
  }

  if (!partial || body.name !== undefined) {
    if (typeof body.name !== "string") {
      return { error: "Service name is required" };
    }

    const name = body.name.trim();

    if (name.length < 2 || name.length > 150) {
      return {
        error: "Service name must contain between 2 and 150 characters"
      };
    }

    values.name = name;
  }

  if (!partial || body.price !== undefined) {
    const price = Number(body.price);

    if (
      body.price === null ||
      body.price === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      price > 1000000
    ) {
      return {
        error: "Price must be a valid non-negative number"
      };
    }

    // Allow floating-point rounding noise when converting prices to cents.
    const cents = price * 100;
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(cents)) * 4;
    if (Math.abs(cents - Math.round(cents)) > tolerance) {
      return {
        error: "Price cannot have more than two decimal places"
      };
    }

    values.price = price;
  }

  const modelError = validateServiceModel(body, partial, values);

  if (modelError) {
    return { error: modelError };
  }

  // Only appointments are sold by duration; the other models fall back
  // to a default session length when none is sent.
  if (
    values.service_type !== undefined &&
    values.service_type !== "APPOINTMENT" &&
    isMissing(body.duration_minutes)
  ) {
    values.duration_minutes = DEFAULT_SESSION_MINUTES;
  } else if (!partial || body.duration_minutes !== undefined) {
    const duration = Number(body.duration_minutes);

    if (
      body.duration_minutes === null ||
      body.duration_minutes === "" ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      duration > 1440
    ) {
      return {
        error: "Duration must be between 1 and 1440 minutes"
      };
    }

    values.duration_minutes = duration;
  }

  if (body.description !== undefined) {
    if (
      body.description !== null &&
      typeof body.description !== "string"
    ) {
      return {
        error: "Description must be a string or null"
      };
    }

    values.description =
      typeof body.description === "string"
        ? body.description.trim()
        : null;
  }

  if (partial && Object.keys(values).length === 0) {
    return {
      error: "At least one valid field must be provided"
    };
  }

  return { values };
}

// Find a business by ID
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

// Find a service by ID
async function findService(serviceId) {
  const { data, error } = await supabase
    .from("services")
    .select(SERVICE_FIELDS)
    .eq("id", serviceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

// Verify business management permissions
function canManageBusiness(user, business) {
  return (
    user.role === "ADMIN" ||
    (
      user.role === "BUSINESS_OWNER" &&
      String(user.id) === String(business.owner_id)
    )
  );
}

// Count active services belonging to active businesses
async function countActiveServices(businessId) {
  let query = supabase
    .from("services")
    .select(
      "id, businesses!inner(is_active)",
      {
        count: "exact",
        head: true
      }
    )
    .eq("is_active", true)
    .eq("businesses.is_active", true);

  if (businessId !== undefined) {
    query = query.eq("business_id", businessId);
  }

  return await query;
}

// GET /api/services
async function getServices(req, res) {
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

    const businessId = req.query.business_id;

    if (
      businessId !== undefined &&
      !isValidId(businessId)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid business ID"
      });
    }

    let query = supabase
      .from("services")
      .select(
        `${SERVICE_FIELDS}, businesses!inner(is_active)`,
        { count: "exact" }
      )
      .eq("is_active", true)
      .eq("businesses.is_active", true);

    // Apply optional business filter
    if (businessId !== undefined) {
      query = query.eq("business_id", businessId);
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
        } = await countActiveServices(businessId);

        if (!countError && start >= (total ?? 0)) {
          return res.status(200).json({
            success: true,
            services: [],
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
            "Service count error:",
            countError.code,
            countError.message
          );
        }
      }

      throw error;
    }

    // Remove internal joined business information
    const services = (data || []).map(
      ({ businesses, ...service }) => service
    );

    return res.status(200).json({
      success: true,
      services,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit)
      }
    });

  } catch (error) {
    console.error(
      "Error retrieving services:",
      error.code,
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve services"
    });
  }
}

// GET /api/services/:id
async function getServiceById(req, res) {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID"
    });
  }

  try {
    const service = await findService(req.params.id);

    if (!service || !service.is_active) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const business = await findBusiness(service.business_id);

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    return res.status(200).json({
      success: true,
      service
    });

  } catch (error) {
    console.error(
      "Error retrieving service:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to retrieve service"
    });
  }
}

// POST /api/services
async function createService(req, res) {
  const validation = validateService(req.body);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const business = await findBusiness(
      validation.values.business_id
    );

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Active business not found"
      });
    }

    if (!canManageBusiness(req.user, business)) {
      return res.status(403).json({
        success: false,
        message: "You cannot create services for this business"
      });
    }

    const { data, error } = await supabase
      .from("services")
      .insert({
        ...validation.values,
        is_active: true
      })
      .select(SERVICE_FIELDS)
      .single();

    if (error) {
      throw error;
    }

    return res.status(201).json({
      success: true,
      message: "Service created successfully",
      service: data
    });

  } catch (error) {
    console.error(
      "Error creating service:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to create service"
    });
  }
}

// PUT /api/services/:id
async function updateService(req, res) {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID"
    });
  }

  const validation = validateService(req.body, true);

  if (validation.error) {
    return res.status(400).json({
      success: false,
      message: validation.error
    });
  }

  try {
    const service = await findService(req.params.id);

    if (!service || !service.is_active) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const business = await findBusiness(service.business_id);

    if (!business || !business.is_active) {
      return res.status(404).json({
        success: false,
        message: "Active business not found"
      });
    }

    if (!canManageBusiness(req.user, business)) {
      return res.status(403).json({
        success: false,
        message: "You cannot update this service"
      });
    }

    const { data, error } = await supabase
      .from("services")
      .update({
        ...validation.values,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.params.id)
      .eq("business_id", service.business_id)
      .eq("is_active", true)
      .select(SERVICE_FIELDS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service updated successfully",
      service: data
    });

  } catch (error) {
    console.error(
      "Error updating service:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to update service"
    });
  }
}

// DELETE /api/services/:id
async function deleteService(req, res) {
  if (!isValidId(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid service ID"
    });
  }

  try {
    const service = await findService(req.params.id);

    if (!service || !service.is_active) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    const business = await findBusiness(service.business_id);

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found"
      });
    }

    if (!canManageBusiness(req.user, business)) {
      return res.status(403).json({
        success: false,
        message: "You cannot deactivate this service"
      });
    }

    // Soft deletion preserves related service records
    const { data, error } = await supabase
      .from("services")
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", req.params.id)
      .eq("business_id", service.business_id)
      .eq("is_active", true)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Service not found"
      });
    }

    return res.status(200).json({
      success: true,
      message: "Service deactivated successfully"
    });

  } catch (error) {
    console.error(
      "Error deactivating service:",
      error.message
    );

    return res.status(500).json({
      success: false,
      message: "Unable to deactivate service"
    });
  }
}

module.exports = {
  getServices,
  getServiceById,
  createService,
  updateService,
  deleteService
};