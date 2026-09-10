import { useCallback, useEffect, useState } from 'react';

import {
  getAccessState,
  subscribeAccess,
  initPurchases,
  refreshEntitlement,
  purchasePro,
  restorePro,
} from '../services/PurchasesService';

// React-grensesnitt mot Pro-tilgang: eksponerer nåværende tilgangsstatus,
// åpner/lukker betalingsmuren, og håndterer kjøp/gjenoppretting.
export function useProAccess() {
  const [access, setAccess] = useState(() => getAccessState());
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let mounted = true;

    initPurchases().then(() => {
      if (mounted) setAccess(getAccessState());
    });

    const unsub = subscribeAccess((state) => {
      if (mounted) setAccess(state);
    });

    // Kjøp gjort utenfor appen (f.eks. App Store-restore) fanges opp når appen
    // kommer i forgrunnen igjen.
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        refreshEntitlement().then(() => { if (mounted) setAccess(getAccessState()); });
      }
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      mounted = false;
      unsub();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const purchase = useCallback(async () => {
    setBusy(true);
    const result = await purchasePro();
    setBusy(false);
    setAccess(getAccessState());
    if (result.success) setPaywallOpen(false);
    return result;
  }, []);

  const restore = useCallback(async () => {
    setBusy(true);
    const result = await restorePro();
    setBusy(false);
    setAccess(getAccessState());
    if (result.success) setPaywallOpen(false);
    return result;
  }, []);

  const openPaywall = useCallback(() => setPaywallOpen(true), []);
  const closePaywall = useCallback(() => setPaywallOpen(false), []);

  return { access, paywallOpen, openPaywall, closePaywall, purchase, restore, busy };
}
