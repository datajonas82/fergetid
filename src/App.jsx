import { useEffect, useState, useRef } from 'react';
import { GraphQLClient, gql } from 'graphql-request';
import { SplashScreen } from '@capacitor/splash-screen';
import { Capacitor } from '@capacitor/core';
import LoadingSpinner from './components/LoadingSpinner';
import inAppPurchaseService from './services/inAppPurchase';
import { calculateDrivingTime, getLocationName, formatDrivingTime, generateTravelDescription } from './utils/googleMapsService';
import { 
  ENTUR_ENDPOINT, 
  NEARBY_SEARCH_CONFIG, 
  TRANSPORT_MODES, 
  APP_NAME,
  GEOLOCATION_OPTIONS,
  EXCLUDED_SUBMODES
} from './constants';
import { config } from './config';
import { 
  formatMinutes, 
  formatDistance, 
  getCurrentTime, 
  calculateTimeDiff,
  cleanDestinationText,
  extractLocationName,
  normalizeText,
  bokmaalify
} from './utils/helpers';

const client = new GraphQLClient(ENTUR_ENDPOINT, {
  headers: { 'ET-Client-Name': config.ENTUR_CLIENT_NAME }
});

const NEARBY_QUERY = gql`
  query NearestStops($latitude: Float!, $longitude: Float!) {
    nearest(
      latitude: $latitude,
      longitude: $longitude,
      maximumDistance: ${NEARBY_SEARCH_CONFIG.maximumDistance},
      maximumResults: ${NEARBY_SEARCH_CONFIG.maximumResults},
      filterByModes: [${TRANSPORT_MODES.WATER}]
    ) {
      edges {
        node {
          distance
          place {
            ... on StopPlace {
              id
              name
              latitude
              longitude
              transportMode
              transportSubmode
            }
          }
        }
      }
    }
  }
`;

const DEPARTURES_QUERY = gql`
  query StopPlaceDepartures($id: String!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(timeRange: 86400, numberOfDepartures: 50) {
        aimedDepartureTime
        destinationDisplay { frontText }
        serviceJourney {
          journeyPattern { line { transportSubmode } }
        }
      }
    }
  }
`;

function App() {
  // Search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchInputRef = useRef(null);
  const gpsButtonRef = useRef(null);

  const [showSearchInput, setShowSearchInput] = useState(!/iPad|iPhone|iPod/.test(navigator.userAgent));

  // GPS state
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');

  // Shared state
  const [ferryStops, setFerryStops] = useState([]);
  const [departuresMap, setDeparturesMap] = useState({});
  const [selectedStop, setSelectedStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState({});
  const [error, setError] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Mode state
  const [mode, setMode] = useState('search'); // 'search' or 'gps'
  const [ferryStopsLoaded, setFerryStopsLoaded] = useState(false);

  // Cache for all ferry stops (for autocomplete)
  const [allFerryStops, setAllFerryStops] = useState([]);

  // Driving time calculation state
  const [showDrivingTimes, setShowDrivingTimes] = useState(false);
  const [drivingTimes, setDrivingTimes] = useState({});
  const [drivingTimesLoading, setDrivingTimesLoading] = useState({});
  const [isIOS] = useState(Capacitor.isNativePlatform());
  
  // Inline destinations state - now supports multiple destinations per stop
  const [inlineDestinations, setInlineDestinations] = useState({}); // { [parentStopId]: [{ stopId, name, departures: array }] }

  // Initialize app
  useEffect(() => {
    const loadAllFerryStops = async () => {
      try {
        const data = await client.request(gql`
          query AllFerryStops {
            stopPlaces {
              id
              name
              latitude
              longitude
              transportMode
              transportSubmode
            }
          }
        `);
        
        const stops = (data.stopPlaces || []).filter(
          (stop) => {
            if (!Array.isArray(stop.transportMode) || !stop.transportMode.includes('water')) return false;
            if (EXCLUDED_SUBMODES.includes(stop.transportSubmode)) return false;
            const name = (stop.name || '').toLowerCase();
            // Ekskluder hurtigbåtkai og kystrutekai basert på navn
            if (name.includes('hurtigbåt') || name.includes('express boat') || name.includes('kystrute')) return false;
            return (name.includes('fergekai') || name.includes('ferjekai'));
          }
        );
        
        console.log('All ferry stops from Entur:', stops.map(s => ({ 
          name: s.name, 
          id: s.id 
        })));
        setAllFerryStops(stops);
        setFerryStopsLoaded(true);
      } catch (error) {
        console.error('Error loading ferry stops:', error);
        setFerryStopsLoaded(true); // Sett til true selv ved feil for å unngå evig lasting
      }
    };

    const initializeApp = async () => {
      // Vis splash screen
      await SplashScreen.show();
      
      // Last fergekaier
      await loadAllFerryStops();
      
      // Initialize services
      if (isIOS) {
        try {
          await inAppPurchaseService.initialize();
        } catch (error) {
          console.error('Error initializing services:', error);
        }
      }
      
      // Skjul splash screen etter 2 sekunder
      setTimeout(async () => {
        await SplashScreen.hide();
      }, 2000);
    };

    initializeApp();
  }, []);

  // Live search effect - show ferry cards as user types
  useEffect(() => {
    // Kun kjøre live search hvis brukeren faktisk har skrevet noe OG vi har data
    if (!query.trim() || !ferryStopsLoaded || allFerryStops.length === 0) {
      setFerryStops([]);
      setHasInteracted(false);
      setSelectedStop(null);
      return;
    }

    const performLiveSearch = async () => {
      const normQuery = normalizeText(query).toLowerCase();
      const originalQuery = query.toLowerCase();
      
      let stops = allFerryStops.filter(stop => {
        const normName = normalizeText(stop.name);
        const originalName = stop.name.toLowerCase();
        
        // Sjekk både normalisert og original tekst
        return normName.includes(normQuery) || originalName.includes(originalQuery);
      });
      
      // Sorter slik at eksakte treff kommer først, deretter treff som starter med søkeordet
      stops = stops.sort((a, b) => {
        const aNormName = normalizeText(a.name);
        const bNormName = normalizeText(b.name);
        const aOrigName = a.name.toLowerCase();
        const bOrigName = b.name.toLowerCase();
        
        // Eksakte treff får høyest prioritet (både normalisert og original)
        const aExactNorm = aNormName === normQuery;
        const bExactNorm = bNormName === normQuery;
        const aExactOrig = aOrigName === originalQuery;
        const bExactOrig = bOrigName === originalQuery;
        
        if ((aExactNorm || aExactOrig) && !(bExactNorm || bExactOrig)) return -1;
        if (!(aExactNorm || aExactOrig) && (bExactNorm || bExactOrig)) return 1;
        
        // Treff som starter med søkeordet får nest høyest prioritet
        const aStartsWithNorm = aNormName.startsWith(normQuery);
        const bStartsWithNorm = bNormName.startsWith(normQuery);
        const aStartsWithOrig = aOrigName.startsWith(originalQuery);
        const bStartsWithOrig = bOrigName.startsWith(originalQuery);
        
        if ((aStartsWithNorm || aStartsWithOrig) && !(bStartsWithNorm || bStartsWithOrig)) return -1;
        if (!(aStartsWithNorm || aStartsWithOrig) && (bStartsWithNorm || bStartsWithOrig)) return 1;
        
        // Alfabetisk sortering som fallback
        return aOrigName.localeCompare(bOrigName);
      });

      // Limit to 10 results for live search
      const limitedStops = stops.slice(0, 10);
      
      // Hent avganger for hver fergekai
      const stopsWithDepartures = [];
      for (const stop of limitedStops) {
        let departures = [];
        try {
          const data = await client.request(DEPARTURES_QUERY, { id: stop.id });
          const calls = data.stopPlace?.estimatedCalls || [];
          departures = calls
            .filter((call) => {
              const line = call.serviceJourney?.journeyPattern?.line;
              return line && line.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY;
            })
            .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
        } catch {
          // Ignorer feil for individuelle fergekaier
        }
        
        // Beregn avstand hvis GPS er aktiv (location er satt)
        let distance = null;
        if (location && stop.latitude && stop.longitude) {
          const dLat = (stop.latitude - location.latitude) * 111000;
          const dLng = (stop.longitude - location.longitude) * 111000 * Math.cos(location.latitude * Math.PI / 180);
          distance = Math.sqrt(dLat * dLat + dLng * dLng);
        }
        
        stopsWithDepartures.push({
          id: stop.id,
          name: stop.name,
          latitude: stop.latitude,
          longitude: stop.longitude,
          distance: distance,
          departures: departures
        });
      }
      
      const formattedStops = stopsWithDepartures.filter(stop => stop.id);
      
      // Kun sett hasInteracted til true hvis vi faktisk har resultater
      if (formattedStops.length > 0) {
        setFerryStops(formattedStops);
        setHasInteracted(true);
        setSelectedStop(formattedStops[0].id);
      } else {
        setFerryStops([]);
        setHasInteracted(false);
        setSelectedStop(null);
      }
    };

    // Debounce the live search
    const timeoutId = setTimeout(performLiveSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [query, allFerryStops, ferryStopsLoaded]);

  // Fjern feilmeldinger når mode endres til search eller query endres
  useEffect(() => {
    if ((mode === 'search' || query.trim()) && error) {
      setError(null);
    }
  }, [mode, error, query]);

  // Calculate driving times when feature is enabled
  useEffect(() => {
    if (showDrivingTimes && mode === 'gps' && location && ferryStops.length > 0) {
      calculateDrivingTimesForExistingStops();
    }
  }, [showDrivingTimes, location, ferryStops, mode]);

  // Automatisk last alle avganger og destinasjonstider når fergekaier vises
  useEffect(() => {
    if (ferryStops.length > 0 && hasInteracted && !loading) {
      ferryStops.forEach((stop, index) => {
        // Vent litt før vi laster avganger og destinasjonstider for hver fergekai
        setTimeout(async () => {
          // Last alle avganger for denne fergekaien
          if (!departuresMap[stop.id]) {
            try {
              const data = await client.request(DEPARTURES_QUERY, { id: stop.id });
              const calls = data.stopPlace?.estimatedCalls || [];
              const filteredCalls = calls
                .filter(call => call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY)
                .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
              
              setDeparturesMap(prev => ({
                ...prev,
                [stop.id]: filteredCalls
              }));
            } catch (error) {
              console.error('Error loading departures for:', stop.name, error);
            }
          }
          
          // Last destinasjonstider - identifiser alle unike destinasjoner
          let destinationTexts = [];
          
          // For GPS-modus - bruk departuresMap hvis tilgjengelig, ellers last avganger
          if (stop.nextDeparture?.destinationDisplay?.frontText) {
            // Start med neste avgang
            destinationTexts.push(stop.nextDeparture.destinationDisplay.frontText);
            
            // Bruk departuresMap hvis tilgjengelig, ellers last avganger
            let filteredCalls = departuresMap[stop.id] || [];
            
            if (filteredCalls.length === 0) {
              // Last alle avganger for å finne andre destinasjoner
              try {
                const data = await client.request(DEPARTURES_QUERY, { id: stop.id });
                const calls = data.stopPlace?.estimatedCalls || [];
                filteredCalls = calls
                  .filter(call => call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY)
                  .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
              } catch (error) {
                console.error('Error loading all departures for GPS mode:', error);
              }
            }
            
            // Finn alle unike destinasjoner
            const uniqueDestinations = new Set();
            filteredCalls.forEach(dep => {
              if (dep.destinationDisplay?.frontText) {
                uniqueDestinations.add(dep.destinationDisplay.frontText);
              }
            });
            destinationTexts = Array.from(uniqueDestinations);
          }
          // For søk-modus - bruk departuresMap hvis tilgjengelig, ellers bruk stop.departures
          else {
            let departures = departuresMap[stop.id] || stop.departures || [];
            
            if (departures.length > 0) {
              const uniqueDestinations = new Set();
              departures.forEach(dep => {
                if (dep.destinationDisplay?.frontText) {
                  uniqueDestinations.add(dep.destinationDisplay.frontText);
                }
              });
              destinationTexts = Array.from(uniqueDestinations);
            }
          }
          
          if (destinationTexts.length > 0) {
            console.log('Auto-loading destination times for:', stop.name, '->', destinationTexts);
            // Last returkort for alle destinasjoner - unngå duplikater
            const uniqueDestinationTexts = [...new Set(destinationTexts)];
            const existingDestinations = inlineDestinations[stop.id] || [];
            
            uniqueDestinationTexts.forEach(destinationText => {
              // Sjekk om denne destinasjonen allerede er lastet
              const alreadyLoaded = existingDestinations.some(dest => {
                const destName = normalizeText(cleanDestinationText(dest.name || '')).toLowerCase();
                const targetName = normalizeText(cleanDestinationText(destinationText || '')).toLowerCase();
                return destName === targetName;
              });
              
              if (!alreadyLoaded) {
                loadInlineDestinationDepartures(stop.id, destinationText);
              } else {
                console.log('Destination already loaded, skipping:', destinationText);
              }
            });
          } else {
            console.log('No destination text found for:', stop.name, 'nextDeparture:', stop.nextDeparture, 'departures:', stop.departures);
          }
        }, index * 300); // 300ms delay mellom hver fergekai
      });
    }
  }, [ferryStops, hasInteracted, loading, departuresMap]);

  // GPS functionality
  const handleGPSLocation = async () => {
    // Check if geolocation is supported
    if (!navigator.geolocation) {
      setError('Geolokasjon støttes ikke av denne nettleseren.');
      setLoading(false);
      return;
    }
    
    setMode('gps');
    setLoading(true);
    setError(null);
    setQuery('');
    setFerryStops([]);
    setHasInteracted(false);
    setSelectedStop(null);
    
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLocation({ latitude, longitude });
        
        // Get location name using Google Maps reverse geocoding
        try {
          if (!config.GOOGLE_MAPS_CONFIG.isConfigured()) {
            throw new Error('API key not configured');
          }
          
          const geocodingUrl = config.GOOGLE_MAPS_CONFIG.getGeocodingUrl(latitude, longitude);
          
          console.log('🌍 Fetching location name from Google Maps API');
          
          const response = await fetch(geocodingUrl, {
            method: 'GET',
            headers: {
              'Accept': 'application/json'
            },
            signal: AbortSignal.timeout(10000) // 10 second timeout
          });
          
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          
          const data = await response.json();
          console.log('🌍 Google Maps geocoding response:', data);
          
          if (data.status !== 'OK') {
            console.error('🌍 Google Maps API error:', data.status, data.error_message);
            throw new Error(`Google Maps API error: ${data.status}`);
          }
          
          if (data.results && data.results.length > 0) {
            const locationName = extractLocationName(data);
            console.log('🌍 Extracted location name:', locationName);
            setLocationName(locationName);
          } else {
            console.log('🌍 No results in response, using fallback');
            setLocationName('Ukjent plassering');
          }
        } catch (error) {
          console.error('🌍 Failed to get location name:', error);
          
          // Fallback to user-friendly coordinates
          const latDeg = Math.abs(latitude);
          const lonDeg = Math.abs(longitude);
          const latDir = latitude >= 0 ? 'N' : 'S';
          const lonDir = longitude >= 0 ? 'E' : 'W';
          
          setLocationName(`${latDeg.toFixed(2)}°${latDir}, ${lonDeg.toFixed(2)}°${lonDir}`);
        }
        
        // Hent fergekaier med neste avgang
        try {
          const data = await client.request(NEARBY_QUERY, { latitude, longitude });
          const places = [];
          const seenIds = new Set();
          
          console.log('GPS: nearest edges count =', data.nearest?.edges?.length || 0);
          for (const e of data.nearest.edges) {
            const { place, distance } = e.node;
            if (place && place.id && !seenIds.has(place.id)) {
              // Ikke ekskluder på navn i GPS-modus – behold alle vann-knutepunkter for å sikre at relevante kaier ikke faller bort
              const name = (place.name || '').toLowerCase();
              console.log('GPS candidate:', { id: place.id, name: place.name, distance, submode: place.transportSubmode });
              // Hent alle avganger for denne fergekaien
              let nextDeparture = null;
              let allDepartures = [];
              try {
                const depData = await client.request(DEPARTURES_QUERY, { id: place.id });
                const calls = depData.stopPlace?.estimatedCalls || [];
                const filteredCalls = calls
                  .filter((call) => {
                    const line = call.serviceJourney?.journeyPattern?.line;
                    return line && line.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY;
                  })
                  .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
                
                allDepartures = filteredCalls;
                if (filteredCalls.length > 0) {
                  nextDeparture = filteredCalls[0]; // Kun neste avgang
                }
                
                // Lagre alle avganger i departuresMap
                setDeparturesMap(prev => ({
                  ...prev,
                  [place.id]: filteredCalls
                }));
              } catch {
                // Ignorer feil for individuelle fergekaier
              }
              
              places.push({
                id: place.id,
                name: place.name,
                distance: distance,
                latitude: place.latitude,
                longitude: place.longitude,
                nextDeparture: nextDeparture
              });
              seenIds.add(place.id);
            }
          }
          
          // Sorter etter avstand stigende
          places.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

          // Generell fallback: suppler med fergekaier fra allFerryStops innen radius som mangler i nearest
          if (Array.isArray(allFerryStops) && allFerryStops.length > 0) {
            try {
              const computed = allFerryStops
                .map(s => {
                  const dLat = (s.latitude - latitude) * 111000;
                  const dLng = (s.longitude - longitude) * 111000 * Math.cos(latitude * Math.PI / 180);
                  const approxDistance = Math.sqrt(dLat * dLat + dLng * dLng);
                  return { stop: s, approxDistance };
                })
                .filter(({ stop, approxDistance }) => approxDistance <= NEARBY_SEARCH_CONFIG.maximumDistance && !seenIds.has(stop.id))
                .sort((a, b) => a.approxDistance - b.approxDistance)
                .slice(0, 50); // begrens fallbackmengde for ytelse

              for (const { stop: cand, approxDistance } of computed) {
                let nextDeparture = null;
                try {
                  const depData = await client.request(DEPARTURES_QUERY, { id: cand.id });
                  const calls = depData.stopPlace?.estimatedCalls || [];
                  const filteredCalls = calls
                    .filter((call) => {
                      const line = call.serviceJourney?.journeyPattern?.line;
                      return line && line.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY;
                    })
                    .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
                  
                  if (filteredCalls.length > 0) {
                    nextDeparture = filteredCalls[0];
                  }
                  
                  // Lagre alle avganger i departuresMap
                  setDeparturesMap(prev => ({
                    ...prev,
                    [cand.id]: filteredCalls
                  }));
                } catch {}

                places.push({
                  id: cand.id,
                  name: cand.name,
                  distance: approxDistance,
                  latitude: cand.latitude,
                  longitude: cand.longitude,
                  nextDeparture
                });
                seenIds.add(cand.id);
              }
              console.log('GPS: added fallback candidates count =', computed.length);
            } catch {}
          }

          // Prioriter kun steder med faktisk lokale bilferge-avganger
          const withDepartures = places.filter(p => !!p.nextDeparture);
          const finalPlaces = withDepartures.length > 0 ? withDepartures : places;
          
          // Begrens antall resultater i GPS-visning til maksimalt 5 fergekaier
          const limitedPlaces = finalPlaces.slice(0, 5);

          const hasKrokeide = limitedPlaces.some(p => (p.name || '').toLowerCase().includes('krokeide'));
          console.log('GPS: includes Krokeide after fallback?', hasKrokeide);

          setFerryStops(limitedPlaces);
          setHasInteracted(true);
          
          // Automatisk utvid det første kortet hvis vi har resultater
          if (limitedPlaces.length > 0) {
            setSelectedStop(limitedPlaces[0].id);
            
            // Calculate driving times if feature is enabled
            if (showDrivingTimes) {
              await calculateDrivingTimesForExistingStops();
            }
            
            // Hent alle avganger for det første kortet automatisk
            const firstStop = limitedPlaces[0];
            try {
              const data = await client.request(DEPARTURES_QUERY, { id: firstStop.id });
              const calls = data.stopPlace.estimatedCalls || [];
              
              // Filter and sort departures
              const filteredCalls = calls
                .filter(call => call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY)
                .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));

              setDeparturesMap(prev => ({
                ...prev,
                [firstStop.id]: filteredCalls
              }));
            } catch (err) {
              console.error('Error fetching departures for first card:', err);
            }
            

          }
        } catch (err) {
          setError('Kunne ikke hente fergekaier');
          console.error('Error fetching ferry stops:', err);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        console.error('❌ Geolocation error details:', err);
        
        let errorMessage = 'Kunne ikke hente posisjon.';
        
        if (err.code) {
          switch (err.code) {
            case 1:
              errorMessage = 'Tilgang til posisjon ble avvist. Vennligst tillat posisjon i innstillingene.';
              break;
            case 2:
              errorMessage = 'Posisjon kunne ikke bestemmes. Sjekk internettforbindelsen.';
              break;
            case 3:
              errorMessage = 'Timeout ved henting av posisjon. Prøv igjen.';
              break;
            default:
              errorMessage = `Posisjonsfeil (kode ${err.code}): ${err.message || 'Ukjent feil'}`;
          }
        } else if (err.message) {
          errorMessage = `Posisjonsfeil: ${err.message}`;
        }
        
        console.error('❌ Geolocation error message:', errorMessage);
        
        // Ikke vis GPS-feilmelding hvis brukeren allerede har startet å søke
        if (mode !== 'search' && !query.trim()) {
          setError(errorMessage);
        }
        setLoading(false);
      },
      GEOLOCATION_OPTIONS
    );
  };



  // Funksjon for å beregne kjøretider for eksisterende fergekaier
  const calculateDrivingTimesForExistingStops = async () => {
    if (!location || !ferryStops.length) {
      return;
    }
    
    const startCoords = { lat: location.latitude, lng: location.longitude };
    
    for (const stop of ferryStops) {
      const stopId = stop.id;
      setDrivingTimesLoading(prev => ({ ...prev, [stopId]: true }));
      
      const endCoords = { lat: stop.latitude, lng: stop.longitude };
      
      try {
        // Bruk Google Maps API for mer nøyaktige kjøretider
        const drivingTime = await calculateDrivingTime(startCoords, endCoords);
        
        setDrivingTimes(prev => ({
          ...prev,
          [stopId]: drivingTime
        }));
      } catch (error) {
        // Fallback til estimert tid med mer realistiske hastigheter
        const distance = Math.sqrt(
          Math.pow((endCoords.lat - startCoords.lat) * 111000, 2) + 
          Math.pow((endCoords.lng - startCoords.lng) * 111000 * Math.cos(startCoords.lat * Math.PI / 180), 2)
        );
        
        // Mer realistiske hastigheter basert på avstand og terreng
        let averageSpeedKmh;
        if (distance < 1000) {
          averageSpeedKmh = 30; // Bykjøring for korte avstander (trafikk, lyskryss)
        } else if (distance < 5000) {
          averageSpeedKmh = 40; // Forstadsområde (fartsgrense 50-60)
        } else if (distance < 20000) {
          averageSpeedKmh = 50; // Landevei (fartsgrense 60-80)
        } else {
          averageSpeedKmh = 60; // Hovedvei (fartsgrense 80-90)
        }
        
        const estimatedTime = Math.max(1, Math.round((distance / 1000) / averageSpeedKmh * 60));
        
        setDrivingTimes(prev => ({
          ...prev,
          [stopId]: estimatedTime
        }));
      } finally {
        setDrivingTimesLoading(prev => ({ ...prev, [stopId]: false }));
      }
    }
  };

  const getDepartureTimeColor = (departureTime, drivingTime) => {
    if (!showDrivingTimes || !drivingTime || mode !== 'gps') return 'text-green-600'; // Default green when disabled
    
    const timeToDeparture = calculateTimeDiff(departureTime);
    const canMakeIt = timeToDeparture > drivingTime;
    const margin = timeToDeparture - drivingTime;
    
    if (!canMakeIt) return 'text-red-600';
    if (margin < 5) return 'text-red-500'; // Rød for små marginer
    if (margin < 15) return 'text-yellow-600'; // Gul for moderate marginer
    return 'text-green-600'; // Grønn for gode marginer
  };

  // Funksjon for å beregne optimal font-størrelse basert på tekstlengde
  const getOptimalFontSize = (text, maxWidth = 320) => {
    if (!text) return '1.5rem'; // Standard størrelse
    
    // For destinasjonstekster (små felter)
    if (maxWidth === 96) {
      const baseSize = 14; // Standard størrelse for destinasjoner
      const maxLength = 12; // Antall tegn før vi begynner å redusere størrelsen
      
      if (text.length <= maxLength) {
        return '0.875rem'; // Behold standard størrelse (14px)
      }
      
      // Beregn redusert størrelse basert på tekstlengde
      const reduction = Math.min((text.length - maxLength) * 0.6, 4); // Maks 4px reduksjon
      const newSize = Math.max(baseSize - reduction, 10); // Minimum 10px
      
      return `${newSize}px`;
    }
    
    // For fergekaikort-navn (store felter)
    const baseSize = 24; // 1.5rem = 24px
    const maxLength = 25; // Antall tegn før vi begynner å redusere størrelsen
    
    if (text.length <= maxLength) {
      return '1.5rem'; // Behold standard størrelse
    }
    
    // Beregn redusert størrelse basert på tekstlengde
    const reduction = Math.min((text.length - maxLength) * 0.8, 8); // Maks 8px reduksjon
    const newSize = Math.max(baseSize - reduction, 16); // Minimum 16px (1rem)
    
    return `${newSize}px`;
  };



    // New function to load inline destination departures
  const loadInlineDestinationDepartures = async (parentStopId, destinationText) => {
    let candidate = null;
    try {
      console.log('loadInlineDestinationDepartures called with:', { parentStopId, destinationText });
      
      // Sjekk om denne spesifikke destinasjonen allerede er lastet
      const existingDestinations = inlineDestinations[parentStopId] || [];
      const alreadyLoaded = existingDestinations.some(dest => {
        const destName = normalizeText(cleanDestinationText(dest.name || '')).toLowerCase();
        const targetName = normalizeText(cleanDestinationText(destinationText || '')).toLowerCase();
        return destName === targetName;
      });
      
      if (alreadyLoaded) {
        console.log('Destination times already loaded for:', parentStopId, '->', destinationText);
        return;
      }

      if (!destinationText || !Array.isArray(allFerryStops) || allFerryStops.length === 0) return;
      
      const norm = (s) => normalizeText(cleanDestinationText(s || '')).toLowerCase();
      const target = norm(destinationText);
      const originalTarget = cleanDestinationText(destinationText || '').toLowerCase();
      
      console.log('Looking for destination:', destinationText, 'normalized:', target);
      
      // Forbedret matching-logikk med vanlige feil
      const candidates = allFerryStops.filter(s => {
        const sNormName = norm(s.name);
        const sOrigName = cleanDestinationText(s.name || '').toLowerCase();
        
        // Vanlige feil og varianter
        const commonErrors = {
          'oppdal': 'oppedal',
          'oppedal': 'oppdal',
          'lavik': 'lavik',
          'magerholm': 'magerholm',
          'sykkylven': 'sykkylven',
          'standal': 'standal',
          'sæbø': 'sæbø',
          'trandal': 'trandal',
          'solavågen': 'solavågen',
          'solavagen': 'solavågen'
        };
        
        const correctedTarget = commonErrors[target] || target;
        
        // Fjern "kai" og "ferjekai" for bedre matching
        const cleanTarget = target.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanSNormName = sNormName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanSOrigName = sOrigName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanOrigTarget = originalTarget.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        
        // Mer presis matching - prioritere eksakte matches (både normalisert og original)
        const exactMatchNorm = cleanSNormName === cleanTarget;
        const exactMatchOrig = cleanSOrigName === cleanOrigTarget;
        const startsWithMatchNorm = cleanSNormName.startsWith(cleanTarget) || cleanTarget.startsWith(cleanSNormName);
        const startsWithMatchOrig = cleanSOrigName.startsWith(cleanOrigTarget) || cleanOrigTarget.startsWith(cleanSOrigName);
        const containsMatchNorm = cleanSNormName.includes(cleanTarget) || cleanTarget.includes(cleanSNormName);
        const containsMatchOrig = cleanSOrigName.includes(cleanOrigTarget) || cleanOrigTarget.includes(cleanSOrigName);
        
        const exactMatch = exactMatchNorm || exactMatchOrig;
        const startsWithMatch = startsWithMatchNorm || startsWithMatchOrig;
        const containsMatch = containsMatchNorm || containsMatchOrig;
        
        // Logg alle potensielle matches for debugging
        if (exactMatch || startsWithMatch || containsMatch) {
          console.log('Found match:', s.name, 'for target:', target, 'exact:', exactMatch, 'startsWith:', startsWithMatch, 'contains:', containsMatch);
          return true;
        }
        return false;
      });
      
      // Velg den beste matchen med prioritet
      candidate = candidates.find(s => {
        const sNormName = norm(s.name);
        const sOrigName = cleanDestinationText(s.name || '').toLowerCase();
        const cleanTarget = target.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanOrigTarget = originalTarget.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanSNormName = sNormName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanSOrigName = sOrigName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        return cleanSNormName === cleanTarget || cleanSOrigName === cleanOrigTarget; // Eksakt match
      }) || candidates.find(s => {
        const sNormName = norm(s.name);
        const sOrigName = cleanDestinationText(s.name || '').toLowerCase();
        const cleanTarget = target.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanOrigTarget = originalTarget.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanSNormName = sNormName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanSOrigName = sOrigName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        return (cleanSNormName.startsWith(cleanTarget) || cleanTarget.startsWith(cleanSNormName)) ||
               (cleanSOrigName.startsWith(cleanOrigTarget) || cleanOrigTarget.startsWith(cleanSOrigName)); // StartsWith match
      }) || candidates[0]; // Fallback til første match
      
      if (!candidate) {
        console.log('No match found for:', target);
        console.log('Available stops:', allFerryStops.map(s => norm(s.name)).slice(0, 10));
        return;
      }
      
      console.log('Selected candidate:', candidate.name, 'from', candidates.length, 'candidates');
      console.log('All candidates:', candidates.map(c => c.name));

      setCardLoading(prev => ({ ...prev, [`${parentStopId}-${candidate.id}`]: true }));
      const data = await client.request(DEPARTURES_QUERY, { id: candidate.id });
      const calls = data.stopPlace?.estimatedCalls || [];
      
      // Hent navnet på hovedfergekaien for sammenligning
      const parentStopName = allFerryStops.find(s => s.id === parentStopId)?.name || '';
      
      // Finn avganger som går tilbake til hovedfergekaien
      console.log('Total departures from', candidate.name, ':', calls.length);
      console.log('Parent stop name:', parentStopName);
      
      const filteredCalls = calls
        .filter(call => {
          // Sjekk at det er en lokal bilferge
          const isLocalCarFerry = call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY;
          
          // Sjekk at destinasjonen matcher hovedfergekaien
          const destinationText = call.destinationDisplay?.frontText;
          const normDestination = normalizeText(cleanDestinationText(destinationText || '')).toLowerCase();
          const normParentStop = normalizeText(cleanDestinationText(parentStopName || '')).toLowerCase();
          
          console.log('Checking departure:', destinationText, 'normalized:', normDestination, 'against parent stop:', parentStopName, 'normalized:', normParentStop, 'ferry:', isLocalCarFerry, 'match:', normDestination === normParentStop);
          
          return isLocalCarFerry && normDestination === normParentStop;
        })
        .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime))
        .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }));
      
      console.log('Filtered departures:', filteredCalls.length);

      // Fallback: hvis ingen avganger matcher, vis alle avganger for debugging
      const finalCalls = filteredCalls.length > 0 ? filteredCalls : calls
        .filter(call => call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY)
        .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime))
        .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }));

      if (filteredCalls.length === 0) {
        console.log('No matching departures found, showing all departures as fallback');
      }

      setInlineDestinations(prev => {
        const existingDestinations = prev[parentStopId] || [];
        
        // Sjekk om denne stopId allerede eksisterer
        const stopIdExists = existingDestinations.some(dest => dest.stopId === candidate.id);
        if (stopIdExists) {
          console.log('StopId already exists:', candidate.id, 'skipping duplicate');
          return prev;
        }
        
        const newDestination = {
          stopId: candidate.id,
          name: candidate.name,
          departures: finalCalls
        };
        
        const newInlineDestinations = {
          ...prev,
          [parentStopId]: [...existingDestinations, newDestination]
        };
        console.log('Setting inline destinations:', newInlineDestinations);
        return newInlineDestinations;
      });
    } catch (error) {
      console.error('Error loading inline destination departures:', error);
    } finally {
      if (candidate) {
        setCardLoading(prev => ({ ...prev, [`${parentStopId}-${candidate.id}`]: false }));
      }
    }
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'Escape':
        setQuery('');
        setFerryStops([]);
        setHasInteracted(false);
        setSelectedStop(null);
        setDrivingTimes({});
        setDrivingTimesLoading({});
        setShowDrivingTimes(false); // Deaktiver kjøretidsberegning
        break;
      case 'Enter':
        // Lukk tastaturet på mobil ved å fjerne fokus fra input-feltet
        if (searchInputRef.current) {
          searchInputRef.current.blur();
        }
        break;
    }
  };

  return (
    <>
      <div className="bg-gradient flex flex-col items-center min-h-screen pb-16 sm:pb-24 pt-20 sm:pt-24">
        <h1 className="text-5xl sm:text-7xl font-extrabold text-white tracking-tight mb-6 sm:mb-6 drop-shadow-lg fergetid-title">{APP_NAME}</h1>
      
        {/* Hidden input to catch iOS auto-focus */}
        <input 
          type="text" 
          style={{ position: 'absolute', left: '-9999px', opacity: 0, pointerEvents: 'none' }}
          tabIndex="-1"
          readOnly
        />
        
        {/* Search Section */}
        <div className="w-full max-w-[350px] sm:max-w-md mb-8 sm:mb-8 px-3 sm:px-4">
          <div className="flex gap-2">
            {showSearchInput ? (
              <div className="flex-1 relative">
                <form autoComplete="off" onSubmit={e => e.preventDefault()}>
                  <input
                    ref={searchInputRef}
                    type="text"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck="false"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      // Fjern ALLE feilmeldinger når brukeren skriver
                      if (error) {
                        setError(null);
                      }
                      // Sett mode til search så snart brukeren skriver noe
                      if (e.target.value.trim()) {
                        setMode('search');
                        setShowDrivingTimes(false); // Deaktiver kjøretidsberegning i søk-modus
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Søk fergekai eller klikk GPS"
                    className="w-full px-4 py-3 rounded-lg bg-white/90 backdrop-blur-md shadow-lg border border-fuchsia-200 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
                    style={{
                      position: /iPad|iPhone|iPod/.test(navigator.userAgent) && !showSearchInput ? 'absolute' : 'relative',
                      left: /iPad|iPhone|iPod/.test(navigator.userAgent) && !showSearchInput ? '-9999px' : 'auto',
                      opacity: /iPad|iPhone|iPod/.test(navigator.userAgent) && !showSearchInput ? 0 : 1,
                      pointerEvents: /iPad|iPhone|iPod/.test(navigator.userAgent) && !showSearchInput ? 'none' : 'auto'
                    }}
                    onFocus={() => {
                      // Fjern feilmelding når brukeren fokuserer på søkefeltet
                      if (error) {
                        setError(null);
                      }
                      // Ensure input is fully visible and focused when user clicks on it
                      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !showSearchInput) {
                        setShowSearchInput(true);
                        setTimeout(() => searchInputRef.current?.focus(), 100);
                      }
                    }}
                  />
                </form>
              </div>
            ) : (
              <div className="flex-1">
                <button
                  onClick={() => {
                    setShowSearchInput(true);
                    // Fjern feilmelding når brukeren klikker på søk
                    if (error) {
                      setError(null);
                    }
                    // Auto-focus input after a short delay to ensure it's visible
                    setTimeout(() => searchInputRef.current?.focus(), 150);
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-white/90 backdrop-blur-md shadow-lg border border-fuchsia-200 hover:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200 text-left text-gray-600"
                >
                  Søk fergekai eller klikk GPS
                </button>
              </div>
            )}
            
            <button
              ref={gpsButtonRef}
              type="button"
              onClick={handleGPSLocation}
              className="px-4 py-3 bg-white/90 hover:bg-white backdrop-blur-md text-fuchsia-600 font-semibold rounded-lg shadow-lg transition-colors border border-fuchsia-200 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
              title="Bruk GPS-plassering"
            >
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="currentColor" 
                className="text-fuchsia-600"
              >
                {/* Outer circle */}
                <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
                {/* Inner circle */}
                <circle cx="12" cy="12" r="4" fill="currentColor"/>
                {/* Crosshair lines - top */}
                <line x1="12" y1="0" x2="12" y2="4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                {/* Crosshair lines - bottom */}
                <line x1="12" y1="20" x2="12" y2="24" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                {/* Crosshair lines - left */}
                <line x1="0" y1="12" x2="4" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                {/* Crosshair lines - right */}
                <line x1="20" y1="12" x2="24" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        {/* GPS Location Display */}
        {mode === 'gps' && locationName && (
          <div className="text-base sm:text-lg text-white mb-4 text-center px-3">
            Din posisjon er <span className="font-bold">{locationName}</span>
          </div>
        )}

        {/* Toggle for kjøretidsberegning - kun synlig i GPS-modus når fergekaier er lastet (skjult i web) */}
        {isIOS && mode === 'gps' && hasInteracted && ferryStops.length > 0 && (
          <div className="w-full max-w-[350px] sm:max-w-md mb-4 px-3 sm:px-4 flex justify-center items-center gap-3">
            <span className="text-white text-sm font-medium">Beregn kjøretid</span>
            <button
              onClick={async () => {
                // Sjekk om brukeren har kjøpt funksjonen
                const purchaseStatus = inAppPurchaseService.getPurchaseStatus();
                
                if (!purchaseStatus?.isPurchased) {
                  // Vis purchase modal
                  // For nå, simulerer vi en kjøp for testing
                  try {
                    await inAppPurchaseService.purchase();
                    setShowDrivingTimes(true);
                    await calculateDrivingTimesForExistingStops();
                  } catch (error) {
                    console.error('Purchase failed:', error);
                  }
                } else {
                  // Brukeren har allerede kjøpt funksjonen
                  const newState = !showDrivingTimes;
                  setShowDrivingTimes(newState);
                  if (newState && mode === 'gps') {
                    await calculateDrivingTimesForExistingStops();
                  }
                }
              }}
              className={`relative inline-flex items-center h-6 rounded-full transition-all duration-300 ease-in-out w-12 border ${
                showDrivingTimes 
                  ? 'border-white bg-transparent' 
                  : 'border-gray-300 bg-transparent'
              }`}
            >
              <span className={`absolute w-5 h-5 rounded-full shadow-sm transition-all duration-300 ease-in-out ${
                showDrivingTimes 
                  ? 'bg-white right-0.5' 
                  : 'bg-gray-300 left-0.5'
              }`}></span>
            </button>
          </div>
        )}

        {/* Loading and Error States */}
        <div 
          style={{ 
            minHeight: (loading || !ferryStopsLoaded) ? '150px' : '0px',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            transition: 'min-height 0.3s ease-out',
            overflow: 'hidden'
          }}
        >
          {(loading || !ferryStopsLoaded) && (
            <LoadingSpinner 
              message={!ferryStopsLoaded ? "Laster fergekaier..." : "Laster posisjon og fergekaier..."} 
            />
          )}
        </div>
        {error && (
          <div className="text-center text-white bg-red-500/20 p-4 rounded-lg mb-6 border border-red-300/30">
            {error}
          </div>
        )}

        {/* Results */}
        {hasInteracted && !loading && ferryStops.length > 0 && (
          <div 
            className="w-full max-w-[350px] sm:max-w-md space-y-10 sm:space-y-12 px-3 sm:px-4 sm:px-0 mx-auto"
            style={{
              opacity: 1,
              transition: 'opacity 0.3s ease-out',
              animation: 'fadeIn 0.3s ease-out'
            }}
          >
            {ferryStops.map((stop, i) => {
              // Handle both GPS format (with nextDeparture) and search format (with departures array)
              const isGPSFormat = stop.nextDeparture !== undefined;
              const isSearchFormat = stop.departures !== undefined;
              const stopData = stop; // Samme format for begge nå
              const distance = stop.distance;
              const departures = isGPSFormat ? (departuresMap[stop.id] || []) : 
                                isSearchFormat ? (stop.departures || []) : 
                                (departuresMap[stop.id] || []);
              const now = new Date();
              
              // Find the next and later departures
              let nextDeparture = null;
              let laterDepartures = [];
              
              if (isGPSFormat && stop.nextDeparture) {
                // GPS-format: bruk nextDeparture som allerede er hentet
                nextDeparture = { ...stop.nextDeparture, aimed: new Date(stop.nextDeparture.aimedDepartureTime) };
                
                // Bruk departuresMap for senere avganger hvis tilgjengelig
                if (departuresMap[stop.id]) {
                  const sortedCalls = departuresMap[stop.id]
                    .filter(dep => dep.aimedDepartureTime)
                    .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }))
                    .sort((a, b) => a.aimed - b.aimed);
                  
                  if (sortedCalls.length > 1) {
                    // Ta de neste 4 avgangene (ekskluder neste avgang)
                    laterDepartures = sortedCalls.slice(1, 5);
                  }
                }
              } else if (departures && departures.length > 0) {
                // Søk-format: finn neste avgang fra departures
                const sortedCalls = departures
                  .filter(dep => dep.aimedDepartureTime)
                  .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }))
                  .sort((a, b) => a.aimed - b.aimed);
                if (sortedCalls.length > 0) {
                  nextDeparture = sortedCalls.find(c => c.aimed > now) || sortedCalls[0];
                  const nextIdx = sortedCalls.indexOf(nextDeparture);
                  // Ta de neste 4 avgangene (inkludert neste dags avganger)
                  laterDepartures = sortedCalls.slice(nextIdx + 1, nextIdx + 5);
                }
              }

              return (
                <div key={stopData.id + '-' + (distance || '')} className="flex flex-col">
                  {/* Km-avstand som egen boks over fergekortet */}
                  {distance && (
                    <div className="bg-blue-500 text-white text-base font-bold px-2 py-1.5 rounded-full shadow-lg mb-[-10px] self-start relative z-20 -ml-2">
                      {formatDistance(distance)}
                    </div>
                  )}
                  
                  <div
                    id={`ferry-card-${stopData.id}`}
                    className={`relative ${distance ? 'rounded-tr-2xl rounded-br-2xl rounded-bl-2xl' : 'rounded-2xl'} p-4 sm:p-5 card-expand w-full max-w-[350px] sm:max-w-md bg-white shadow-lg border border-gray-200`}
                    style={{ minWidth: '280px' }}
                  >
                    <h2 
                      className="ferry-quay-name"
                      style={{ 
                        fontSize: getOptimalFontSize(cleanDestinationText(stopData.name || '')),
                        lineHeight: '1.2'
                      }}
                    >
                      {cleanDestinationText(stopData.name || '')}
                    </h2>
                    <hr className="border-gray-300 my-2" />
                    
                    {/* Kjøretidsbeskrivelse rett etter fergekainavn */}
                    {showDrivingTimes && mode === 'gps' && drivingTimes[stopData.id] && (
                      <div className="mt-2 text-sm text-gray-600 leading-relaxed">
                        <div dangerouslySetInnerHTML={{
                          __html: generateTravelDescription(
                            distance,
                            drivingTimes[stopData.id],
                            nextDeparture ? calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed) : 0,
                            departures
                          )
                        }} />
                      </div>
                    )}
                  
                  {nextDeparture ? (
                    <>
                                              <div className="mt-2 text-base sm:text-lg mb-6">
                          <ul className="space-y-0">
                          {(() => {
                            // Kombiner neste avgang og senere avganger til en liste
                            const allDepartures = [nextDeparture, ...laterDepartures].filter(Boolean);
                            return allDepartures.slice(0, 6).map((dep, idx) => {
                              const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                              return (
                                <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-0.5 leading-snug">
                                  <span className="font-bold w-16 text-left text-sm">
                                    {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="flex-1 flex justify-start items-center gap-1">
                                    <span className={`text-sm font-bold align-middle whitespace-nowrap pl-4 ${getDepartureTimeColor(dep.aimedDepartureTime || dep.aimed, drivingTimes[stopData.id])}`}>
                                      {formatMinutes(mins)}
                                    </span>
                                  </span>
                                  <span 
                                    className="w-24 text-gray-700 text-right font-semibold"
                                    style={{ 
                                      fontSize: getOptimalFontSize(cleanDestinationText(dep.destinationDisplay?.frontText), 96) // 96px = 6rem = w-24
                                    }}
                                  >
                                    {cleanDestinationText(dep.destinationDisplay?.frontText)}
                                  </span>
                                </li>
                              );
                            });
                          })()}
                        </ul>
                                              </div>
                        
                        
                        
                        
                      


                      {console.log('Rendering ferry card for:', stopData.id, 'inlineDestinations:', inlineDestinations) || null}
                      {inlineDestinations[stopData.id] && inlineDestinations[stopData.id].map((destination, destIndex) => (
                          <div key={`${stopData.id}-${destination.stopId}`} className="mt-5 p-4 sm:p-5 rounded-lg bg-gray-100/80 backdrop-blur-md shadow-lg relative">
                          <div className="bg-purple-100 text-purple-700 text-sm font-bold px-2 py-1 rounded-full shadow-lg absolute top-[-10px] left-0 z-20">
                            Retur
                          </div>
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">
                              {cleanDestinationText(destination.name)}
                            </h3>
                          </div>
                          <hr className="border-gray-300 my-2" />
                          <div className="mt-2 text-base sm:text-lg">
                            <ul className="space-y-0">
                              {destination.departures.slice(0, 6).map((dep, idx) => {
                                const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                                return (
                                  <li key={`inline-${destination.stopId}-${dep.aimedDepartureTime}-${idx}`} className="flex items-center py-0.5 leading-snug">
                                    <span className="font-bold w-16 text-left text-sm">
                                      {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="flex-1 flex justify-start items-center gap-1">
                                      <span className="text-sm font-bold align-middle whitespace-nowrap pl-1 text-green-600">
                                        {formatMinutes(mins)}
                                      </span>
                                    </span>
                                    <span 
                                      className="w-24 text-gray-700 text-right font-semibold"
                                      style={{ 
                                        fontSize: getOptimalFontSize(cleanDestinationText(dep.destinationDisplay?.frontText), 96)
                                      }}
                                    >
                                      {cleanDestinationText(dep.destinationDisplay?.frontText)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        </div>
                      ))}

                    </>
                  ) : (
                    <p className="mt-2 text-sm text-gray-500">Ingen avganger funnet</p>
                  )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* No results */}
        {hasInteracted && !loading && ferryStops.length === 0 && (
          <div className="text-center text-white bg-white/10 p-8 rounded-lg border border-white/20">
            {mode === 'search' 
              ? 'Ingen fergekaier funnet for søket ditt'
              : 'Ingen fergekaier funnet i nærheten'
            }
          </div>
        )}
      </div>
    </>
  );
}

export default App;

