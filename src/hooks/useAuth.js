import { useCallback, useEffect, useState } from 'react';

import {
  isAuthConfigured,
  getUser,
  onAuthChange,
  signInWithEmail,
  signInWithApple,
  signOut,
} from '../services/AuthService';
import { setAppUserId, clearAppUser } from '../services/PurchasesService';

// Valgfri innlogging (Fase 3). Anonym som standard; logg inn kun for å gjenopprette
// kjøp på tvers av enheter. Når en bruker logges inn/ut, kobles bruker-ID-en til
// RevenueCat så rettigheten følger kontoen.
export function useAuth() {
  const configured = isAuthConfigured();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    if (!configured) return;
    let mounted = true;

    getUser().then((u) => {
      if (!mounted) return;
      setUser(u);
      setReady(true);
      if (u) setAppUserId(u.id);
    });

    const unsub = onAuthChange((u) => {
      if (!mounted) return;
      setUser(u);
      if (u) setAppUserId(u.id);
      else clearAppUser();
    });

    return () => { mounted = false; unsub(); };
  }, [configured]);

  const loginEmail = useCallback((email) => signInWithEmail(email), []);
  const loginApple = useCallback(() => signInWithApple(), []);
  const logout = useCallback(() => signOut(), []);

  return { configured, user, ready, loginEmail, loginApple, logout };
}
