import { useEffect, useState } from 'react';
import { api } from './api.js';

// Welcome offer: 25% off the first booking or purchase. The database applies
// it when the reservation is created; this only displays it.
export const WELCOME_PERCENT = 25;

export function discounted(price, percent = WELCOME_PERCENT) {
  const value = Number(price);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * (100 - percent)) / 100;
}

// Last answer per user, so changing page or tab does not ask (and flash) again
const cache = new Map();
export function forgetWelcomeOffer() { cache.clear(); }

/**
 * Offer state for the current visitor:
 *   'loading'  - session or eligibility not known yet: show nothing
 *   'guest'    - signed out: the offer can be advertised
 *   { eligible, percent } - signed-in client or owner
 *   null       - admin, or the check failed: show nothing
 */
export function useWelcomeOffer(user, authLoading = false) {
  const canBook = user && (user.role === 'CLIENT' || user.role === 'BUSINESS_OWNER');
  const key = canBook ? String(user.id) : null;
  const [offer, setOffer] = useState(() => (authLoading ? 'loading' : !user ? 'guest' : key && cache.has(key) ? cache.get(key) : canBook ? 'loading' : null));

  useEffect(() => {
    let live = true;
    if (authLoading) { setOffer('loading'); return undefined; }
    if (!user) { setOffer('guest'); return undefined; }
    if (!canBook) { setOffer(null); return undefined; }
    if (cache.has(key)) { setOffer(cache.get(key)); return undefined; }
    setOffer('loading');
    api('/api/reservations/offer')
      .then(d => { const value = d.offer || null; cache.set(key, value); if (live) setOffer(value); })
      .catch(() => { if (live) setOffer(null); });
    return () => { live = false; };
  }, [authLoading, key, user?.role]);

  return offer;
}
