"use strict";
const supabase = require("../config/supabase");

function allowedInThisEnvironment() {
  return process.env.NODE_ENV !== "production" &&
    process.env.PAYMENT_MODE === "MOCK" &&
    String(process.env.ENABLE_MOCK_PAYMENTS).toLowerCase() === "true";
}

async function payDeposit(req, res) {
  if (!allowedInThisEnvironment()) {
    return res.status(403).json({ success: false, message: "Demo payments are disabled in this environment" });
  }
  const id = Number(req.params.reservationId);
  const userId = Number(req.user?.id);
  if (!Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(userId) || userId < 1) {
    return res.status(400).json({ success: false, message: "Invalid reservation ID or user session" });
  }
  if (req.body && Object.keys(req.body).length > 0) {
    return res.status(400).json({ success: false, message: "Payment amount is determined by the server; do not submit card details or amounts" });
  }
  try {
    const { data, error } = await supabase.rpc("bookify_complete_mock_deposit", {
      p_reservation_id: id,
      p_user_id: userId
    });
    if (error) {
      const status = ({ P0002: 404, "42501": 403, "22023": 400, P0001: 409, "23514": 409 })[error.code] || 500;
      if (status === 500) console.error("Mock checkout database error:", error.code, error.message);
      return res.status(status).json({ success: false, message: status === 500 ? "Unable to complete demo payment" : error.message });
    }
    if (!data?.success || data?.reservation?.status !== "CONFIRMED" || data?.payment?.status !== "SUCCEEDED") {
      return res.status(500).json({ success: false, message: "Backend did not confirm the reservation" });
    }
    return res.status(200).json(data);
  } catch (error) {
    console.error("Mock checkout error:", error.message);
    return res.status(500).json({ success: false, message: "Demo checkout failed" });
  }
}
module.exports = { payDeposit, allowedInThisEnvironment };
