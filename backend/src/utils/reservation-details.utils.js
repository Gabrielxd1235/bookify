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

function amount(value, currency = "PEN") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "";
  return `${currency === "PEN" ? "S/" : currency} ${number.toFixed(2)}`;
}

function by(changedBy) {
  return { CLIENT: "the client", BUSINESS: "the business", ADMIN: "an administrator", SYSTEM: "BOOKIFY" }[changedBy] || "";
}

// "Why is this booking in this state?" - shown in the Reason column for
// business owners and next to the status for clients. Read-only.
function describeReservation(row, now = Date.now()) {
  const currency = row.currency || "PEN";
  const total = Number(row.total_amount) || 0;
  const paid = Number(row.amount_paid) || 0;
  const due = Math.max(0, Math.round((total - paid) * 100) / 100);
  const note = row.status_reason || null;

  switch (row.status) {
    case "PENDING_PAYMENT": {
      const deadline = Date.parse(row.payment_expires_at || "");
      if (Number.isFinite(deadline) && deadline > now) {
        const minutes = Math.max(1, Math.ceil((deadline - now) / 60000));
        return { code: "AWAITING_PAYMENT", tone: "warning", label: "Purchase not completed", detail: `Waiting for the online payment · window closes in ${minutes} min` };
      }
      return { code: "PAYMENT_WINDOW_CLOSED", tone: "danger", label: "Not paid in time", detail: "The 5-minute payment window closed; the slot is being released" };
    }
    case "EXPIRED":
      return { code: "EXPIRED_UNPAID", tone: "danger", label: "Not paid", detail: note || "Payment not completed before the payment window closed" };
    case "PAYMENT_FAILED":
      return { code: "PAYMENT_FAILED", tone: "danger", label: "Payment failed", detail: note || "The simulated payment did not go through" };
    case "CANCELLED": {
      const who = by(row.status_changed_by);
      return {
        code: row.status_changed_by === "CLIENT" ? "CANCELLED_BY_CLIENT" : row.status_changed_by ? "CANCELLED_BY_BUSINESS" : "CANCELLED",
        tone: "muted",
        label: who ? `Cancelled by ${who}` : "Cancelled",
        detail: note || "No reason was given"
      };
    }
    case "NO_SHOW":
      return { code: "NO_SHOW", tone: "danger", label: "Client did not attend", detail: note || "Marked as no-show by the business" };
    case "COMPLETED":
      return {
        code: "COMPLETED",
        tone: "success",
        label: "Service completed",
        detail: due > 0 && row.payment_plan === "DEPOSIT" ? `${amount(due, currency)} balance still pending` : note || "Attended and fully paid"
      };
    case "CONFIRMED":
      if (row.payment_plan === "FULL") {
        return { code: "PAID_IN_FULL_ONLINE", tone: "success", label: "Paid 100% online", detail: `${amount(total, currency)} paid on BOOKIFY` };
      }
      if (row.payment_plan === "DEPOSIT" && due <= 0) {
        return row.balance_paid_via === "IN_STORE"
          ? { code: "BALANCE_PAID_IN_STORE", tone: "success", label: "Paid in full", detail: "50% online + 50% paid at the business" }
          : { code: "BALANCE_PAID_ONLINE", tone: "success", label: "Paid in full", detail: "50% deposit + balance paid online" };
      }
      if (row.payment_plan === "DEPOSIT") {
        return { code: "BALANCE_DUE_IN_STORE", tone: "info", label: "50% paid online", detail: `${amount(due, currency)} to collect at the business (or online)` };
      }
      return { code: "CONFIRMED", tone: "success", label: "Confirmed", detail: note || "Confirmed booking" };
    default:
      return { code: row.status || "UNKNOWN", tone: "muted", label: String(row.status || "Unknown").replace(/_/g, " ").toLowerCase(), detail: note || "" };
  }
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
        business_name: businesses.get(String(row.business_id)) || null,
        reason: describeReservation(row)
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

    return list.map((row) => ({ ...row, reason: describeReservation(row) }));
  }
}

module.exports = {
  attachReservationDetails,
  describeReservation
};
