import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { canDemoPay } from '../lib/payment.js';
import { dateTime, money } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { Link } from '../lib/router.jsx';
import { Icon } from '../components/Icon.jsx';
import { Alert, Button, Card, Empty, Loading, PageHead, Status } from '../components/UI.jsx';

const isConfirmed = status => status === 'CONFIRMED';
const isPending = status => status === 'PENDING_PAYMENT';

export function Checkout({ id }) {
  const [reservation, setReservation] = useState(null);
  const [payment, setPayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const toast = useToast();

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError('');
    api(`/api/reservations/${id}`).then(result => {
      if (alive) setReservation(result.reservation || null);
    }).catch(err => {
      if (alive) setError(err.message);
    }).finally(() => {
      if (alive) setLoading(false);
    });
    return () => { alive = false; };
  }, [id]);
  useEffect(() => {
    if (!isPending(reservation?.status)) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [reservation?.status]);

  const expired = !canDemoPay(reservation, now);
  const millisecondsLeft = reservation?.payment_expires_at
    ? Math.max(0, new Date(reservation.payment_expires_at).getTime() - now) : 0;
  const remaining = `${Math.floor(millisecondsLeft / 60000)}:${String(Math.floor(millisecondsLeft / 1000) % 60).padStart(2, '0')}`;
  const currency = reservation?.currency || 'PEN';
  const payNow = async () => {
    if (!reservation || !isPending(reservation.status) || busy || expired) return;
    setBusy(true);
    setError('');
    try {
      // The backend determines the amount from the stored reservation.
      // No card number, amount, success flag or user ID is sent by React.
      const result = await api(`/api/mock-checkout/reservations/${reservation.id}/pay`, { method: 'POST' });
      if (result?.reservation?.status !== 'CONFIRMED' || result?.payment?.status !== 'SUCCEEDED') {
        throw Error('The backend did not confirm the deposit. Your booking is still pending.');
      }
      // Read back the authoritative state, rather than relying on a local success flag.
      const latest = await api(`/api/reservations/${reservation.id}`);
      if (latest?.reservation?.status !== 'CONFIRMED') {
        throw Error('The deposit was processed but the booking confirmation could not be verified. Refresh your bookings.');
      }
      setReservation(latest.reservation);
      setPayment(result.payment);
      toast('Demo deposit completed. Your booking is confirmed!', 'success');
    } catch (err) {
      setError(err.message);
      // A request may have succeeded but the connection dropped. Re-read before any retry.
      try {
        const refreshed = await api(`/api/reservations/${reservation.id}`);
        if (refreshed?.reservation) setReservation(refreshed.reservation);
      } catch { /* Preserve the original actionable error. */ }
    } finally {
      setBusy(false);
    }
  };

  return <div className="checkout-page">
    <PageHead eyebrow="SECURE DEMO CHECKOUT" title="Confirm your booking" description="Pay the 50% simulated deposit to activate your appointment. No real money will be charged." action={<Link to="/bookings" className="btn btn-outline"><Icon name="arrow-left" size={17}/>My bookings</Link>}/>
    {loading ? <Loading label="Loading your booking..." /> : !reservation ? <Card><Alert message={error}/><Empty icon="calendar" title="Booking unavailable" description="This reservation may not exist or may belong to another account." action={<Link to="/bookings" className="btn btn-primary">Return to bookings</Link>}/></Card> : <div className="checkout-grid">
      <Card title="Booking summary" subtitle="The payment amount is calculated by BOOKIFY's backend.">
        <div className="checkout-banner"><span className="checkout-banner-icon"><Icon name="calendar-check" size={27}/></span><div><strong>Reservation #{reservation.id}</strong><p>{dateTime(reservation.starts_at)}</p></div><Status value={reservation.status}/></div>
        <div className="checkout-rows">
          <div><span>Service</span><strong>Service #{reservation.service_id}</strong></div>
          <div><span>Appointment</span><strong>{dateTime(reservation.starts_at)}</strong></div>
          <div><span>Full service price</span><strong>{money(reservation.total_amount, currency)}</strong></div>
          <div className="checkout-amount"><span>Deposit — 50% due now</span><strong>{money(reservation.deposit_amount, currency)}</strong></div>
          <div><span>Balance to pay at the business</span><strong>{money(reservation.balance_amount, currency)}</strong></div>
        </div>
        <p className="notice-line"><Icon name="info" size={16}/>The remaining 50% is not charged by this demo. Coordinate the balance directly with the establishment.</p>
      </Card>
      <Card title={isConfirmed(reservation.status) ? 'Payment completed' : 'Simulated deposit'} subtitle="BOOKIFY Academic Demo · No financial information required">
        {isConfirmed(reservation.status) ? <div className="checkout-complete" role="status"><span><Icon name="check" size={32}/></span><h2>Your appointment is confirmed!</h2><p>The backend reports this reservation as <strong>CONFIRMED</strong>.</p>{payment?.id && <p className="muted">Demo receipt #{payment.id} · {money(payment.amount, payment.currency || currency)}</p>}<Link className="btn btn-primary wide" to="/bookings">View my confirmed bookings <Icon name="arrow" size={16}/></Link></div> : isPending(reservation.status) ? <>
          <div className="checkout-demo"><Icon name="credit" size={27}/><div><strong>Demo payment only</strong><p>Press the button below to simulate your exact 50% deposit. Do not enter any card information.</p></div></div>
          <div className="checkout-due"><span>Simulated payment amount</span><strong>{money(reservation.deposit_amount, currency)}</strong></div>
          <div className={`checkout-timer ${expired ? 'checkout-timer-expired' : ''}`}><Icon name="clock" size={17}/>{expired ? 'The payment deadline has passed.' : `Payment window: ${remaining} remaining`}</div>
          <Alert message={error}/>
          <Button className="wide" icon="credit" busy={busy} disabled={expired} onClick={payNow}>Pay 50% (Demo) & confirm booking</Button>
          <p className="checkout-warning"><Icon name="shield" size={16}/>Your booking stays <strong>PENDING_PAYMENT</strong> until the server confirms the deposit.</p>
          {expired && <p className="muted">Choose another available time to create a new booking. An expired reservation cannot be paid.</p>}
        </> : <><Alert type="info" message={`This reservation has status ${reservation.status}. Demo payment is only available for pending-payment bookings.`}/><Link className="btn btn-outline wide" to="/bookings">Return to my bookings</Link></>}
      </Card>
    </div>}
  </div>;
}
