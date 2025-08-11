import { useState, useEffect } from 'react';
import { GEOLOCATION_OPTIONS } from '../constants';
import { extractLocationName } from '../utils/helpers';
import { config } from '../config.js';

export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getCurrentLocation = () => {
    setLoading(true);
    setError(null);
    
    // Debug information in development
    if (config.isDevelopment) {
      console.log('📍 Geolocation options:', GEOLOCATION_OPTIONS);
      console.log('📍 Browser geolocation support:', !!navigator.geolocation);
    }
    
    const attemptGeolocation = (retryCount = 0) => {
      if (config.isDevelopment) {
        console.log(`📍 Attempting geolocation (attempt ${retryCount + 1})...`);
      }
      
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          setLocation({ latitude, longitude });
          
          if (config.isDevelopment) {
            console.log('📍 Geolocation success:', { latitude, longitude, accuracy: pos.coords.accuracy });
          }
          
          // Reset retry counter on success
          if (window.geolocationRetryCount) {
            window.geolocationRetryCount = 0;
          }
          
          // Reverse geocode for display
          try {
            const resp = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`);
            const data = await resp.json();
            setLocationName(extractLocationName(data));
          } catch {
            setLocationName('Ukjent sted');
          }
          
          setLoading(false);
        },
        async (err) => {
          console.error('❌ Geolocation error in hook:', err);
          
          let errorMessage = 'Geolokasjon feilet, kan ikke hente posisjon';
          let shouldRetry = false;
          
          if (err.code) {
            switch (err.code) {
              case 1:
                errorMessage = 'Tilgang til posisjon ble avvist. Vennligst tillat posisjon i innstillingene.';
                break;
              case 2:
                errorMessage = 'Posisjon kunne ikke bestemmes. Sjekk internettforbindelsen.';
                shouldRetry = true;
                break;
              case 3:
                errorMessage = 'Timeout ved henting av posisjon. Prøver igjen...';
                shouldRetry = true;
                break;
              default:
                errorMessage = `Posisjonsfeil (kode ${err.code}): ${err.message || 'Ukjent feil'}`;
                shouldRetry = true;
            }
          } else if (err.message) {
            errorMessage = `Posisjonsfeil: ${err.message}`;
            shouldRetry = true;
          }
          
          // Retry logic for timeout and network errors
          if (shouldRetry && retryCount < 1) {
            console.log(`🔄 Retrying geolocation (attempt ${retryCount + 1})...`);
            
            setTimeout(() => {
              attemptGeolocation(retryCount + 1);
            }, 2000); // Wait 2 seconds before retry
            
            return;
          }
          
          setError(errorMessage);
          setLoading(false);
        },
        GEOLOCATION_OPTIONS
      );
    };
    
    attemptGeolocation();
  };

  return {
    location,
    locationName,
    loading,
    error,
    getCurrentLocation
  };
} 