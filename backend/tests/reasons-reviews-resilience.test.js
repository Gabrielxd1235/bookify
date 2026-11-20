const test = require("node:test");
const assert = require("node:assert/strict");

process.env.SUPABASE_URL = process.env.SUPABASE_URL || "http://localhost:54321";
process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY || "test-key";

const { describeReservation } = require("../src/utils/reservation-details.utils");
const { publicName } = require("../src/controllers/review.controller");
const { classifyError } = require("../src/middlewares/resilience.middleware");

const base = { total_amount: "80.00", deposit_amount: "40.00", balance_amount: "40.00", currency: "PEN" };

test("reason: pending payment inside and outside the 5-minute window", () => {
  const now = Date.parse("2026-11-20T10:00:00Z");
  const open = describeReservation({ ...base, status: "PENDING_PAYMENT", payment_expires_at: "2026-11-20T10:04:00Z" }, now);
  assert.equal(open.code, "AWAITING_PAYMENT");
  assert.match(open.detail, /4 min/);
  const closed = describeReservation({ ...base, status: "PENDING_PAYMENT", payment_expires_at: "2026-11-20T09:59:00Z" }, now);
  assert.equal(closed.code, "PAYMENT_WINDOW_CLOSED");
});

test("reason: deposit, full payment and balance paths", () => {
  assert.equal(describeReservation({ ...base, status: "CONFIRMED", payment_plan: "DEPOSIT", amount_paid: "40.00" }).code, "BALANCE_DUE_IN_STORE");
  assert.match(describeReservation({ ...base, status: "CONFIRMED", payment_plan: "DEPOSIT", amount_paid: "40.00" }).detail, /S\/ 40\.00/);
  assert.equal(describeReservation({ ...base, status: "CONFIRMED", payment_plan: "FULL", amount_paid: "80.00" }).code, "PAID_IN_FULL_ONLINE");
  assert.equal(describeReservation({ ...base, status: "CONFIRMED", payment_plan: "DEPOSIT", amount_paid: "80.00", balance_paid_via: "IN_STORE" }).code, "BALANCE_PAID_IN_STORE");
  assert.equal(describeReservation({ ...base, status: "CONFIRMED", payment_plan: "DEPOSIT", amount_paid: "80.00", balance_paid_via: "ONLINE" }).code, "BALANCE_PAID_ONLINE");
});

test("reason: cancellations, expiry and no-show keep the written reason", () => {
  const byClient = describeReservation({ ...base, status: "CANCELLED", status_changed_by: "CLIENT", status_reason: "Viajo ese día" });
  assert.equal(byClient.code, "CANCELLED_BY_CLIENT");
  assert.equal(byClient.detail, "Viajo ese día");
  assert.equal(describeReservation({ ...base, status: "CANCELLED", status_changed_by: "BUSINESS", status_reason: "Local cerrado" }).label, "Cancelled by the business");
  assert.equal(describeReservation({ ...base, status: "EXPIRED" }).code, "EXPIRED_UNPAID");
  assert.equal(describeReservation({ ...base, status: "NO_SHOW" }).code, "NO_SHOW");
});

test("reviews show first name and last initial only", () => {
  assert.equal(publicName("Lucía Fernández García"), "Lucía G.");
  assert.equal(publicName("Renzo"), "Renzo");
  assert.equal(publicName("   "), "BOOKIFY user");
});

test("infrastructure errors become 503 with a reason", () => {
  assert.equal(classifyError(new TypeError("fetch failed")).reason, "DATABASE_UNAVAILABLE");
  assert.equal(classifyError({ name: "AbortError", message: "This operation was aborted" }).reason, "DATABASE_TIMEOUT");
  assert.equal(classifyError({ code: "57014", message: "canceling statement due to statement timeout" }).status, 503);
  assert.equal(classifyError(new Error("Cannot read properties of undefined")), null);
});
