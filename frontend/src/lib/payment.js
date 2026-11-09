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
