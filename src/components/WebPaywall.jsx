import { useEffect, useMemo, useState } from 'react';

import { getOfferings, isPremiumActive, purchasePackageById } from '../services/PurchasesService';
import { config } from '../config/config';

function normalizePackages(offering) {
  if (!offering) return [];
  let available = Array.isArray(offering?.availablePackages) ? offering.availablePackages.slice() : [];
  const maybePush = (p) => { if (p && !available.includes(p)) available.push(p); };
  if (!available.length) {
    maybePush(offering?.monthly);
    maybePush(offering?.annual);
    maybePush(offering?.lifetime);
    if (Array.isArray(offering?.packages)) available = offering.packages;
  }
  return available || [];
}

function getPackageLabel(pkg) {
  const identifier = pkg?.identifier || pkg?.packageType;
  if (identifier === '$rc_monthly' || identifier === 'MONTHLY') return 'Månedlig';
  if (identifier === '$rc_annual' || identifier === 'ANNUAL') return 'Årlig';
  if (identifier === '$rc_lifetime' || identifier === 'LIFETIME') return 'Livstid';
  return identifier || 'Pakke';
}

function getPriceString(pkg) {
  const product = pkg?.product || pkg?.storeProduct || {};
  return product.priceString || product.localizedPriceString || (product.price != null && product.currencyCode ? `${product.price} ${product.currencyCode}` : null);
}

export default function WebPaywall({ onSuccess, onError }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [packages, setPackages] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const offerings = null; // deaktivert på web
        let pkgs = [];
        if (offerings) {
          const current = offerings?.current || offerings?.offerings?.current || offerings;
          const selected = (offerings?.all && current?.identifier && offerings.all[current.identifier]) || current;
          pkgs = normalizePackages(selected);
        }
        if (mounted) setPackages(pkgs);
      } catch (e) {
        if (mounted) setError(e?.message || 'Kunne ikke laste tilbud.');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const sortedPackages = useMemo(() => {
    const order = (p) => {
      const id = p?.identifier || p?.packageType;
      if (id === '$rc_monthly' || id === 'MONTHLY') return 1;
      if (id === '$rc_annual' || id === 'ANNUAL') return 2;
      if (id === '$rc_lifetime' || id === 'LIFETIME') return 3;
      return 99;
    };
    return [...packages].sort((a, b) => order(a) - order(b));
  }, [packages]);

  const handlePurchase = async () => {
    try {
      const active = await isPremiumActive();
      if (active && typeof onSuccess === 'function') onSuccess();
    } catch (e) {
      if (typeof onError === 'function') onError(e);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">
      {loading && (
        <div className="text-sm text-gray-600">Laster tilbud…</div>
      )}
      {error && (
        <div className="text-sm text-red-600">{error}</div>
      )}
      {/* Kjøp deaktivert: Vis enkel aktiver-knapp */}
      {!loading && !error && (
        <div className="grid grid-cols-1 gap-2">
          <button
            type="button"
            onClick={() => handlePurchase()}
            className="w-full px-3 py-2 bg-white/90 hover:bg-white text-fuchsia-700 font-semibold rounded-md border border-fuchsia-300 shadow"
          >
            Aktiver Premium (midlertidig)
          </button>
        </div>
      )}
      {/* Ingen Stripe‑lenker. Kjøp er deaktivert på web. */}
    </div>
  );
}


