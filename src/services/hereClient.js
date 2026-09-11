// Frontend-klient mot HERE-proxyen (/api/here). HERE-nøkkelen ligger IKKE her —
// den holdes server-side. All HERE-trafikk (ruting, reverse-geocode, route matching)
// går gjennom dette laget.

import { Capacitor } from '@capacitor/core';

// Absolutt base slik at både iOS (Capacitor, cross-origin) og lokal dev treffer det
// deployede endepunktet. På web-prod (fergetid.app) brukes same-origin.
const apiBase = () => {
  try {
    if (Capacitor?.getPlatform?.() === 'ios') return 'https://fergetid.app';
    if (typeof window !== 'undefined' && window.location.hostname === 'fergetid.app') return '';
    return 'https://fergetid.app'; // localhost dev, previews o.l.
  } catch {
    return 'https://fergetid.app';
  }
};

const hereProxy = async (op, params, { timeoutMs = 10000 } = {}) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(`${apiBase()}/api/here`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ op, params }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(id);
  }
};

// Returnerer Response — kalleren gjør .ok / .json() som før.
export const hereRoute = (params, opts) => hereProxy('route', params, opts);
export const hereRevGeocode = (lat, lng, opts) => hereProxy('revgeocode', { lat, lng }, opts);
export const hereMatchRoute = (csvTrace, opts) => hereProxy('matchroute', { csvTrace }, opts);
