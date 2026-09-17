import { useEffect, useState } from 'react';

import { getTheme, loadTheme } from '../config/themes';
import { getTrace, subscribeTrace, trace } from '../services/PurchasesService';

// Diagnose: vis kjøps-sporet på skjermen (kun når VITE_PURCHASE_DEBUG=true).
const PURCHASE_DEBUG = String(import.meta.env.VITE_PURCHASE_DEBUG) === 'true';

// Betalingsmur for Pro-funksjonene (GPS + kjøretid). Vises når en bruker uten
// tilgang prøver å bruke GPS, eller kan åpnes manuelt. Engangskjøp (49 kr),
// med 14 dagers gratis prøve for nye brukere.
export default function ProPaywall({ access, busy, onPurchase, onRestore, onClose }) {
  const theme = getTheme(loadTheme());
  const c = theme.colors;
  const [message, setMessage] = useState(null);
  const [traceLines, setTraceLines] = useState(() => (PURCHASE_DEBUG ? getTrace() : []));

  useEffect(() => {
    if (!PURCHASE_DEBUG) return undefined;
    return subscribeTrace(setTraceLines);
  }, []);

  const trial = access?.trial;
  const inTrial = access?.source === 'trial';
  const isWeb = !access?.native;
  const price = access?.priceString || 'kr 49';

  const handlePurchase = async () => {
    setMessage(null);
    const r = await onPurchase();
    // Ved suksess på web navigerer siden til Vipps (kommer ikke hit).
    if (!r?.success && r?.reason && r.reason !== 'cancelled') {
      let base;
      if (r.reason === 'not_configured') base = isWeb ? 'Vipps-betaling er ikke satt opp ennå.' : 'Kjøp er ikke satt opp.';
      else if (r.reason === 'network') base = 'Fikk ikke kontakt. Sjekk nettet og prøv igjen.';
      else base = isWeb ? 'Betalingen kunne ikke startes.' : 'Kjøpet kunne ikke fullføres.';
      // Ta med teknisk detalj (diagnose) når den finnes, så feilen er synlig.
      setMessage(r.detail ? `${base}\n\n${r.detail}` : `${base} Prøv igjen.`);
    }
  };

  const handleRestore = async () => {
    setMessage(null);
    const r = await onRestore();
    if (r?.success) setMessage('Kjøp gjenopprettet.');
    else setMessage(r?.detail ? `Gjenoppretting feilet.\n\n${r.detail}` : 'Fant ingen tidligere kjøp å gjenopprette.');
  };

  const features = [
    { icon: '📍', text: 'Automatisk nærmeste ferjekai fra din posisjon' },
    { icon: '🚗', text: 'Kjøretid til kaia i sanntid' },
    { icon: '🧭', text: 'Sortering etter kjøreretning' },
    { icon: '📡', text: 'Live-modus mens du kjører' },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Lås opp GPS og kjøretid"
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: c.cardBackground, color: c.textPrimary,
          borderRadius: 20, border: `1px solid ${c.border}`,
          maxWidth: 420, width: '100%', padding: '1.6rem 1.5rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
          maxHeight: '90vh', overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: 0, color: c.textPrimary }}>
            Lås opp GPS og kjøretid
          </h2>
          <button
            onClick={onClose}
            aria-label="Lukk"
            style={{
              background: 'transparent', border: 'none', fontSize: '1.5rem',
              lineHeight: 1, cursor: 'pointer', color: c.textSecondary, padding: 4,
            }}
          >×</button>
        </div>

        {inTrial ? (
          <div style={{
            marginTop: 12, padding: '0.6rem 0.8rem', borderRadius: 10,
            background: 'rgba(22,163,74,0.12)', color: '#16a34a', fontWeight: 600, fontSize: '0.9rem',
          }}>
            {trial?.daysLeft} {trial?.daysLeft === 1 ? 'dag' : 'dager'} igjen av gratis prøve
          </div>
        ) : (
          <div style={{
            marginTop: 12, padding: '0.6rem 0.8rem', borderRadius: 10,
            background: 'rgba(217,45,45,0.10)', color: '#c0392b', fontWeight: 600, fontSize: '0.9rem',
          }}>
            Prøveperioden er over
          </div>
        )}

        <p style={{ color: c.textSecondary, fontSize: '0.95rem', marginTop: 14, marginBottom: 8 }}>
          Fergetider er alltid gratis. Lås opp de posisjonsbaserte funksjonene med et engangskjøp:
        </p>

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.1rem' }}>
          {features.map((f) => (
            <li key={f.text} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '5px 0', fontSize: '0.95rem', color: c.textPrimary }}>
              <span aria-hidden="true" style={{ fontSize: '1.1rem' }}>{f.icon}</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>

        <button
          onClick={handlePurchase}
          disabled={busy}
          style={{
            width: '100%', padding: '0.9rem', borderRadius: 12, border: 'none',
            background: c.primary, color: '#fff', fontWeight: 700, fontSize: '1.05rem',
            cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? 'Behandler…' : (isWeb ? 'Betal 49 kr med Vipps' : `Kjøp for ${price} — engang`)}
        </button>

        {!isWeb && (
          <button
            onClick={handleRestore}
            disabled={busy}
            style={{
              width: '100%', padding: '0.7rem', marginTop: 10, borderRadius: 12,
              border: `1px solid ${c.border}`, background: 'transparent',
              color: c.textSecondary, fontWeight: 600, fontSize: '0.9rem',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Gjenopprett kjøp
          </button>
        )}

        {inTrial && (
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '0.6rem', marginTop: 6, borderRadius: 12,
              border: 'none', background: 'transparent', color: c.textSecondary,
              fontSize: '0.9rem', cursor: 'pointer',
            }}
          >
            Fortsett prøveperioden
          </button>
        )}

        {message && (
          <p style={{
            marginTop: 12, padding: '0.6rem 0.7rem', borderRadius: 10,
            background: 'rgba(217,45,45,0.08)', color: '#c0392b',
            fontSize: '0.82rem', textAlign: 'left', whiteSpace: 'pre-line', lineHeight: 1.45,
          }}>{message}</p>
        )}

        {PURCHASE_DEBUG && (
          <button
            onClick={async () => {
              trace('rå-test: kaller window.Capacitor.Plugins.Purchases.configure(...) direkte');
              try {
                const w = typeof window !== 'undefined' ? window : {};
                const P = w.Capacitor?.Plugins?.Purchases;
                trace(`rå-test: Plugins.Purchases typeof=${typeof P}, .then=${typeof P?.then}`);
                if (!P) { trace('rå-test: ✗ window.Capacitor.Plugins.Purchases finnes ikke'); return; }
                const res = await Promise.race([
                  P.configure({ apiKey: 'appl_WVJEzmuEEipqFTjzmNjXBvUEcDR' }),
                  new Promise((_, rej) => setTimeout(() => rej(new Error('rå-test timeout 8s')), 8000)),
                ]);
                trace(`rå-test: ✓ configure OK, resultat=${JSON.stringify(res)}`);
              } catch (e) {
                trace(`rå-test: ✗ ${e?.code || ''} ${e?.message || e}`);
              }
            }}
            style={{
              width: '100%', padding: '0.6rem', marginTop: 12, borderRadius: 10,
              border: '1px dashed #999', background: 'transparent',
              color: c.textSecondary, fontSize: '0.8rem', cursor: 'pointer',
            }}
          >
            🔬 Kjør rå-test (window.Capacitor.Plugins.Purchases.configure)
          </button>
        )}

        {PURCHASE_DEBUG && (
          <div style={{
            marginTop: 12, padding: '0.5rem 0.6rem', borderRadius: 8,
            background: '#111', color: '#9ef59e',
            fontFamily: 'ui-monospace, Menlo, monospace', fontSize: '0.62rem',
            lineHeight: 1.35, maxHeight: 220, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-word', textAlign: 'left',
          }}>
            <div style={{ color: '#fff', fontWeight: 700, marginBottom: 4 }}>Diagnose-spor (kjøp)</div>
            {traceLines.length ? traceLines.join('\n') : '(ingen spor ennå)'}
          </div>
        )}

        <p style={{ marginTop: 12, fontSize: '0.75rem', color: c.textSecondary, textAlign: 'center', lineHeight: 1.5 }}>
          {isWeb ? 'Engangskjøp — ingen abonnement. Betaling via Vipps.' : 'Engangskjøp — ingen abonnement. Betaling via App Store.'}
        </p>
      </div>
    </div>
  );
}
