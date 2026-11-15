// How a business can sell a service. The backend and database enforce the same list.
export const SERVICE_MODELS = Object.freeze([
  {
    type: 'APPOINTMENT',
    icon: 'clock',
    label: 'Appointment',
    tagline: 'A time slot with a fixed duration',
    example: 'Haircut, facial, massage',
    priceLabel: 'Price per appointment',
  },
  {
    type: 'SUBSCRIPTION',
    icon: 'refresh',
    label: 'Subscription',
    tagline: 'A membership billed every period',
    example: 'Gym membership, monthly plan',
    priceLabel: 'Price per period',
  },
  {
    type: 'PACKAGE',
    icon: 'tag',
    label: 'Session package',
    tagline: 'Several sessions bought together',
    example: '10 classes, 5 massages',
    priceLabel: 'Price of the whole package',
  },
  {
    type: 'DAY_PASS',
    icon: 'sun',
    label: 'Day pass',
    tagline: 'Access for one full day',
    example: 'Spa day, gym drop-in',
    priceLabel: 'Price per day',
  },
]);

export const BILLING_PERIODS = Object.freeze([
  {value: 'WEEK', label: 'Weekly', unit: 'week', adverb: 'every week'},
  {value: 'MONTH', label: 'Monthly', unit: 'month', adverb: 'every month'},
  {value: 'QUARTER', label: 'Quarterly', unit: '3 months', adverb: 'every 3 months'},
  {value: 'YEAR', label: 'Yearly', unit: 'year', adverb: 'every year'},
]);

const byType = Object.fromEntries(SERVICE_MODELS.map(model => [model.type, model]));
const byPeriod = Object.fromEntries(BILLING_PERIODS.map(period => [period.value, period]));

export const serviceModel = type => byType[type] || byType.APPOINTMENT;
export const billingPeriod = value => byPeriod[value] || byPeriod.MONTH;
export const isAppointment = service => (service?.service_type || service?.kind || 'APPOINTMENT') === 'APPOINTMENT';

/** The model most businesses of a category sell first. Owners can always pick another one. */
export function recommendedModel(categoryName = '') {
  const name = String(categoryName).toLowerCase();
  if (/gym|gimnas|fitness|crossfit|yoga|pilates|danc|baile/.test(name)) return 'SUBSCRIPTION';
  return 'APPOINTMENT';
}

const plural = (count, word) => `${count} ${word}${Number(count) === 1 ? '' : 's'}`;

/** Short unit shown next to a price: "/ month", "· 45 min", "· 10 sessions". */
export function priceUnit(service) {
  switch (service?.service_type) {
    case 'SUBSCRIPTION': return `/ ${billingPeriod(service.billing_period).unit}`;
    case 'PACKAGE': return `· ${plural(service.sessions_included || 1, 'session')}`;
    case 'DAY_PASS': return '/ day';
    default: return '';
  }
}

/** One line describing what the client gets. */
export function describeService(service) {
  switch (service?.service_type) {
    case 'SUBSCRIPTION': return `${billingPeriod(service.billing_period).label} membership · renews ${billingPeriod(service.billing_period).adverb}`;
    case 'PACKAGE': return `${plural(service.sessions_included || 1, 'session')} · valid ${plural(service.validity_days || 90, 'day')}`;
    case 'DAY_PASS': return 'Full-day access on the date you choose';
    default: return `${service?.duration_minutes ?? '—'} min appointment`;
  }
}

/** Label for a purchased reservation: "Monthly membership", "10-session package", "Day pass". */
export function reservationKindLabel(reservation) {
  switch (reservation?.kind) {
    case 'SUBSCRIPTION': return `${billingPeriod(reservation.billing_period).label} membership`;
    case 'PACKAGE': return reservation.sessions_included ? `${reservation.sessions_included}-session package` : 'Session package';
    case 'DAY_PASS': return 'Day pass';
    default: return 'Appointment';
  }
}

/** A confirmed plan (anything that is not an appointment) that has not run out yet. */
export const isActivePlan = (reservation, now = Date.now()) =>
  !isAppointment(reservation) && reservation.status === 'CONFIRMED' && new Date(reservation.ends_at).getTime() > now;

const dateOnly = value => new Intl.DateTimeFormat('en-US', {timeZone: 'America/Lima', dateStyle: 'medium'}).format(new Date(value));
const dateAndTime = value => new Intl.DateTimeFormat('en-US', {timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short'}).format(new Date(value));

/** When a reservation happens: a date and time for appointments, a date range for plans. */
export function reservationWhen(reservation) {
  if (!reservation?.starts_at) return '—';
  if (isAppointment(reservation)) return dateAndTime(reservation.starts_at);
  if (reservation.kind === 'DAY_PASS' || !reservation.ends_at) return dateOnly(reservation.starts_at);
  return `${dateOnly(reservation.starts_at)} → ${dateOnly(reservation.ends_at)}`;
}
