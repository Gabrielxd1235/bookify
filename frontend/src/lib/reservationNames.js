import {useEffect, useState} from 'react';
import {api} from './api.js';

// Turns the IDs on a reservation into readable names.
// The API now returns service_name / business_name / client_name directly; the
// read-only lookups below only run for rows that arrive without them (for
// example while an older API version is still deployed) and are cached per session.
const cache = {service: new Map(), business: new Map()};
const paths = {service: id => `/api/services/${id}`, business: id => `/api/businesses/${id}`};

function lookup(kind, id) {
  const store = cache[kind];
  if (!store.has(id)) {
    store.set(id, api(paths[kind](id)).then(data => data?.[kind] || null).catch(() => null));
  }
  return store.get(id);
}

function collect(items, idKey, nameKey) {
  const known = {};
  const missing = new Set();
  for (const item of items) {
    const id = item?.[idKey];
    if (id === null || id === undefined) continue;
    if (item[nameKey]) known[String(id)] = item[nameKey];
    else missing.add(String(id));
  }
  return {known, missing: [...missing].filter(id => !known[id])};
}

/** Returns {serviceName(id), businessName(id)} with graceful "#id" fallbacks while loading or when unavailable. */
export function useReservationNames(reservations) {
  const [names, setNames] = useState({service: {}, business: {}});
  const list = Array.isArray(reservations) ? reservations : reservations ? [reservations] : [];
  const services = collect(list, 'service_id', 'service_name');
  const businesses = collect(list, 'business_id', 'business_name');
  const signature = `${services.missing.join(',')}|${businesses.missing.join(',')}`;

  useEffect(() => {
    if (!services.missing.length && !businesses.missing.length) return undefined;
    let live = true;
    Promise.all([
      Promise.all(services.missing.map(id => lookup('service', id).then(record => [id, record?.name || '']))),
      Promise.all(businesses.missing.map(id => lookup('business', id).then(record => [id, record?.name || '']))),
    ]).then(([serviceEntries, businessEntries]) => {
      if (!live) return;
      setNames(current => ({
        service: {...current.service, ...Object.fromEntries(serviceEntries)},
        business: {...current.business, ...Object.fromEntries(businessEntries)},
      }));
    });
    return () => { live = false; };
  }, [signature]);

  return {
    serviceName: id => services.known[String(id)] || names.service[String(id)] || `Service #${id}`,
    businessName: id => businesses.known[String(id)] || names.business[String(id)] || `Business #${id}`,
  };
}

/** Client label for owner/admin views: the name when the API provides it, otherwise the ID. */
export const clientLabel = reservation => reservation?.client_name || `Client #${reservation?.user_id}`;
