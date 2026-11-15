const supabase = require("../config/supabase");

// Collect unique, non-empty values of one field
function uniqueValues(rows, field) {
  return [
    ...new Set(
      rows
        .map((row) => row?.[field])
        .filter((value) => value !== null && value !== undefined)
    )
  ];
}

// Load "id -> row" pairs for a list of IDs
async function loadRows(table, fields, ids) {
  if (ids.length === 0) {
    return new Map();
  }

  const { data, error } = await supabase
    .from(table)
    .select(`id, ${fields}`)
    .in("id", ids);

  if (error) {
    throw error;
  }

  return new Map(
    (data || []).map((row) => [String(row.id), row])
  );
}

// Load "id -> label" pairs for a list of IDs
async function loadLabels(table, labelField, ids) {
  const rows = await loadRows(table, labelField, ids);

  return new Map(
    [...rows].map(([id, row]) => [id, row[labelField]])
  );
}

// Add readable names to reservation rows.
// Read-only: the reservation records themselves are never modified.
// If a lookup fails, the original rows are returned unchanged so the
// reservation endpoints keep working exactly as before.
async function attachReservationDetails(rows, options = {}) {
  const list = Array.isArray(rows) ? rows : [];

  if (list.length === 0) {
    return list;
  }

  try {
    const [services, businesses, clients] = await Promise.all([
      loadRows(
        "services",
        "name, billing_period, sessions_included",
        uniqueValues(list, "service_id")
      ),
      loadLabels("businesses", "name", uniqueValues(list, "business_id")),
      options.includeClient
        ? loadLabels("users", "full_name", uniqueValues(list, "user_id"))
        : Promise.resolve(null)
    ]);

    return list.map((row) => {
      const detailed = {
        ...row,
        service_name:
          services.get(String(row.service_id))?.name || null,
        billing_period:
          services.get(String(row.service_id))?.billing_period || null,
        sessions_included:
          services.get(String(row.service_id))?.sessions_included || null,
        business_name: businesses.get(String(row.business_id)) || null
      };

      if (clients) {
        detailed.client_name =
          clients.get(String(row.user_id)) || null;
      }

      return detailed;
    });

  } catch (error) {
    console.error(
      "Reservation details lookup failed:",
      error.message
    );

    return list;
  }
}

module.exports = {
  attachReservationDetails
};
