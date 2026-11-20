"use strict";
const supabase = require("../config/supabase");

// Demo payment options (no real money, no card data):
//   DEPOSIT  - pay 50 % online now, the other 50 % at the business
//   FULL     - pay 100 % online now
//   BALANCE  - after a DEPOSIT, pay the remaining 50 % online
const PLANS = new Set(["DEPOSIT", "FULL"]);

function allowedInThisEnvironment() {
  return (
    process.env.PAYMENT_MODE === "MOCK" &&
    String(process.env.ENABLE_MOCK_PAYMENTS)
      .trim()
      .toLowerCase() === "true"
  );
}

const ERROR_STATUS = { P0002: 404, "42501": 403, "22023": 400, P0001: 409, "23514": 409, "23505": 409 };

async function runPayment(req, res, plan) {
  if (!allowedInThisEnvironment()) {
    return res.status(403).json({ success: false, message: "Demo payments are disabled in this environment" });
  }

  const id = Number(req.params.reservationId);
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, message: "Invalid reservation ID or user session" });
  }

  try {
    const { data, error } = await supabase.rpc("bookify_pay_mock", {
      p_reservation_id: id,
      p_user_id: userId,
      p_plan: plan
    });

    if (error) {
      const status = ERROR_STATUS[error.code] || 500;
      if (status === 500) console.error("Mock checkout database error:", error.code, error.message);
      return res.status(status).json({ success: false, message: status === 500 ? "Unable to complete demo payment" : error.message });
    }

    if (!data?.success || data?.reservation?.status !== "CONFIRMED" || data?.payment?.status !== "SUCCEEDED") {
      return res.status(500).json({ success: false, message: "Backend did not confirm the reservation" });
    }

    console.info("Demo payment completed", { reservationId: id, plan, alreadyPaid: data.already_paid });
    return res.status(200).json(data);

  } catch (error) {
    console.error("Mock checkout error:", error.message);
    return res.status(500).json({ success: false, message: "Demo checkout failed" });
  }
}

// POST /api/mock-checkout/reservations/:reservationId/pay   body: { plan }
// The server decides the amount; only the plan (DEPOSIT or FULL) is accepted.
async function payDeposit(req, res) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const keys = Object.keys(body);

  if (keys.some((key) => key !== "plan")) {
    return res.status(400).json({ success: false, message: "Payment amount is determined by the server; send only the payment option" });
  }

  const plan = body.plan === undefined ? "DEPOSIT" : String(body.plan).toUpperCase();
  if (!PLANS.has(plan)) {
    return res.status(400).json({ success: false, message: "Payment option must be DEPOSIT (50%) or FULL (100%)" });
  }

  return runPayment(req, res, plan);
}

// POST /api/mock-checkout/reservations/:reservationId/pay-balance
async function payBalance(req, res) {
  if (req.body && Object.keys(req.body).length > 0) {
    return res.status(400).json({ success: false, message: "Payment amount is determined by the server; do not submit amounts" });
  }
  return runPayment(req, res, "BALANCE");
}

module.exports = { payDeposit, payBalance, allowedInThisEnvironment };
