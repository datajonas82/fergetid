import { useEffect, useState } from 'react';
import { liveModeService } from '../services/LiveModeService';
import { hasLiveModeAccess } from '../services/PurchasesService';
import { formatMinutes, formatDistance, calculateTimeDiff } from '../utils/helpers';
import { generateTravelDescription } from '../utils/departureUtils';
import { THEMES, getTheme, loadTheme } from '../config/themes';

export default function LiveMode({ ferryTerminal, onClose, departures = [] }) {
  const [location, setLocation] = useState(null);
  const [drivingTime, setDrivingTime] = useState(null);
  const [distance, setDistance] = useState(null);
  const [error, setError] = useState(null);
  const [isPremium, setIsPremium] = useState(false);
  const [checkingPremium, setCheckingPremium] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);

  const theme = getTheme(loadTheme());

  // Check premium status for live mode
  useEffect(() => {
    (async () => {
      try {
        const premium = await hasLiveModeAccess();
        setIsPremium(premium);
      } catch (err) {
        console.error('Error checking live mode access:', err);
        setIsPremium(false);
      } finally {
        setCheckingPremium(false);
      }
    })();
  }, []);

  // Start live mode tracking when component mounts and premium is confirmed
  useEffect(() => {
    if (!checkingPremium && isPremium && ferryTerminal) {
      // Handle location/driving time updates
      const handleUpdate = (data) => {
        setLocation(data.location);
        setDrivingTime(data.drivingTime);
        setDistance(data.distance);
        setError(data.error || null);
        setLastUpdate(new Date());
      };

      // Start live mode service
      liveModeService.start(ferryTerminal, handleUpdate);

      // Cleanup on unmount
      return () => {
        liveModeService.stop();
      };
    }
  }, [ferryTerminal, isPremium, checkingPremium]);

  // If not premium, show paywall
  if (checkingPremium) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4" style={{ backgroundColor: theme.colors.background }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: theme.colors.primary }}></div>
          <p style={{ color: theme.colors.textSecondary }}>Sjekker tilgang...</p>
        </div>
      </div>
    );
  }

  if (!isPremium) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4" style={{ backgroundColor: theme.colors.background }}>
        <div className="max-w-md w-full p-6 rounded-2xl shadow-lg" style={{ backgroundColor: theme.colors.cardBackground, border: `1px solid ${theme.colors.border}` }}>
          <h2 className="text-2xl font-bold mb-4" style={{ color: theme.colors.textPrimary }}>
            Live-modus er en Premium-funksjon
          </h2>
          <p className="mb-6" style={{ color: theme.colors.textSecondary }}>
            For å bruke live-modus må du ha tilgang til Premium. Live-modus oppdaterer GPS-posisjonen din automatisk hvert 15. sekund og gir deg oppdaterte kjøretidsbeskrivelser til fergekaien.
          </p>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg font-semibold"
              style={{ backgroundColor: theme.colors.border, color: theme.colors.textPrimary }}
            >
              Tilbake
            </button>
            <button
              onClick={() => {
                // TODO: Open purchase flow
                alert('In-app purchase flow kommer snart');
              }}
              className="flex-1 px-4 py-2 rounded-lg font-semibold text-white"
              style={{ backgroundColor: theme.colors.primary }}
            >
              Oppgrader til Premium
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!ferryTerminal) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4" style={{ backgroundColor: theme.colors.background }}>
        <div className="text-center">
          <p style={{ color: theme.colors.textSecondary }}>Ingen fergekai valgt</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 rounded-lg font-semibold text-white"
            style={{ backgroundColor: theme.colors.primary }}
          >
            Tilbake
          </button>
        </div>
      </div>
    );
  }

  // Find next departure
  const now = new Date();
  const nextDeparture = departures
    .filter(dep => {
      const depTime = new Date(dep.aimedDepartureTime || dep.aimed);
      return depTime > now;
    })
    .sort((a, b) => {
      const timeA = new Date(a.aimedDepartureTime || a.aimed);
      const timeB = new Date(b.aimedDepartureTime || b.aimed);
      return timeA - timeB;
    })[0];

  const timeToDeparture = nextDeparture
    ? calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed)
    : 0;

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: theme.colors.background }}>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: theme.colors.textPrimary }}>
              Live-modus
            </h1>
            <p className="text-sm mt-1" style={{ color: theme.colors.textSecondary }}>
              Oppdateres automatisk hvert 15. sekund
            </p>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg font-semibold text-white"
            style={{ backgroundColor: theme.colors.primary }}
          >
            Lukk
          </button>
        </div>

        {/* Ferry terminal card */}
        <div
          className="p-6 rounded-2xl shadow-lg mb-6"
          style={{ backgroundColor: theme.colors.cardBackground, border: `1px solid ${theme.colors.border}` }}
        >
          <h2 className="text-xl font-bold mb-2" style={{ color: theme.colors.textPrimary }}>
            {ferryTerminal.name?.toUpperCase() || 'Fergekai'}
          </h2>
          <hr className="my-3" style={{ borderColor: theme.colors.border }} />

          {/* Live status indicator */}
          <div className="flex items-center gap-2 mb-4">
            <div className="w-3 h-3 rounded-full animate-pulse" style={{ backgroundColor: '#16a34a' }}></div>
            <span className="text-sm font-semibold" style={{ color: '#16a34a' }}>
              Live oppdatering aktiv
            </span>
            {lastUpdate && (
              <span className="text-xs ml-auto" style={{ color: theme.colors.textSecondary }}>
                Sist oppdatert: {lastUpdate.toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </div>

          {/* Location status */}
          {location ? (
            <div className="mb-4">
              <p className="text-sm mb-1" style={{ color: theme.colors.textSecondary }}>
                Din posisjon:
              </p>
              <p className="text-base font-semibold" style={{ color: theme.colors.textPrimary }}>
                {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
              </p>
            </div>
          ) : (
            <div className="mb-4">
              <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                Henter GPS-posisjon...
              </p>
            </div>
          )}

          {/* Travel description */}
          {drivingTime !== null && distance !== null && location && nextDeparture ? (
            <div
              className="mt-4 mb-2 text-lg leading-tight"
              style={{ color: theme.colors.textSecondary }}
            >
              <div dangerouslySetInnerHTML={{
                __html: generateTravelDescription(
                  distance,
                  drivingTime,
                  timeToDeparture,
                  departures
                )
              }} />
            </div>
          ) : drivingTime === null && !error ? (
            <div className="mt-4">
              <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
                Beregner kjøretid...
              </p>
            </div>
          ) : error ? (
            <div className="mt-4">
              <p className="text-sm" style={{ color: '#dc2626' }}>
                Feil: {error}
              </p>
            </div>
          ) : null}

          {/* Next departure */}
          {nextDeparture && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-2" style={{ color: theme.colors.textSecondary }}>
                Neste avgang:
              </h3>
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold" style={{ color: theme.colors.textPrimary }}>
                  {new Date(nextDeparture.aimedDepartureTime || nextDeparture.aimed).toLocaleTimeString('no-NO', { hour: '2-digit', minute: '2-digit' })}
                </span>
                {nextDeparture.destinationDisplay?.frontText && (
                  <span className="text-base" style={{ color: theme.colors.textSecondary }}>
                    {nextDeparture.destinationDisplay.frontText}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info box */}
        <div
          className="p-4 rounded-lg"
          style={{ backgroundColor: theme.colors.cardBackground, border: `1px solid ${theme.colors.border}` }}
        >
          <p className="text-sm" style={{ color: theme.colors.textSecondary }}>
            <strong>Tips:</strong> Live-modus oppdaterer automatisk GPS-posisjonen din hvert 15. sekund og beregner kjøretid til fergekaien i sanntid. Dette gir deg de mest oppdaterte reisetidsbeskrivelsene når du er på vei til fergekaien.
          </p>
        </div>
      </div>
    </div>
  );
}
