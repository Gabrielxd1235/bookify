const supabase = require("../config/supabase");

// Validate positive integer IDs
function isValidId(value) {
  return (
    value !== null &&
    value !== undefined &&
    /^[1-9]\d*$/.test(String(value))
  );
}

// Map known PostgreSQL errors to HTTP responses
function handlePaymentError(res, error) {
  console.error("Payment operation failed:", {
    code: error.code,
    message: error.message
  });

  const statusCodes = {
    B4001: 400,
    B4040: 404,
    B4090: 409
  };

  const status = statusCodes[error.code] || 500;

  return res.status(status).json({
    success: false,
    message:
      status === 500
        ? "Payment processing failed"
        : error.message
  });
}

// Start a simulated payment
// POST /api/payments/mock/start
async function startMockPayment(req, res) {
  const { reservation_id, method } = req.body || {};

  if (!isValidId(reservation_id)) {
    return res.status(400).json({
      success: false,
      message: "A valid reservation ID is required"
    });
  }

  if (
    typeof method !== "string" ||
    !["YAPE", "PLIN", "CARD"].includes(method)
  ) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment method"
    });
  }

  try {
    const { data, error } = await supabase.rpc(
      "start_mock_payment",
      {
        p_reservation_id: Number(reservation_id),
        p_client_id: req.user.id,
        p_method: method
      }
    );

    if (error) {
      return handlePaymentError(res, error);
    }

    return res.status(201).json({
      success: true,
      message: "Simulated payment initiated successfully",
      simulation: true,
      payment: {
        id: data.id,
        reservation_id: data.reservation_id,
        method: data.method,
        amount: data.amount,
        currency: data.currency,
        status: data.status,
        is_simulated: data.is_simulated
      }
    });

  } catch (error) {
    return handlePaymentError(res, error);
  }
}

// Complete a simulated payment
// POST /api/payments/mock/complete
async function completeMockPayment(req, res) {
  const { payment_id, result } = req.body || {};

  if (!isValidId(payment_id)) {
    return res.status(400).json({
      success: false,
      message: "A valid payment ID is required"
    });
  }

  if (!["SUCCEEDED", "FAILED"].includes(result)) {
    return res.status(400).json({
      success: false,
      message: "Invalid simulated payment result"
    });
  }

  try {
    const { data, error } = await supabase.rpc(
      "complete_mock_payment",
      {
        p_payment_id: Number(payment_id),
        p_client_id: req.user.id,
        p_result: result
      }
    );

    if (error) {
      return handlePaymentError(res, error);
    }

    return res.status(200).json({
      success: true,
      message:
        result === "SUCCEEDED"
          ? "Simulated payment completed successfully"
          : "Simulated payment failed",
      simulation: true,
      payment: data.payment,
      reservation: data.reservation
    });

  } catch (error) {
    return handlePaymentError(res, error);
  }
}

// GET /api/payments/mock/:id
async function getMockPaymentById(req, res) {
  const { id } = req.params;

  if (!isValidId(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payment ID"
    });
  }

  try {
    const { data: payment, error } = await supabase
      .from("payments")
      .select(
        "id, reservation_id, provider, method, amount, currency, status, is_simulated, created_at"
      )
      .eq("id", id)
      .eq("provider", "MOCK")
      .eq("is_simulated", true)
      .maybeSingle();

    if (error) {
      return handlePaymentError(res, error);
    }

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Simulated payment not found"
      });
    }

    // Prevent access to another client's payment
    const { data: reservation, error: reservationError } =
      await supabase
        .from("reservations")
        .select("id, user_id, status")
        .eq("id", payment.reservation_id)
        .eq("user_id", req.user.id)
        .maybeSingle();

    if (reservationError) {
      return handlePaymentError(res, reservationError);
    }

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: "Simulated payment not found"
      });
    }

    return res.status(200).json({
      success: true,
      simulation: true,
      payment,
      reservation_status: reservation.status
    });

  } catch (error) {
    return handlePaymentError(res, error);
  }
}

module.exports = {
  startMockPayment,
  completeMockPayment,
  getMockPaymentById
};