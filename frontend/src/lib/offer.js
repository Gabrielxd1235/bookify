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

// { eligible, percent } for the signed-in user; null while unknown or signed out
export function useWelcomeOffer(user) {
  const [offer, setOffer] = useState(null);
  useEffect(() => {
    let live = true;
    if (!user || (user.role !== 'CLIENT' && user.role !== 'BUSINESS_OWNER')) { setOffer(null); return undefined; }
    api('/api/reservations/offer').then(d => { if (live) setOffer(d.offer || null); }).catch(() => { if (live) setOffer(null); });
    return () => { live = false; };
  }, [user?.id]);
  return offer;
}
