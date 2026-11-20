// Values displayed before creating a booking are estimates only.
// Checkout always uses the amounts persisted in PostgreSQL by the backend.
export function estimatedHalf(price) {
  const total = Number(price);
  if (!Number.isFinite(total) || total < 0) return null;
  return Math.round((total * 0.5 + Number.EPSILON) * 100) / 100;
}
export function canDemoPay(reservation, timestamp = Date.now()) {
  if (!reservation || reservation.status !== 'PENDING_PAYMENT') return false;
  const deadline = Date.parse(reservation.payment_expires_at || '');
  return Number.isFinite(deadline) && deadline > timestamp;
}

// Remaining amount of a confirmed booking (0 when paid in full).
export function balanceDue(reservation) {
  if (!reservation) return 0;
  const total = Number(reservation.total_amount);
  const paid = Number(reservation.amount_paid);
  if (!Number.isFinite(total)) return 0;
  const due = total - (Number.isFinite(paid) ? paid : 0);
  return due > 0.004 ? Math.round(due * 100) / 100 : 0;
}

// A confirmed 50% deposit booking whose balance can still be paid online.
export function canPayBalance(reservation, timestamp = Date.now()) {
  if (!reservation || reservation.status !== 'CONFIRMED' || reservation.payment_plan !== 'DEPOSIT') return false;
  const ends = Date.parse(reservation.ends_at || '');
  return balanceDue(reservation) > 0 && (!Number.isFinite(ends) || ends > timestamp);
}
