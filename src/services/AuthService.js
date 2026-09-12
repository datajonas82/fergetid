// Identitetslag for Fase 3 (valgfri innlogging for å gjenopprette kjøp på tvers
// av enheter/plattformer). Bruker Supabase Auth. Alt er inert til env-variablene
// er satt, så appen fungerer uendret (anonymt) uten konto:
//   VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
//
// Innlogging er passordløs: e-post magic link + Sign in with Apple. (Vipps Login
// legges til som provider når Vipps-avtalen er live.)

const url = () => (import.meta.env.VITE_SUPABASE_URL || '').trim();
const anonKey = () => (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

export const isAuthConfigured = () => !!(url() && anonKey());

// Supabase-klienten lastes lazy (dynamisk import) så den ikke blåser opp
// hoved-bundelen for brukere som ikke logger inn.
let _clientPromise = null;
const ensureClient = async () => {
  if (!isAuthConfigured()) return null;
  if (!_clientPromise) {
    _clientPromise = import('@supabase/supabase-js').then(({ createClient }) =>
      createClient(url(), anonKey(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    );
  }
  return _clientPromise;
};

// Nåværende innlogget bruker (eller null).
export const getUser = async () => {
  const c = await ensureClient();
  if (!c) return null;
  try {
    const { data } = await c.auth.getUser();
    return data?.user ?? null;
  } catch {
    return null;
  }
};

// Abonner på innloggingsendringer. Returnerer unsubscribe.
export const onAuthChange = (cb) => {
  let unsub = () => {};
  let cancelled = false;
  ensureClient().then((c) => {
    if (!c || cancelled) return;
    const { data } = c.auth.onAuthStateChange((_event, session) => {
      cb(session?.user ?? null);
    });
    unsub = () => { try { data?.subscription?.unsubscribe(); } catch (_) {} };
  });
  return () => { cancelled = true; unsub(); };
};

// Passordløs e-post: sender en magic link. Brukeren klikker → logges inn.
export const signInWithEmail = async (email) => {
  const c = await ensureClient();
  if (!c) return { success: false, reason: 'not_configured' };
  try {
    const emailRedirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo } });
    if (error) return { success: false, reason: 'error', error: error.message };
    return { success: true }; // e-post sendt
  } catch (e) {
    return { success: false, reason: 'error', error: String((e && e.message) || e) };
  }
};

// Sign in with Apple (OAuth). På web: redirect. iOS-native deep-link-flyt kommer
// sammen med Apple-capability-oppsettet.
export const signInWithApple = async () => {
  const c = await ensureClient();
  if (!c) return { success: false, reason: 'not_configured' };
  try {
    const redirectTo = typeof window !== 'undefined' ? window.location.origin : undefined;
    const { error } = await c.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo } });
    if (error) return { success: false, reason: 'error', error: error.message };
    return { success: true }; // navigerer til Apple
  } catch (e) {
    return { success: false, reason: 'error', error: String((e && e.message) || e) };
  }
};

export const signOut = async () => {
  const c = await ensureClient();
  if (!c) return;
  try { await c.auth.signOut(); } catch (_) {}
};
