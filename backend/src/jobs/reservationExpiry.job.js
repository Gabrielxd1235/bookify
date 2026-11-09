const supabase = require("../config/supabase");

// Track the background job state
let started = false;
let running = false;

// Expire reservations that have not been paid
async function expireReservations() {
  if (running) {
    return;
  }

  running = true;

  try {
    const { data, error } = await supabase.rpc(
      "expire_pending_reservations"
    );

    if (error) {
      throw error;
    }

    if (data > 0) {
      console.log(
        `[Reservation Expiry] Expired reservations: ${data}`
      );
    }

  } catch (error) {
    console.error(
      "[Reservation Expiry] Job failed:",
      error.message
    );

  } finally {
    running = false;
  }
}

// Start the automatic reservation expiration job
function startReservationExpiryJob() {
  if (started) {
    return;
  }

  started = true;

  // Check expired reservations on startup
  expireReservations();

  // Check expired reservations every minute
  const timer = setInterval(
    expireReservations,
    60 * 1000
  );

  timer.unref();

  console.log(
    "[Reservation Expiry] Background job started"
  );
}

module.exports = {
  expireReservations,
  startReservationExpiryJob
};