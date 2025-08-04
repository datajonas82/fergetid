import { useState, useEffect } from 'react';
import { GEOLOCATION_OPTIONS } from '../constants';
import { extractLocationName } from '../utils/helpers';

export function useGeolocation() {
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getCurrentLocation = () => {
    setLoading(true);
    setError(null);
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ latitude, longitude });
        
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
      (err) => {
        setError('Geolokasjon feilet, kan ikke hente posisjon');
        setLoading(false);
      },
      GEOLOCATION_OPTIONS
    );
  };

  return {
    location,
    locationName,
    loading,
    error,
    getCurrentLocation
  };
} 