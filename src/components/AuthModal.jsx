import { useState } from 'react';

import { getTheme, loadTheme } from '../config/themes';

// Innloggings-modal (Fase 3). Passordløst: e-post magic link + Sign in with Apple.
// Formålet er å gjenopprette/synke kjøp på tvers av enheter — ikke påkrevd for bruk.
export default function AuthModal({ onClose, loginEmail, loginApple }) {
  const theme = getTheme(loadTheme());
  const c = theme.colors;
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent | error
  const [message, setMessage] = useState(null);

  const validEmail = /\S+@\S+\.\S+/.test(email.trim());

  const handleEmail = async (e) => {
    e.preventDefault();
    if (!validEmail || status === 'sending') return;
    setStatus('sending');
    setMessage(null);
    const r = await loginEmail(email.trim());
    if (r?.success) {
      setStatus('sent');
    } else {
      setStatus('error');
      setMessage(r?.reason === 'not_configured'
        ? 'Innlogging er ikke satt opp ennå.'
        : 'Kunne ikke sende lenken. Prøv igjen.');
    }
  };

  const handleApple = async () => {
    setMessage(null);
    const r = await loginApple();
    if (!r?.success && r?.reason !== 'cancelled') {
      setMessage('Kunne ikke starte Apple-innlogging.');
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Logg inn"
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
          maxWidth: 400, width: '100%', padding: '1.6rem 1.5rem',
          boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0, color: c.textPrimary }}>
            Logg inn
          </h2>
          <button
            onClick={onClose}
            aria-label="Lukk"
            style={{ background: 'transparent', border: 'none', fontSize: '1.5rem', lineHeight: 1, cursor: 'pointer', color: c.textSecondary, padding: 4 }}
          >×</button>
        </div>

        <p style={{ color: c.textSecondary, fontSize: '0.92rem', marginTop: 10, marginBottom: 16 }}>
          Logg inn for å hente kjøpet ditt på en ny enhet. Ikke nødvendig for å bruke appen.
        </p>

        {status === 'sent' ? (
          <div style={{ padding: '0.9rem 1rem', borderRadius: 12, background: 'rgba(22,163,74,0.12)', color: '#16a34a', fontSize: '0.95rem', fontWeight: 600 }}>
            Sjekk e-posten din — vi har sendt en innloggingslenke til {email.trim()}.
          </div>
        ) : (
          <>
            <form onSubmit={handleEmail}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="din@epost.no"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%', padding: '0.8rem 0.9rem', borderRadius: 12,
                  border: `1px solid ${c.border}`, background: c.cardBackground,
                  color: c.textPrimary, fontSize: '1rem', boxSizing: 'border-box',
                }}
              />
              <button
                type="submit"
                disabled={!validEmail || status === 'sending'}
                style={{
                  width: '100%', padding: '0.85rem', marginTop: 10, borderRadius: 12, border: 'none',
                  background: c.primary, color: '#fff', fontWeight: 700, fontSize: '1rem',
                  cursor: (!validEmail || status === 'sending') ? 'default' : 'pointer',
                  opacity: (!validEmail || status === 'sending') ? 0.6 : 1,
                }}
              >
                {status === 'sending' ? 'Sender…' : 'Send innloggingslenke'}
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0' }}>
              <span style={{ flex: 1, height: 1, background: c.border }} />
              <span style={{ fontSize: '0.8rem', color: c.textSecondary }}>eller</span>
              <span style={{ flex: 1, height: 1, background: c.border }} />
            </div>

            <button
              onClick={handleApple}
              style={{
                width: '100%', padding: '0.85rem', borderRadius: 12, border: 'none',
                background: '#000', color: '#fff', fontWeight: 600, fontSize: '1rem',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <span aria-hidden="true" style={{ fontSize: '1.1rem' }}></span> Logg inn med Apple
            </button>
          </>
        )}

        {message && (
          <p style={{ marginTop: 12, fontSize: '0.85rem', color: '#c0392b', textAlign: 'center' }}>{message}</p>
        )}
      </div>
    </div>
  );
}
