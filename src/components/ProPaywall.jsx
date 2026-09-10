import { useState } from 'react';

import { getTheme, loadTheme } from '../config/themes';

// Betalingsmur for Pro-funksjonene (GPS + kjøretid). Vises når en bruker uten
// tilgang prøver å bruke GPS, eller kan åpnes manuelt. Engangskjøp (49 kr),
// med 14 dagers gratis prøve for nye brukere.
export default function ProPaywall({ access, busy, onPurchase, onRestore, onClose }) {
  const theme = getTheme(loadTheme());
  const c = theme.colors;
  const [message, setMessage] = useState(null);

  const trial = access?.trial;
  const inTrial = access?.source === 'trial';
  const isWeb = !access?.native;
  const price = access?.priceString || 'kr 49';

  const handlePurchase = async () => {
    setMessage(null);
    const r = await onPurchase();
    // Ved suksess på web navigerer siden til Vipps (kommer ikke hit).
    if (!r?.success && r?.reason && r.reason !== 'cancelled') {
      if (r.reason === 'not_configured') setMessage('Vipps-betaling er ikke satt opp ennå.');
      else if (r.reason === 'network') setMessage('Fikk ikke kontakt. Sjekk nettet og prøv igjen.');
      else setMessage(isWeb ? 'Betalingen kunne ikke startes. Prøv igjen.' : 'Kjøpet kunne ikke fullføres. Prøv igjen.');
    }
  };

  const handleRestore = async () => {
    setMessage(null);
    const r = await onRestore();
    setMessage(r?.success ? 'Kjøp gjenopprettet.' : 'Fant ingen tidligere kjøp å gjenopprette.');
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
          <p style={{ marginTop: 10, fontSize: '0.85rem', color: c.textSecondary, textAlign: 'center' }}>{message}</p>
        )}

        <p style={{ marginTop: 12, fontSize: '0.75rem', color: c.textSecondary, textAlign: 'center', lineHeight: 1.5 }}>
          {isWeb ? 'Engangskjøp — ingen abonnement. Betaling via Vipps.' : 'Engangskjøp — ingen abonnement. Betaling via App Store.'}
        </p>
      </div>
    </div>
  );
}
