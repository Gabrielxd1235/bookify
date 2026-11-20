import React, { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { balanceDue, canDemoPay, canPayBalance } from '../lib/payment.js';
import { dateTime, money } from '../lib/format.js';
import { useToast } from '../context/ToastContext.jsx';
import { Link } from '../lib/router.jsx';
import { useReservationNames } from '../lib/reservationNames.js';
import { isAppointment, reservationKindLabel, reservationWhen } from '../lib/serviceModels.js';
import { Icon } from '../components/Icon.jsx';
import { Alert, Button, Card, Empty, Loading, PageHead, Status } from '../components/UI.jsx';

const isConfirmed = status => status === 'CONFIRMED';
const isPending = status => status === 'PENDING_PAYMENT';

const PLANS = [
  { id: 'DEPOSIT', icon: 'store', title: 'Pay 50% now', note: 'The other 50% at the business, or online later' },
  { id: 'FULL', icon: 'credit', title: 'Pay 100% online', note: 'Nothing left to pay at the business' }
];

function paidSummary(reservation, currency) {
  const due = balanceDue(reservation);
  if (reservation.payment_plan === 'FULL') return `Paid in full online · ${money(reservation.total_amount, currency)}`;
  if (due <= 0) return reservation.balance_paid_via === 'IN_STORE' ? '50% online + 50% at the business' : '50% deposit + balance paid online';
  return `${money(reservation.amount_paid, currency)} paid · ${money(due, currency)} due at the business`;
}

export function Checkout({ id }) {
  const [reservation, setReservation] = useState(null);
  const [payment, setPayment] = useState(null);
  const [plan, setPlan] = useState('DEPOSIT');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const toast = useToast();
  const names = useReservationNames(reservation);

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
  const dueNow = plan === 'FULL' ? reservation?.total_amount : reservation?.deposit_amount;
  const due = balanceDue(reservation);

  // Read back the authoritative state after any payment attempt
  async function refresh() {
    const latest = await api(`/api/reservations/${reservation.id}`);
    if (latest?.reservation) setReservation(latest.reservation);
    return latest?.reservation;
  }

  async function pay(path, body, success) {
    if (!reservation || busy) return;
    setBusy(true);
    setError('');
    try {
      // The backend determines the amount; only the payment option is sent.
      const result = await api(`/api/mock-checkout/reservations/${reservation.id}/${path}`, { method: 'POST', body });
      if (result?.reservation?.status !== 'CONFIRMED' || result?.payment?.status !== 'SUCCEEDED') {
        throw Error('The backend did not confirm the payment. Your booking was not changed.');
      }
      const latest = await refresh();
      if (latest?.status !== 'CONFIRMED') {
        throw Error('The payment was processed but the booking could not be verified. Refresh your bookings.');
      }
      setPayment(result.payment);
      toast(success, 'success');
    } catch (err) {
      setError(err.message);
      try { await refresh(); } catch { /* keep the original error */ }
    } finally {
      setBusy(false);
    }
  }

  const payNow = () => {
    if (!isPending(reservation?.status) || expired) return;
    pay('pay', { plan }, plan === 'FULL' ? 'Paid in full. Your booking is confirmed!' : 'Deposit paid. Your booking is confirmed!');
  };
  const payBalance = () => pay('pay-balance', undefined, 'Balance paid. Nothing left to pay at the business.');

  return <div className="checkout-page">
    <PageHead eyebrow="SECURE DEMO CHECKOUT" title="Confirm your booking" description="Choose how to pay. Simulated payments only: no real money is charged." action={<Link to="/bookings" className="btn btn-outline"><Icon name="arrow-left" size={17}/>My bookings</Link>}/>
    {loading ? <Loading label="Loading your booking..." /> : !reservation ? <Card><Alert message={error}/><Empty icon="calendar" title="Booking unavailable" description="This reservation may not exist or may belong to another account." action={<Link to="/bookings" className="btn btn-primary">Return to bookings</Link>}/></Card> : <div className="checkout-grid">
      <Card title="Booking summary" subtitle="Amounts are calculated by BOOKIFY's backend.">
        <div className="checkout-banner"><span className="checkout-banner-icon"><Icon name="calendar-check" size={27}/></span><div><strong>Reservation #{reservation.id}</strong><p>{dateTime(reservation.starts_at)}</p></div><Status value={reservation.status}/></div>
        <div className="checkout-rows">
          <div><span>Service</span><strong>{names.serviceName(reservation.service_id)}</strong></div>
          <div><span>Business</span><strong>{names.businessName(reservation.business_id)}</strong></div>
          {isAppointment(reservation) ? <div><span>Appointment</span><strong>{dateTime(reservation.starts_at)}</strong></div> : <><div><span>Plan</span><strong>{reservationKindLabel(reservation)}</strong></div><div><span>Valid</span><strong>{reservationWhen(reservation)}</strong></div></>}
          {Number(reservation.discount_percent) > 0 ? <>
            <div><span>Regular price</span><strong className="price-struck">{money(reservation.original_amount, currency)}</strong></div>
            <div className="checkout-discount"><span><Icon name="tag" size={14}/> Welcome offer −{reservation.discount_percent}%</span><strong>−{money(Number(reservation.original_amount) - Number(reservation.total_amount), currency)}</strong></div>
            <div><span>Your price</span><strong>{money(reservation.total_amount, currency)}</strong></div>
          </> : <div><span>Full service price</span><strong>{money(reservation.total_amount, currency)}</strong></div>}
          {isPending(reservation.status)
            ? <div className="checkout-amount"><span>{plan === 'FULL' ? 'Due now — 100%' : 'Due now — 50%'}</span><strong>{money(dueNow, currency)}</strong></div>
            : <div className="checkout-amount"><span>Paid on BOOKIFY</span><strong>{money(reservation.amount_paid, currency)}</strong></div>}
          <div><span>{isPending(reservation.status) ? 'Left to pay at the business' : 'Balance'}</span><strong>{isPending(reservation.status) ? money(plan === 'FULL' ? 0 : reservation.balance_amount, currency) : due > 0 ? money(due, currency) : 'Paid'}</strong></div>
        </div>
        {reservation.reason && !isPending(reservation.status) && <p className={`notice-line reason-${reservation.reason.tone}`}><Icon name="info" size={16}/><strong>{reservation.reason.label}.</strong>&nbsp;{reservation.reason.detail}</p>}
      </Card>

      <Card title={isConfirmed(reservation.status) ? 'Payment completed' : 'Simulated payment'} subtitle="BOOKIFY Academic Demo · No financial information required">
        {isConfirmed(reservation.status) ? <div className="checkout-complete" role="status">
          <span><Icon name="check" size={32}/></span>
          <h2>Your booking is confirmed!</h2>
          <p>{paidSummary(reservation, currency)}</p>
          {payment?.id && <p className="muted">Demo receipt #{payment.id} · {money(payment.amount, payment.currency || currency)}</p>}
          {canPayBalance(reservation, now) && <div className="balance-box">
            <div><strong>Pay the remaining {money(due, currency)} online?</strong><small>Optional: otherwise pay it at the business on the day of your appointment.</small></div>
            <Alert message={error}/>
            <Button className="wide" icon="credit" busy={busy} onClick={payBalance}>Pay balance online (Demo)</Button>
          </div>}
          <Link className="btn btn-primary wide" to="/bookings">View my bookings <Icon name="arrow" size={16}/></Link>
        </div> : isPending(reservation.status) ? <>
          <div className="pay-options" role="radiogroup" aria-label="Payment option">
            {PLANS.map(option => {
              const amount = option.id === 'FULL' ? reservation.total_amount : reservation.deposit_amount;
              return <button type="button" key={option.id} role="radio" aria-checked={plan === option.id} className={`pay-option ${plan === option.id ? 'active' : ''}`} disabled={busy || expired} onClick={() => setPlan(option.id)}>
                <span className="pay-option-icon"><Icon name={option.icon} size={20}/></span>
                <span className="pay-option-text"><strong>{option.title}</strong><small>{option.note}</small></span>
                <span className="pay-option-amount">{money(amount, currency)}</span>
              </button>;
            })}
          </div>
          <div className={`checkout-timer ${expired ? 'checkout-timer-expired' : millisecondsLeft < 60000 ? 'checkout-timer-urgent' : ''}`} role="timer"><Icon name="clock" size={17}/>{expired ? 'The 5-minute payment window has closed.' : `Payment window: ${remaining} remaining`}</div>
          <Alert message={error}/>
          <Button className="wide" icon="credit" busy={busy} disabled={expired} onClick={payNow}>{plan === 'FULL' ? `Pay ${money(reservation.total_amount, currency)} (Demo) & confirm` : `Pay 50% · ${money(reservation.deposit_amount, currency)} (Demo) & confirm`}</Button>
          <p className="checkout-warning"><Icon name="shield" size={16}/>Your booking stays <strong>PENDING_PAYMENT</strong> until the server confirms the payment. Do not enter card details.</p>
          {expired && <p className="muted">Choose another available time to create a new booking. An expired reservation cannot be paid.</p>}
        </> : <><Alert type="info" message={reservation.reason ? `${reservation.reason.label}: ${reservation.reason.detail}` : `This reservation has status ${reservation.status}.`}/><Link className="btn btn-outline wide" to="/bookings">Return to my bookings</Link></>}
      </Card>
    </div>}
  </div>;
}
