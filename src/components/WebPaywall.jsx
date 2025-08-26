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
        const offerings = await getOfferings();
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

  const handlePurchase = async (pkg) => {
    const idOrType = pkg?.identifier || pkg?.packageType || '$rc_monthly';
    try {
      await purchasePackageById(idOrType);
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
      {!loading && !error && sortedPackages?.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {sortedPackages.map((pkg) => {
            const label = getPackageLabel(pkg);
            const price = getPriceString(pkg);
            return (
              <button
                key={pkg?.identifier || pkg?.packageType}
                type="button"
                onClick={() => handlePurchase(pkg)}
                className="w-full px-3 py-2 bg-white/90 hover:bg-white text-fuchsia-700 font-semibold rounded-md border border-fuchsia-300 shadow"
              >
                {price ? `${label} · ${price}` : label}
              </button>
            );
          })}
        </div>
      )}
      {!loading && !error && (!sortedPackages || sortedPackages.length === 0) && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-gray-600">Ingen tilgjengelige pakker akkurat nå. Du kan fortsatt kjøpe:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handlePurchase({ identifier: '$rc_monthly', packageType: 'MONTHLY' })}
              className="w-full px-3 py-2 bg-white/90 hover:bg-white text-fuchsia-700 font-semibold rounded-md border border-fuchsia-300 shadow"
            >
              Månedlig{config?.STRIPE_CONFIG?.getMonthlyPaymentLink?.() ? '' : ''}
            </button>
            <button
              type="button"
              onClick={() => handlePurchase({ identifier: '$rc_annual', packageType: 'ANNUAL' })}
              className="w-full px-3 py-2 bg-white/90 hover:bg-white text-fuchsia-700 font-semibold rounded-md border border-fuchsia-300 shadow"
            >
              Årlig{config?.STRIPE_CONFIG?.getAnnualPaymentLink?.() ? '' : ''}
            </button>
          </div>
          <div className="text-xs text-gray-500">Kjøp håndteres via RevenueCat/Stripe. Du kan bli sendt videre for betaling.</div>
        </div>
      )}
    </div>
  );
}


