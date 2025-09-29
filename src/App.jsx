import { useEffect, useState, useRef } from 'react';
import { GraphQLClient, gql } from 'graphql-request';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { Geolocation } from '@capacitor/geolocation';

import LoadingSpinner from './components/LoadingSpinner';
import LegalModal from './components/LegalModal';


import { calculateDrivingTime } from './services/GeoServices';
import { 
  ENTUR_ENDPOINT, 
  TRANSPORT_MODES, 
  APP_NAME,
  GEOLOCATION_OPTIONS,
  EXCLUDED_SUBMODES,
  PASSENGER_FERRY_SUBMODES
} from './config/constants';
import { config } from './config/config';
import { 
  formatMinutes, 
  formatDistance, 
  calculateTimeDiff,
  cleanDestinationText,
  extractLocationName,
  normalizeText
} from './utils/helpers';
import {
  getDepartureTimeColor,
  isDepartureMissed,
  getOptimalFontSize,
  formatDepartureTime,
  sortDeparturesByTime,
  filterFutureDepartures,
  getNextDeparture,
  getLaterDepartures,
  generateTravelDescription
} from './utils/departureUtils';

// IAP fjernet: ingen PurchasesService brukt

import { 
  getConnectedFerryQuays,
  getSpecialFerryConnections 
} from './utils/ferryConnections';
// Removed legacy routeMap import; using only Entur hierarchy-based matching

// Hjelpefunksjon for å bestemme hvor mange avganger som skal hentes basert på kjøretid
const getDepartureQueryParams = (drivingTimeMinutes = 0) => {
  // Hvis kjøretid > 2 timer, hent flere avganger over lengre tidsramme
  if (drivingTimeMinutes > 120) {
    return {
      timeRange: 86400, // 24 timer
      numberOfDepartures: 50
    };
  }
  // Standard: hent færre avganger over kortere tidsramme
  return {
    timeRange: 43200, // 12 timer
    numberOfDepartures: 20
  };
};

const client = new GraphQLClient(ENTUR_ENDPOINT, {
  headers: { 'ET-Client-Name': config.ENTUR_CLIENT_NAME }
});



const DEPARTURES_QUERY = gql`
  query StopPlaceDepartures($id: String!, $timeRange: Int!, $numberOfDepartures: Int!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(timeRange: $timeRange, numberOfDepartures: $numberOfDepartures) {
        aimedDepartureTime
        destinationDisplay { frontText }
        serviceJourney {
          journeyPattern { line { transportSubmode } }
        }
      }
    }
  }
`;



// Enhanced departures query with journeyPattern data for better matching
const ENHANCED_DEPARTURES_WITH_PATTERNS_QUERY = gql`
  query EnhancedDeparturesWithPatterns($id: String!, $timeRange: Int!, $numberOfDepartures: Int!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(timeRange: $timeRange, numberOfDepartures: $numberOfDepartures) {
        aimedDepartureTime
        expectedDepartureTime
        destinationDisplay {
          frontText
          via
        }
        serviceJourney {
          id
          journeyPattern {
            id
            directionType
            line {
              id
              name
              publicCode
              transportMode
              transportSubmode
              operator {
                id
                name
              }
              quays {
                id
                name
                publicCode
                latitude
                longitude
                stopPlace {
                  id
                  name
                }
              }
            }
          }
          wheelchairAccessible
          notices {
            id
            text
          }
        }
        cancellation
        predictionInaccurate
        situations {
          id
          reportType
        }
      }
    }
  }
`;

// Enhanced query to get line details with quays
const LINE_WITH_QUAYS_QUERY = gql`
  query LineWithQuays($id: ID!) {
    line(id: $id) {
      id
      name
      publicCode
      transportMode
      transportSubmode
      quays {
        id
        name
        publicCode
        latitude
        longitude
        stopPlace {
          id
          name
        }
      }
      journeyPatterns {
        id
        directionType
        stopPoints {
          id
          name
          latitude
          longitude
          quays {
            id
            name
            publicCode
            latitude
            longitude
          }
        }
      }
    }
  }
`;

// Query for loading all ferry stops (we'll use quay info from Line.quays for matching)
const ALL_FERRY_STOPS_QUERY = gql`
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
`;

// Manual coordinate overrides for specific StopPlaces
const STOP_COORDINATE_OVERRIDES = {
  'NSR:StopPlace:58755': { // Sulesund ferjekai
    latitude: 62.395646,
    longitude: 6.167937,
  },
};

// Name-based overrides as fallback (normalized to lowercase)
const STOP_COORDINATE_NAME_OVERRIDES = {
  // Sulesund ferjekai override removed
};

function App() {

  

  

  
  // Search state
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const searchInputRef = useRef(null);
  const gpsButtonRef = useRef(null);
  const processedStopsRef = useRef(new Set());

  const [showSearchInput, setShowSearchInput] = useState(!/iPad|iPhone|iPod/.test(navigator.userAgent));

  // Hamburger menu state
  const [showHamburgerMenu, setShowHamburgerMenu] = useState(false);

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
  // IAP fjernet: premiumstatus ikke brukt lenger

  // Mode state
  const [mode, setMode] = useState('search'); // 'search' or 'gps'
  const [ferryStopsLoaded, setFerryStopsLoaded] = useState(false);



  // Cache for all ferry quays (for autocomplete)
  const [allFerryQuays, setAllFerryQuays] = useState([]);

  // Refs for latest values to avoid stale state in async waits
  const ferryStopsLoadedRef = useRef(false);
  const allFerryQuaysRef = useRef([]);
  useEffect(() => { ferryStopsLoadedRef.current = ferryStopsLoaded; }, [ferryStopsLoaded]);
  useEffect(() => { allFerryQuaysRef.current = allFerryQuays; }, [allFerryQuays]);

  // Legal modal state for web
  const [legalModalOpen, setLegalModalOpen] = useState(false);
  const [legalModalUrl, setLegalModalUrl] = useState('');
  const [legalModalTitle, setLegalModalTitle] = useState('');
  // Filter state for ferry categories
  const [filters, setFilters] = useState({
    carFerry: true, // localCarFerry (Bilferge)
    passengerFerry: true // localPassengerFerry (Hurtigbåt)
  });

  // Re-run GPS visning når filter endres
  useEffect(() => {
    if (mode !== 'gps') return;
    // Debounce lett for å unngå dobbeltkall ved hurtige toggles
    const id = setTimeout(() => {
      executeGpsSearch();
    }, 150);
    return () => clearTimeout(id);
  }, [filters, mode]);

      // Driving time calculation state
    const [showDrivingTimes, setShowDrivingTimes] = useState(true); // Alltid på
    const [drivingTimes, setDrivingTimes] = useState({});
    const [drivingDistances, setDrivingDistances] = useState({});
    const [drivingTimesLoading, setDrivingTimesLoading] = useState({});
    const [drivingTimeSources, setDrivingTimeSources] = useState({});
    const [isIOS] = useState(Capacitor.getPlatform() === 'ios');
    

    
    

  

  
  // Inline destinations state - now supports multiple destinations per stop
  const [inlineDestinations, setInlineDestinations] = useState({}); // { [parentStopId]: [{ stopId, name, departures: array }] }
  const liveSearchRequestIdRef = useRef(0);
  
    // Check GPS permission function
  const checkGPSPermission = async () => {
    if (!navigator.geolocation) {
      throw new Error('Geolocation not supported');
    }
    
    // Check if we have permission by trying to get current position with a very short timeout
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Permission check timeout'));
      }, 1000);
      
      navigator.geolocation.getCurrentPosition(
        () => {
          clearTimeout(timeoutId);
          resolve(true);
        },
        (error) => {
          clearTimeout(timeoutId);
          reject(error);
        },
        { enableHighAccuracy: false, timeout: 1000, maximumAge: 600000 }
      );
    });
  };

  // GPS search function - moved outside useEffect for direct calling
  const executeGpsSearch = async () => {
    // Prevent multiple simultaneous GPS searches
    if (loading) {
      return;
    }
    
    setLoading(true);
    setError(null);
    setQuery('');
    setFerryStops([]);
    setDeparturesMap({});
    setHasInteracted(false);
    setSelectedStop(null);
    setMode('gps');

    // Sørg for at fergekaier er i ferd med å lastes om de ikke er det allerede
    try {
      if (!ferryStopsLoaded || !allFerryQuays || allFerryQuays.length === 0) {
        loadAllFerryStops();
      }
    } catch (_) {}

    // Quick-start: use cached last location immediately to render nearby results while fresh GPS resolves
    try {
      const cached = localStorage.getItem('lastLocation');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.latitude && parsed.longitude) {
          // Only trust cache from the last 30 minutes
          const isFresh = typeof parsed.ts === 'number' && (Date.now() - parsed.ts) <= 30 * 60 * 1000;
          if (isFresh) {
            // Ensure ferry quays are loaded before computing (wait up to ~2s) using refs
            const startWait = Date.now();
            while (!ferryStopsLoadedRef.current || !allFerryQuaysRef.current || allFerryQuaysRef.current.length === 0) {
              await new Promise(resolve => setTimeout(resolve, 150));
              if (Date.now() - startWait > 2000) break;
            }
            if (ferryStopsLoadedRef.current && allFerryQuaysRef.current && allFerryQuaysRef.current.length > 0) {
              await computeNearbyAndUpdate(parsed.latitude, parsed.longitude);
            }
            // Don't stop loading yet; allow new GPS fix to overwrite with fresher data
          }
        }
      }
    } catch (_) {}

    // Ikke vent på fergekaier her; start GPS umiddelbart og vent kort senere ved behov

    // Helper to compute nearby stops and update UI based on coordinates
    const computeNearbyAndUpdate = async (latitude, longitude) => {
      setLocation({ latitude, longitude });

      // Non-blocking location name fetch
      (async () => {
        try {
          const geocodingUrl = config.GOOGLE_MAPS_CONFIG.getGeocodingUrl(latitude, longitude);
          if (geocodingUrl) {
            const response = await fetch(geocodingUrl);
            const data = await response.json();
            if (data?.items?.length > 0 || data?.results?.length > 0) {
              setLocationName(extractLocationName(data));
              return;
            }
          }
          // Fallback when URL is missing or no results returned
          const latDeg = Math.abs(latitude);
          const lonDeg = Math.abs(longitude);
          const latDir = latitude >= 0 ? 'N' : 'S';
          const lonDir = longitude >= 0 ? 'E' : 'W';
          const fallbackName = `${latDeg.toFixed(2)}°${latDir}, ${lonDeg.toFixed(2)}°${lonDir}`;
          setLocationName(fallbackName);
        } catch (error) {
          console.error('📍 GPS Search: Error fetching location name:', error);
          const latDeg = Math.abs(latitude);
          const lonDeg = Math.abs(longitude);
          const latDir = latitude >= 0 ? 'N' : 'S';
          const lonDir = longitude >= 0 ? 'E' : 'W';
          const fallbackName = `${latDeg.toFixed(2)}°${latDir}, ${lonDeg.toFixed(2)}°${lonDir}`;
          setLocationName(fallbackName);
        }
      })();
      
      // Ensure ferry quays are loaded; try to load if missing (using refs to avoid stale values)
      if (!allFerryQuaysRef.current || allFerryQuaysRef.current.length === 0) {
        try { await loadAllFerryStops(); } catch (_) {}
        // Wait briefly after triggering load
        const startWaitLoad = Date.now();
        while ((!allFerryQuaysRef.current || allFerryQuaysRef.current.length === 0) && (Date.now() - startWaitLoad) < 8000) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (!allFerryQuaysRef.current || allFerryQuaysRef.current.length === 0) {
          console.error('📍 GPS Search: No ferry quays available for distance calculation');
          setError('Fergekaier er ikke tilgjengelige. Prøv igjen.');
          setLoading(false);
          return;
        }
      }
      
      // Step 1: Calculate simple Haversine distance for ALL quays (fast, no network)
      const placesWithDistance = allFerryQuaysRef.current.map(stop => {
        const dLat = (stop.latitude - latitude) * 111000;
        const dLng = (stop.longitude - longitude) * 111000 * Math.cos(latitude * Math.PI / 180);
        const distance = Math.sqrt(dLat * dLat + dLng * dLng);
        return { ...stop, distance };
      });

      // Filter by distance and sort (global 60 km, finfilter senere pr submode)
      const nearbyCandidates = placesWithDistance
        .filter(p => p.distance <= 60000)
        .sort((a, b) => a.distance - b.distance);

      if (nearbyCandidates.length === 0) {
        setError('Ingen fergekaier funnet innen 60 km fra din posisjon. Prøv å søke manuelt i stedet.');
        setLoading(false);
        return;
      }

      // Step 2: Fetch departures for the closest candidates
      const fetchDepartures = async (place) => {
        const attempt = async () => {
          // For GPS search, use default parameters since we don't have driving time yet
          const queryParams = getDepartureQueryParams();
          const depData = await client.request(DEPARTURES_QUERY, { 
            id: place.id,
            ...queryParams
          });
          const calls = depData.stopPlace?.estimatedCalls || [];
          const departures = calls
            .filter(call => {
              const sub = call.serviceJourney?.journeyPattern?.line?.transportSubmode;
              const allowCar = filters.carFerry && sub === TRANSPORT_MODES.LOCAL_CAR_FERRY;
              const allowPassenger = filters.passengerFerry && PASSENGER_FERRY_SUBMODES.includes(sub);
              return sub && !EXCLUDED_SUBMODES.includes(sub) && (allowCar || allowPassenger);
            })
            .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
          const sub = departures[0]?.serviceJourney?.journeyPattern?.line?.transportSubmode;
          // Hvis passasjerbåt og for langt unna (>10km), hopp over
          if (sub && PASSENGER_FERRY_SUBMODES.includes(sub) && place.distance > 10000) {
            return { ...place, nextDeparture: null, departures: [], submode: sub };
          }
          return { ...place, nextDeparture: departures[0] || null, departures, submode: sub };
        };
        try {
          return await attempt();
        } catch (error) {
          console.error(`📍 GPS Search: Error fetching departures for ${place.name}:`, error);
          await new Promise(r => setTimeout(r, 250));
          try {
            return await attempt();
          } catch (retryError) {
            console.error(`📍 GPS Search: Retry failed for ${place.name}:`, retryError);
            return { ...place, nextDeparture: null, departures: [] };
          }
        }
      };
      
      // Grow search window until we find enough results (handles many nearby water stops without departures)
      const collectedWithDepartures = [];
      const chunkSize = 20; // Reduced from 30
      const maxCandidates = Math.min(nearbyCandidates.length, 100); // Reduced from 200
      
      for (let i = 0; i < maxCandidates && collectedWithDepartures.length < 8; i += chunkSize) { // Increased from 5 to 8
        const chunk = nearbyCandidates.slice(i, i + chunkSize);
        const results = await Promise.all(chunk.map(fetchDepartures));
        for (const res of results) {
          if (res.nextDeparture) {
            collectedWithDepartures.push(res);
          }
        }
      }

      if (collectedWithDepartures.length === 0) {
        setError('Ingen fergekaier med avganger funnet i nærheten. Prøv å søke manuelt i stedet.');
        setLoading(false);
        return;
      }

      // Choose stops that are drivable by road (avoid ferries in routing) and compute their driving times/distances
      // I GPS-funksjonen filtrerer vi bort fergekaier som krever ferge for å komme til
      // Dette er forskjellig fra søkefunksjonen som viser alle fergekaier
      const origin = { lat: latitude, lng: longitude };
      const localDrivingDistances = {}; // Local storage for distances
      
      // Process stops in parallel for better performance
      const stopsToProcess = collectedWithDepartures.slice(0, 8);
      const drivingTimePromises = stopsToProcess.map(async (stop) => {
        try {
          const sub = stop?.nextDeparture?.serviceJourney?.journeyPattern?.line?.transportSubmode || stop?.submode;
          const isPassengerCard = sub && PASSENGER_FERRY_SUBMODES.includes(sub);
          if (isPassengerCard) {
            const distanceMeters = typeof stop.distance === 'number' ? stop.distance : (() => {
              const dLat = (stop.latitude - origin.lat) * 111000;
              const dLng = (stop.longitude - origin.lng) * 111000 * Math.cos(origin.lat * Math.PI / 180);
              return Math.sqrt(dLat * dLat + dLng * dLng);
            })();
            const walkingMinutes = Math.max(1, Math.round((distanceMeters / 1.4) / 60)); // 1.4 m/s ≈ 5 km/t
            return { stop, result: { time: walkingMinutes, distance: distanceMeters, source: 'walking_estimate', hasFerry: false } };
          }
          const result = await calculateDrivingTime(origin, { lat: stop.latitude, lng: stop.longitude }, { roadOnly: true });
          return { stop, result };
        } catch (error) {
          console.error(`📍 GPS Search: Error calculating travel time to ${stop.name}:`, error);
          return { stop, result: null };
        }
      });
      
      const drivingTimeResults = await Promise.all(drivingTimePromises);
      const drivableStops = [];
      
      for (const { stop, result } of drivingTimeResults) {
        if (!result || typeof result.distance !== 'number' || result.distance <= 0) continue;
        const sub = stop?.nextDeparture?.serviceJourney?.journeyPattern?.line?.transportSubmode || stop?.submode;
        const isPassenger = sub && PASSENGER_FERRY_SUBMODES.includes(sub);
        if (!isPassenger && result.hasFerry && result.source !== 'haversine') {
          console.warn(`📍 GPS Search: Skipped ${stop.name} - route contains ferries despite avoidFerries=true`);
          continue;
        }
        setDrivingTimes(prev => ({ ...prev, [stop.id]: result.time }));
        setDrivingDistances(prev => ({ ...prev, [stop.id]: result.distance }));
        setDrivingTimeSources(prev => ({ ...prev, [stop.id]: result.source }));
        localDrivingDistances[stop.id] = result.distance;
        drivableStops.push(stop);
      }
      
      // Sort by driving distance
      const finalPlaces = drivableStops.sort((a, b) => {
        const distanceA = localDrivingDistances[a.id] || a.distance;
        const distanceB = localDrivingDistances[b.id] || b.distance;
        return distanceA - distanceB;
      });
      if (finalPlaces.length === 0) {
        setError('Ingen fergekaier tilgjengelige med bil fra din posisjon. Prøv å søke manuelt i stedet.');
        setLoading(false);
        return;
      }

      // Step 3: Fetch return cards for the first 5 stops only (for performance)
      const stopsForReturnCards = finalPlaces.slice(0, 5);
      const returnCardPromises = stopsForReturnCards.map(stop => loadReturnCardForStop(stop));
      const resolvedReturnCards = await Promise.all(returnCardPromises);

      // Step 4: Prepare all state updates
      const newDeparturesMap = finalPlaces.reduce((acc, stop) => {
        acc[stop.id] = stop.departures;
        return acc;
      }, {});

      const newInlineDestinations = resolvedReturnCards.reduce((acc, card) => {
        if (card) {
          // Håndter både enkelt kort og arrays av kort (for spesielle fergesamband)
          const cards = Array.isArray(card) ? card : [card];
          
          cards.forEach(singleCard => {
            if (singleCard) {
              if (!acc[singleCard.parentStopId]) {
                acc[singleCard.parentStopId] = [];
              }
              acc[singleCard.parentStopId].push(singleCard);
            }
          });
        }
        return acc;
      }, {});

      // Step 5: Perform a single, atomic state update
      setFerryStops(finalPlaces);
      setDeparturesMap(newDeparturesMap);
      
      // Preserve existing return cards if they're still relevant
      setInlineDestinations(prev => {
        const preserved = {};
        // Keep existing return cards for stops that are still in the new results
        Object.keys(prev).forEach(stopId => {
          if (finalPlaces.some(stop => stop.id === stopId)) {
            preserved[stopId] = prev[stopId];
          }
        });
        // Add new return cards
        Object.keys(newInlineDestinations).forEach(stopId => {
          if (!preserved[stopId]) {
            preserved[stopId] = newInlineDestinations[stopId];
          }
        });
        return preserved;
      });
      
      if (finalPlaces.length > 0) {
        setHasInteracted(true);
        setSelectedStop(finalPlaces[0].id);
        

      }
    };

    try {
      // Try a quick, low-accuracy fix first (uses cached location if available)
      let pos;
      try {
        
        if (isIOS) {
          // Try Capacitor Geolocation plugin first, fallback to browser geolocation with manual instructions
          try {
            // Check permissions first
            const permissionState = await Geolocation.checkPermissions();
            
            if (permissionState.location !== 'granted') {
              const requestResult = await Geolocation.requestPermissions();
              
              if (requestResult.location !== 'granted') {
                throw new Error('Location permission denied');
              }
            }
            
            const position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: false,
              timeout: 3000,
              maximumAge: 300000
            });
            pos = position;
          } catch (capacitorError) {
            console.error('📍 GPS Search: Capacitor Geolocation failed:', capacitorError);
            
            // If Capacitor fails, try browser geolocation silently
            if (capacitorError.code === 'OS-PLUG-GLOC-0002' || capacitorError.code === 'UNIMPLEMENTED') {
              // Try browser geolocation as fallback silently
              try {
                pos = await new Promise((resolve, reject) => {
                  const timeoutId = setTimeout(() => {
                    reject(new Error('GPS timeout'));
                  }, 8000);
                  
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      clearTimeout(timeoutId);
                      resolve(position);
                    },
                    (error) => {
                      clearTimeout(timeoutId);
                      reject(error);
                    },
                    { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
                  );
                });
                console.log('📍 GPS Search: Browser geolocation successful');
              } catch (browserError) {
                console.error('📍 GPS Search: Browser geolocation also failed:', browserError);
                console.error('📍 GPS Error details:', {
                  code: browserError.code,
                  message: browserError.message,
                  PERMISSION_DENIED: browserError.PERMISSION_DENIED,
                  POSITION_UNAVAILABLE: browserError.POSITION_UNAVAILABLE,
                  TIMEOUT: browserError.TIMEOUT
                });
                
                // Provide more specific error messages based on error code
                let errorMessage = 'GPS-funksjonen er ikke tilgjengelig.';
                
                if (browserError.code === 1) {
                  errorMessage = 'GPS-tillatelse avvist. Vennligst aktiver plasseringstjenester i iOS-innstillingene.';
                } else if (browserError.code === 2) {
                  errorMessage = 'Posisjon ikke tilgjengelig. Sjekk at GPS er aktivert.';
                } else if (browserError.code === 3) {
                  errorMessage = 'GPS-tidsavbrudd. Prøv igjen.';
                } else if (browserError.message && browserError.message.includes('timeout')) {
                  errorMessage = 'GPS-tidsavbrudd. Prøv igjen.';
                } else {
                  errorMessage = 'GPS-funksjonen er ikke tilgjengelig. Vennligst aktiver GPS i iOS-innstillingene og prøv igjen.';
                }
                
                setError(errorMessage);
                return;
              }
            } else {
              throw capacitorError; // Don't fallback for other Capacitor errors
            }
          }
        } else {
          // Use browser geolocation on web
          pos = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('Low-accuracy GPS timeout'));
            }, 4000);
            
            navigator.geolocation.getCurrentPosition(
              (position) => {
                clearTimeout(timeoutId);
                resolve(position);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
              { enableHighAccuracy: false, timeout: 3000, maximumAge: 300000 }
            );
          });
        }
      } catch (lowAccuracyError) {
        
        if (isIOS) {
          // Use Capacitor Geolocation plugin on iOS for native permission dialog
          try {
            const position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 60000
            });
            pos = position;
          } catch (capacitorError) {
            // Handle GPS errors silently - don't show error messages for common GPS issues
            if (capacitorError.code === 'OS-PLUG-GLOC-0002' || capacitorError.code === 'UNIMPLEMENTED') {
              // Try browser geolocation as fallback silently
              try {
                pos = await new Promise((resolve, reject) => {
                  const timeoutId = setTimeout(() => {
                    reject(new Error('GPS timeout'));
                  }, 10000);
                  
                  navigator.geolocation.getCurrentPosition(
                    (position) => {
                      clearTimeout(timeoutId);
                      resolve(position);
                    },
                    (error) => {
                      clearTimeout(timeoutId);
                      reject(error);
                    },
                    { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
                  );
                });
                console.log('📍 GPS Search: Browser geolocation successful');
              } catch (browserError) {
                console.error('📍 GPS Search: Browser geolocation also failed:', browserError);
                console.error('📍 GPS Error details:', {
                  code: browserError.code,
                  message: browserError.message,
                  PERMISSION_DENIED: browserError.PERMISSION_DENIED,
                  POSITION_UNAVAILABLE: browserError.POSITION_UNAVAILABLE,
                  TIMEOUT: browserError.TIMEOUT
                });
                
                // Provide more specific error messages based on error code
                let errorMessage = 'GPS-funksjonen er ikke tilgjengelig.';
                
                if (browserError.code === 1) {
                  errorMessage = 'GPS-tillatelse avvist. Vennligst aktiver plasseringstjenester i iOS-innstillingene.';
                } else if (browserError.code === 2) {
                  errorMessage = 'Posisjon ikke tilgjengelig. Sjekk at GPS er aktivert.';
                } else if (browserError.code === 3) {
                  errorMessage = 'GPS-tidsavbrudd. Prøv igjen.';
                } else if (browserError.message && browserError.message.includes('timeout')) {
                  errorMessage = 'GPS-tidsavbrudd. Prøv igjen.';
                } else {
                  errorMessage = 'GPS-funksjonen er ikke tilgjengelig. Vennligst aktiver GPS i iOS-innstillingene og prøv igjen.';
                }
                
                setError(errorMessage);
                return;
              }
            } else {
              throw capacitorError; // Don't fallback for other Capacitor errors
            }
          }
        } else {
          // Fallback to high-accuracy with shorter cache
          pos = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('High-accuracy GPS timeout'));
            }, 10000);
            
            navigator.geolocation.getCurrentPosition(
              (position) => {
                clearTimeout(timeoutId);
                resolve(position);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
            );
          });
        }
      }

      try {
        const { latitude, longitude } = pos.coords;
        // Sett posisjonen umiddelbart for å oppdatere UI
        setLocation({ latitude, longitude });
        // Vent kort på fergekaier, men ikke blokkér for lenge (maks ~12s)
        const startWaitQuays = Date.now();
        while (!ferryStopsLoaded || !allFerryQuays || allFerryQuays.length === 0) {
          await new Promise(resolve => setTimeout(resolve, 250));
          if (Date.now() - startWaitQuays > 12000) break;
        }
        await computeNearbyAndUpdate(latitude, longitude);

        // Store last location for faster next startup
        try { 
          localStorage.setItem('lastLocation', JSON.stringify({ latitude, longitude, ts: Date.now() })); 
        } catch (storageError) {
          console.error('📍 GPS Search: Failed to save location to localStorage:', storageError);
        }
      } catch (err) {
        console.error('📍 GPS Search: Error processing location:', err);
        setError('Kunne ikke hente fergekaier. Sjekk internettforbindelsen din.');
      } finally {
        setLoading(false);
      }
    } catch (err) {
      console.error('📍 GPS Search: GPS error:', err);
      let errorMessage = 'Kunne ikke hente posisjon.';
      
      // Provide more specific error messages based on the error type
      if (err.code === 1) {
        errorMessage = 'GPS-tillatelse avvist. Vennligst tillat posisjonsdeling i nettleseren din.';
      } else if (err.code === 2) {
        errorMessage = 'Posisjon ikke tilgjengelig. Sjekk at GPS er aktivert på enheten din.';
      } else if (err.code === 3) {
        errorMessage = 'GPS-tidsavbrudd. Prøv igjen eller sjekk internettforbindelsen din.';
      } else if (err.message && err.message.includes('timeout')) {
        errorMessage = 'GPS-tidsavbrudd. Prøv igjen eller sjekk internettforbindelsen din.';
      }
      
      setError(errorMessage);
      setLoading(false);
      

    }
  };





  // Load all ferry stops function (we'll use quay info from Line.quays for matching)
  const loadAllFerryStops = async () => {
    try {
      const data = await client.request(ALL_FERRY_STOPS_QUERY);
      const allStops = data.stopPlaces || [];
      
      const stops = allStops.filter(
        (stop) => {
          if (!Array.isArray(stop.transportMode) || !stop.transportMode.includes('water')) return false;
          if (EXCLUDED_SUBMODES.includes(stop.transportSubmode)) {
            return false;
          }
          
          // Prioriter localCarFerry, men inkluder også andre water transport stops som kan være relevante
          if (stop.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY) return true;
          
          // Inkluder også andre water transport stops som ikke er ekskludert
          return true;
        }
      );
      
      // Apply manual coordinate overrides
      const stopsWithOverrides = stops.map((stop) => {
        const idOverride = STOP_COORDINATE_OVERRIDES[stop.id];
        const normName = (stop.name || '').toLowerCase();
        const nameOverride = STOP_COORDINATE_NAME_OVERRIDES[normName];
        if (idOverride || nameOverride) {
          const override = idOverride || nameOverride;
          const updated = { ...stop, latitude: override.latitude, longitude: override.longitude };
          return updated;
        }
        return stop;
      });
      
      setAllFerryQuays(stopsWithOverrides); // Keep the same state variable name for compatibility
      setFerryStopsLoaded(true);
    } catch (error) {
      console.error('❌ Error loading ferry stops:', error);
      setFerryStopsLoaded(true); // Sett til true selv ved feil for å unngå evig lasting
    }
  };

  // Initialize app function
  // IAP fjernet: ingen init av kjøp nødvendig





  // Initialize app
  useEffect(() => {
    try {
      loadAllFerryStops(); // Load all ferry stops on initial app load
    } catch (error) {
      console.error('🔄 Error in useEffect:', error);
    }
  }, []);



  // Custom splash screen state
  const [showCustomSplash, setShowCustomSplash] = useState(true);

  // Hide splash screen when app is ready
  useEffect(() => {
    const hideSplashScreen = async () => {
      try {
        await SplashScreen.hide();
      } catch (error) {
        console.error('Error hiding splash screen:', error);
      }
    };

    // Hide splash screen quickly to avoid timeout warning
    const hideSplashWhenReady = () => {
      // Hide splash screen immediately when app starts
      setTimeout(() => {
        hideSplashScreen();
        setShowCustomSplash(false);
      }, 500);
    };

    hideSplashWhenReady();
  }, []);

  // Live search function - show ferry cards as user types
  const performLiveSearch = async () => {
    processedStopsRef.current.clear(); // Clear processed stops for new search
    const requestId = ++liveSearchRequestIdRef.current; // Beskytt mot utdaterte søk
    
    // Load ferry quays on-demand if not already loaded
    if (!ferryStopsLoaded || allFerryQuays.length === 0) {
      await loadAllFerryStops();
    }
    
    const searchQuery = query.toLowerCase().trim();
    
    let stops = allFerryQuays.filter(stop => {
      if (!stop || !stop.name) return false;
      
      const name = stop.name.toLowerCase();
      
      // Enkelt søk: vis kun fergekaier som starter med søkeordet
      const matches = name.startsWith(searchQuery);
      

      
      return matches;
    });
    
    // Sorter alfabetisk - det er alt!
    stops = stops.sort((a, b) => {
      return a.name.localeCompare(b.name, 'nb-NO');
    });

    // Limit to 10 results for live search
    const limitedStops = stops.slice(0, 10);
    
    // Hent avganger for hver fergekai
    const stopsWithDepartures = [];
    for (const stop of limitedStops) {
      let departures = [];
      
      // Beregn kjøretid først for å bestemme hvor mange avganger som skal hentes
      let drivingTime = null;
      if (location && stop.latitude && stop.longitude) {
        try {
          const result = await calculateDrivingTime(
            { lat: location.latitude, lng: location.longitude },
            { lat: stop.latitude, lng: stop.longitude },
            { roadOnly: false }
          );
          drivingTime = result.time;
        } catch (error) {
          // Fallback til enkel beregning
          const dLat = (stop.latitude - location.latitude) * 111000;
          const dLng = (stop.longitude - location.longitude) * 111000 * Math.cos(location.latitude * Math.PI / 180);
          const distance = Math.sqrt(dLat * dLat + dLng * dLng);
          drivingTime = Math.max(1, Math.round((distance / 1000) / 50 * 60)); // 50 km/h default
        }
      }
      
      // Bestem hvor mange avganger som skal hentes basert på kjøretid
      const queryParams = getDepartureQueryParams(drivingTime);
      
      try {
        const data = await client.request(DEPARTURES_QUERY, { 
          id: stop.id,
          ...queryParams
        });
        const calls = data.stopPlace?.estimatedCalls || [];
        departures = calls
          .filter((call) => {
            const sub = call.serviceJourney?.journeyPattern?.line?.transportSubmode;
            const allowCar = filters.carFerry && sub === TRANSPORT_MODES.LOCAL_CAR_FERRY;
            const allowPassenger = filters.passengerFerry && PASSENGER_FERRY_SUBMODES.includes(sub);
            return sub && !EXCLUDED_SUBMODES.includes(sub) && (allowCar || allowPassenger);
          })
          .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
      } catch {
        // Ignorer feil for individuelle fergekaier
      }
      
      // Beregn kjøreavstand hvis GPS er aktiv (location er satt)
      // I søkefunksjonen viser vi ALLE fergekaier, også de som krever ferge for å komme til
      // Dette er forskjellig fra GPS-funksjonen som filtrerer bort fergekaier som krever ferge
      let distance = null;
      let drivingTimeSource = null;
      
      if (location && stop.latitude && stop.longitude) {
        try {
          const result = await calculateDrivingTime(
            { lat: location.latitude, lng: location.longitude },
            { lat: stop.latitude, lng: stop.longitude },
            { roadOnly: false } // Allow ferries in search mode - show all ferry stops
          );
          
          // I søkefunksjonen skal vi vise alle fergekaier, også de som krever ferge for å komme til
          // Vi bruker alltid avstanden fra API, selv om ruten inneholder ferge
          distance = result.distance;
          drivingTime = result.time; // Bruker drivingTime fra tidligere beregning
          drivingTimeSource = result.source;
          
          // Lagre kjøretidsinformasjon i state-variablene for å vise kjøretidsbeskrivelse
          setDrivingTimes(prev => ({ ...prev, [stop.id]: result.time }));
          setDrivingDistances(prev => ({ ...prev, [stop.id]: result.distance }));
          setDrivingTimeSources(prev => ({ ...prev, [stop.id]: result.source }));
        } catch (error) {
          // Fallback to simple distance calculation if API fails
          const dLat = (stop.latitude - location.latitude) * 111000;
          const dLng = (stop.longitude - location.longitude) * 111000 * Math.cos(location.latitude * Math.PI / 180);
          distance = Math.sqrt(dLat * dLat + dLng * dLng);
          drivingTime = Math.max(1, Math.round((distance / 1000) / 50 * 60)); // 50 km/h default
          drivingTimeSource = 'simple';
          
          // Lagre fallback kjøretidsinformasjon
          setDrivingTimes(prev => ({ ...prev, [stop.id]: drivingTime }));
          setDrivingDistances(prev => ({ ...prev, [stop.id]: distance }));
          setDrivingTimeSources(prev => ({ ...prev, [stop.id]: drivingTimeSource }));
        }
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
    
    // Asynchronously load return cards for the search results
    const returnCardPromises = formattedStops.map(stop => loadReturnCardForStop(stop));

    const resolvedReturnCards = await Promise.all(returnCardPromises);
    // Avbryt hvis dette søket er utdatert
    if (requestId !== liveSearchRequestIdRef.current) return;
    const newInlineDestinations = resolvedReturnCards.reduce((acc, card) => {
      if (card) {
        // Håndter både enkelt kort og arrays av kort (for spesielle fergesamband)
        const cards = Array.isArray(card) ? card : [card];
        
        cards.forEach(singleCard => {
          if (singleCard) {
            if (!acc[singleCard.parentStopId]) {
              acc[singleCard.parentStopId] = [];
            }
            acc[singleCard.parentStopId].push(singleCard);
          }
        });
      }
      return acc;
    }, {});

    // Bevare eksisterende returkort for fergekaier som fortsatt er i resultatet
    setInlineDestinations(prev => {
      const preserved = {};
      
      // Behold eksisterende returkort for fergekaier som fortsatt er i resultatet
      Object.keys(prev).forEach(stopId => {
        if (formattedStops.some(stop => stop.id === stopId)) {
          preserved[stopId] = prev[stopId];
        }
      });
      
      // Legg til nye returkort
      Object.keys(newInlineDestinations).forEach(stopId => {
        if (!preserved[stopId]) {
          preserved[stopId] = newInlineDestinations[stopId];
        }
      });
      
      return preserved;
    });

    // Kun sett hasInteracted til true hvis vi faktisk har resultater
    if (formattedStops.length > 0) {
      // Avbryt hvis dette søket er utdatert
      if (requestId !== liveSearchRequestIdRef.current) return;
      setFerryStops(formattedStops);
      setHasInteracted(true);
      setSelectedStop(formattedStops[0].id);
      
      // Kjøretidsvisning er alltid aktivert
      

    } else {
      setFerryStops([]);
      setHasInteracted(false);
      setSelectedStop(null);
      

    }
  };

  // Live search effect - show ferry cards as user types
  useEffect(() => {
    // Bare kjør live-søk i søkemodus
    if (mode !== 'search') return;

    // Kun kjøre live search hvis brukeren faktisk har skrevet noe
    if (!query.trim()) {
      setFerryStops([]);
      setInlineDestinations({});
      setDeparturesMap({});
      setHasInteracted(false);
      setSelectedStop(null);
      return;
    }

    // Debounce search to avoid too many API calls
    const timeoutId = setTimeout(performLiveSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [query, allFerryQuays, ferryStopsLoaded, mode]);

  // Fjern feilmeldinger når mode endres til search eller query endres
  useEffect(() => {
    if ((mode === 'search' || query.trim()) && error) {
      setError(null);
    }
  }, [mode, error, query]);

  // Calculate driving times when feature is enabled
  // Throttle driving time calculations to avoid spamming APIs on rapid updates
  const drivingTimesThrottleRef = useRef(null);
  useEffect(() => {
    if (!(showDrivingTimes && location && ferryStops.length > 0)) {
      return;
    }
    if (drivingTimesThrottleRef.current) {
      clearTimeout(drivingTimesThrottleRef.current);
    }
    drivingTimesThrottleRef.current = setTimeout(() => {
      calculateDrivingTimesForExistingStops();
    }, 400); // debounce/throttle 400ms
    return () => {
      if (drivingTimesThrottleRef.current) {
        clearTimeout(drivingTimesThrottleRef.current);
      }
    };
  }, [showDrivingTimes, location, ferryStops]);







  // GPS functionality
  const handleGPSLocation = async () => {
    // Prevent multiple simultaneous GPS searches
    if (loading) {
      return;
    }
    
    // All users: aktiver kjøretidsvisning og kjør GPS-søk
    setShowDrivingTimes(true);
    setError(null);
    setMode('search');
    await executeGpsSearch();
  };





  // Funksjon for å beregne kjøretider for eksisterende fergekaier
  const calculateDrivingTimesForExistingStops = async () => {
    if (!location || !ferryStops.length) {
      return;
    }
    
    const startCoords = { lat: location.latitude, lng: location.longitude };
    
    // Limit max concurrent calculations to reduce bursts
    const stopsToProcess = ferryStops.slice(0, 12); // cap to 12 visible/nearby
    for (const stop of stopsToProcess) {
      const stopId = stop.id;
      setDrivingTimesLoading(prev => ({ ...prev, [stopId]: true }));
      
      const endCoords = { lat: stop.latitude, lng: stop.longitude };
      
      try {
        const sub = stop?.nextDeparture?.serviceJourney?.journeyPattern?.line?.transportSubmode;
        const isPassengerOnly = (filters.passengerFerry && !filters.carFerry) && sub && PASSENGER_FERRY_SUBMODES.includes(sub);
        let result;
        if (isPassengerOnly) {
          // walking estimate 1.4 m/s
          const dLat = (endCoords.lat - startCoords.lat) * 111000;
          const dLng = (endCoords.lng - startCoords.lng) * 111000 * Math.cos(startCoords.lat * Math.PI / 180);
          const distance = Math.sqrt(dLat * dLat + dLng * dLng);
          const walkingMinutes = Math.max(1, Math.round((distance / 1.4) / 60));
          result = { time: walkingMinutes, distance, source: 'walking_estimate', hasFerry: false };
        } else {
          // Bruk Google Maps API for mer nøyaktige kjøretider
          // This function now has its own fallback chain built-in
          result = await calculateDrivingTime(startCoords, endCoords, { roadOnly: true });
        }
        
        // Skip if route contains ferries
        if (!isPassengerOnly && result.hasFerry) {
          console.warn(`🚢 Driving time calculation: Skipped ${stop.name} - route contains ferries`);
          return;
        }
        
                 setDrivingTimes(prev => ({ ...prev, [stopId]: result.time }));
         setDrivingDistances(prev => ({ ...prev, [stopId]: result.distance }));
         setDrivingTimeSources(prev => ({ ...prev, [stopId]: result.source || 'unknown' }));
      } catch (error) {
        // If even the simple distance calculation fails, use a basic estimate
        const distance = Math.sqrt(
          Math.pow((endCoords.lat - startCoords.lat) * 111000, 2) + 
          Math.pow((endCoords.lng - startCoords.lng) * 111000 * Math.cos(startCoords.lat * Math.PI / 180), 2)
        );
        
        const estimatedTime = Math.max(1, Math.round((distance / 1000) / 50 * 60)); // 50 km/h default
        
                 setDrivingTimes(prev => ({ ...prev, [stopId]: estimatedTime }));
         setDrivingDistances(prev => ({ ...prev, [stopId]: distance }));
         setDrivingTimeSources(prev => ({ ...prev, [stopId]: 'simple' }));
      } finally {
        setDrivingTimesLoading(prev => ({ ...prev, [stopId]: false }));
      }
    }
  };

  // Helper function to load a return card for a single stop
  const loadReturnCardForStop = async (stop) => {
    try {
      // Check if return cards are already being loaded for this stop
      const existingDestinations = inlineDestinations[stop.id] || [];
      if (existingDestinations.length > 0) {
        return null; // Already have return cards for this stop
      }
      
      // Load ferry quays on-demand if not already loaded
      if (!ferryStopsLoaded || allFerryQuays.length === 0) {
        await loadAllFerryStops();
      }
      
      // Sjekk om dette er et spesielt fergesamband som krever tilknyttede fergekaier
      const specialConnections = getSpecialFerryConnections(stop.name);
      if (specialConnections) {
        // Dette er et spesielt fergesamband - last inn alle tilknyttede fergekaier
        const connectedQuays = getConnectedFerryQuays(stop.name, allFerryQuays);
        const returnCards = [];
        
        for (const connectedQuay of connectedQuays) {
          const returnCard = await loadInlineDestinationDepartures(stop.id, connectedQuay.name);
          if (returnCard) {
            returnCards.push(returnCard);
          }
        }
        
        return returnCards;
      }
      
      // Standard logikk for vanlige fergesamband
                const queryParams = getDepartureQueryParams();
          const dataLine = await client.request(ENHANCED_DEPARTURES_WITH_PATTERNS_QUERY, { 
            id: stop.id,
            ...queryParams
          });
      const callsLine = dataLine.stopPlace?.estimatedCalls || [];
      const anyFerry = callsLine.find(call => {
        const sub = call.serviceJourney?.journeyPattern?.line?.transportSubmode;
        return sub === TRANSPORT_MODES.LOCAL_CAR_FERRY || PASSENGER_FERRY_SUBMODES.includes(sub);
      });
      const line = anyFerry?.serviceJourney?.journeyPattern?.line;

      if (line && Array.isArray(line.quays) && line.quays.length >= 2) {
        const other = line.quays.find(q => q.stopPlace?.id !== stop.id) || line.quays.find(q => q.id !== stop.id);
        const destName = other?.stopPlace?.name || other?.name;
        if (destName) {
          // This function is now pure and returns data instead of setting state
          return await loadInlineDestinationDepartures(stop.id, destName);
        }
      }
    } catch (e) {
      //
    }
    return null; // Return null if anything fails
  };



  // Hjelpefunksjon for å hente skipets navn




    // Enhanced function to load inline destination departures using journeyPattern
  const loadInlineDestinationDepartures = async (parentStopId, destinationText) => {
    let candidate = null;
    
    try {
      // Loading inline destination departures
      
      // Check if this specific destination is already loaded
      const existingDestinations = inlineDestinations[parentStopId] || [];
      const alreadyLoaded = existingDestinations.some(dest => {
        const destName = normalizeText(cleanDestinationText(dest.name || '')).toLowerCase();
        const targetName = normalizeText(cleanDestinationText(destinationText || '')).toLowerCase();
        return destName === targetName;
      });
      
      if (alreadyLoaded) {
        return null; // Return null instead of undefined to prevent further processing
      }

      if (!destinationText) return null;
       
      // Load ferry quays on-demand if not already loaded
      if (!ferryStopsLoaded || allFerryQuays.length === 0) {
        await loadAllFerryStops();
      }
      
      // Step 1: Try enhanced journeyPattern-based matching first (using destination text)
      candidate = await findDestinationUsingJourneyPattern(parentStopId, destinationText);
      
      // Step 1b: If not found, try line-only pairing (choose the other quay on the line)
      if (!candidate) {
        const lineOnlyCandidate = await findDestinationByLineOtherQuay(parentStopId);
        if (lineOnlyCandidate) {
          candidate = lineOnlyCandidate;
        }
      }
      
      // Removed legacy fallbacks (routeMap and traditional name-based matching). We now rely solely on journeyPattern-based matching.
      
      if (!candidate) return null;
      
      // Step 4: Use enhanced journeyPattern-based return departure finding
      const lineId = candidate.lineId;
      let returnDepartures = await findReturnDeparturesUsingJourneyPattern(parentStopId, candidate.id, lineId);

      // Fallback: if no return departures for candidate, try line-only pairing as destination
      if (returnDepartures.length === 0) {
        const lineOnlyCandidate = await findDestinationByLineOtherQuay(parentStopId);
        if (lineOnlyCandidate && lineOnlyCandidate.id !== candidate.id) {
          candidate = lineOnlyCandidate;
          returnDepartures = await findReturnDeparturesUsingJourneyPattern(parentStopId, candidate.id, candidate.lineId);
        }
      }
      
      // Use only journeyPattern-based return departures. If none, leave empty.
      const finalCalls = returnDepartures;
      
      // Return departures result determined

      if (finalCalls.length === 0) {
        return null; // Return null instead of setting state
      }
        
      const newDestination = {
        parentStopId: parentStopId,
        stopId: candidate.id,
        name: candidate.name,
        departures: finalCalls,
        quayId: candidate.quayId,
        quayName: candidate.quayName,
        lineId: candidate.lineId,
        lineName: candidate.lineName
      };
        
      return newDestination; // Return the new destination object

    } catch (error) {
      return null; // Return null on error
    }
  };

  // Find destination using only line hierarchy: pick the other quay on the line for the parent stop
  const findDestinationByLineOtherQuay = async (parentStopId) => {
    try {
      const queryParams = getDepartureQueryParams();
      const data = await client.request(ENHANCED_DEPARTURES_WITH_PATTERNS_QUERY, { 
        id: parentStopId,
        ...queryParams
      });
      const calls = data.stopPlace?.estimatedCalls || [];
      const anyFerryCall = calls.find(call => call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY);
      const line = anyFerryCall?.serviceJourney?.journeyPattern?.line;
      if (!line || !Array.isArray(line.quays) || line.quays.length < 2) return null;

      const parentQuay = allFerryQuays.find(q => q.id === parentStopId);
      // Prefer quay whose stopPlace differs from parent; fallback to first different quay by id
      const destinationQuay = line.quays.find(q => q?.stopPlace?.id && q.stopPlace.id !== parentStopId) ||
                              line.quays.find(q => q?.id && q.id !== parentStopId) || null;
      if (!destinationQuay) return null;

      if (destinationQuay.stopPlace) {
        return {
          id: destinationQuay.stopPlace.id,
          name: destinationQuay.stopPlace.name,
          quayId: destinationQuay.id,
          quayName: destinationQuay.name,
          lineId: line.id,
          lineName: line.name
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  // Enhanced matching function using journeyPattern data
  const findDestinationUsingJourneyPattern = async (parentStopId, destinationText) => {
    try {
      
      
      // Get parent quay details
      const parentQuay = allFerryQuays.find(q => q.id === parentStopId);
      if (!parentQuay) {
        
        return null;
      }

      // Get departures from parent stop with journeyPattern data including quays
      const queryParams = getDepartureQueryParams();
      const data = await client.request(ENHANCED_DEPARTURES_WITH_PATTERNS_QUERY, { 
        id: parentStopId,
        ...queryParams
      });
      const calls = data.stopPlace?.estimatedCalls || [];
      
      // Find departures that match the destination text
      const matchingDepartures = calls.filter(call => {
        const destText = call.destinationDisplay?.frontText;
        const normDest = normalizeText(cleanDestinationText(destText || '')).toLowerCase();
        const normTarget = normalizeText(cleanDestinationText(destinationText || '')).toLowerCase();
        
        // Clean names for comparison
        const cleanDest = normDest.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanTarget = normTarget.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        
        return cleanDest === cleanTarget || 
               cleanDest.includes(cleanTarget) || 
               cleanTarget.includes(cleanDest);
      });

      // Get the line and its quays: prefer a matching departure; fallback to any local car or passenger ferry call
      let line = matchingDepartures[0]?.serviceJourney?.journeyPattern?.line;
      if (!line) {
        const anyFerryCall = calls.find(call => {
          const sub = call.serviceJourney?.journeyPattern?.line?.transportSubmode;
          return sub === TRANSPORT_MODES.LOCAL_CAR_FERRY || PASSENGER_FERRY_SUBMODES.includes(sub);
        });
        if (anyFerryCall) {
          line = anyFerryCall.serviceJourney?.journeyPattern?.line;
        }
      }
      if (!line || !line.quays) {
        
        return null;
      }


      // Find the destination quay by matching the destination text
      let destinationQuay = line.quays.find(quay => {
        const quayName = normalizeText(cleanDestinationText(quay.name || '')).toLowerCase();
        const stopPlaceName = normalizeText(cleanDestinationText(quay.stopPlace?.name || '')).toLowerCase();
        const targetName = normalizeText(cleanDestinationText(destinationText || '')).toLowerCase();
        
        const cleanQuayName = quayName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanStopPlaceName = stopPlaceName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        const cleanTargetName = targetName.replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '').trim();
        
        return cleanQuayName === cleanTargetName || 
               cleanStopPlaceName === cleanTargetName ||
               cleanQuayName.includes(cleanTargetName) || 
               cleanTargetName.includes(cleanQuayName) ||
               cleanStopPlaceName.includes(cleanTargetName) ||
               cleanTargetName.includes(cleanStopPlaceName);
      });

      // Robust fallback: hvis ingen tekst-match og linjen har to quays, velg den som ikke er parent
      if (!destinationQuay && Array.isArray(line.quays) && line.quays.length === 2) {
        const parentQuay = allFerryQuays.find(q => q.id === parentStopId);
        if (parentQuay) {
          destinationQuay = line.quays.find(q => q.stopPlace?.id !== parentQuay.id) || null;
        }
      }

      if (destinationQuay) {
        
        // Return the stop place associated with the quay, plus quay and line info
        if (destinationQuay.stopPlace) {
          return {
            id: destinationQuay.stopPlace.id,
            name: destinationQuay.stopPlace.name,
            quayId: destinationQuay.id,
            quayName: destinationQuay.name,
            lineId: line.id,
            lineName: line.name
          };
        }
      }

      // No name-based fallback. If quay cannot be found via journeyPattern hierarchy, we return null.
      
      return null;
    } catch (error) {
      
      return null;
    }
  };

  // Enhanced function to find return departures using Quay-based journeyPattern matching
  const findReturnDeparturesUsingJourneyPattern = async (parentStopId, destinationStopId, lineId = null) => {
    try {
      // Finding return departures using journey pattern matching
      
      // Get parent quay details - check both quay.id and quay.stopPlace.id
      const parentQuay = allFerryQuays.find(q => 
        q.id === parentStopId || q.stopPlace?.id === parentStopId
      );
      
      // Get destination quay details - check both quay.id and quay.stopPlace.id  
      const destinationQuay = allFerryQuays.find(q => 
        q.id === destinationStopId || q.stopPlace?.id === destinationStopId
      );
      
      if (!parentQuay || !destinationQuay) {
        // Missing quays, using direct API-based approach
        // Fall back to direct API-based matching without relying on allFerryQuays
      }

      // Get departures from destination stop with journeyPattern data including quays
      const queryParams = getDepartureQueryParams();
      const data = await client.request(ENHANCED_DEPARTURES_WITH_PATTERNS_QUERY, { 
        id: destinationStopId,
        ...queryParams
      });
      const calls = data.stopPlace?.estimatedCalls || [];
      
      // Limit the number of calls to process to prevent infinite loops
      const limitedCalls = calls.slice(0, 50); // Only process first 50 calls
      
      // Find return departures using QUAY-ONLY logic
      let returnDepartures = limitedCalls.filter(call => {
        const journeyPattern = call.serviceJourney?.journeyPattern;
        if (!journeyPattern) return false;
        
        // Check if this is a relevant water ferry (broaden beyond only localCarFerry)
        const submode = journeyPattern.line?.transportSubmode;
        const mode = journeyPattern.line?.transportMode;
        const isRelevantFerry = mode === TRANSPORT_MODES.WATER && !EXCLUDED_SUBMODES.includes(submode) && (
          (filters.carFerry && submode === TRANSPORT_MODES.LOCAL_CAR_FERRY) ||
          (filters.passengerFerry && PASSENGER_FERRY_SUBMODES.includes(submode))
        );
        if (!isRelevantFerry) return false;
        
        // QUAY-ONLY: Check if the line has quays that match the parent stop
        const line = journeyPattern.line;
        // Sjekk både StopPlace-ID og Quay-ID (noen API-responser kan bruke ulike nivå)
        const hasMatchingQuay = !!(line && Array.isArray(line.quays) && line.quays.some(quay => (
          quay?.stopPlace?.id === parentStopId || quay?.id === parentStopId
        )));
        
        // If no direct match but we have a lineId, try line-based matching
        if (!hasMatchingQuay && lineId && line?.id === lineId) {
          return true;
        }
        
        // QUAY-ONLY: Only return true if we have a matching quay
        return hasMatchingQuay;
      });

      // If none matched by quay but we know the lineId, use same-line departures as a fallback
      if (returnDepartures.length === 0 && lineId) {
        returnDepartures = limitedCalls.filter(call => call.serviceJourney?.journeyPattern?.line?.id === lineId);
      }
      
      // If we have a lineId, prioritize departures from the same line
      let prioritizedDepartures = returnDepartures;
      if (lineId) {
        const sameLineDepartures = returnDepartures.filter(call => 
          call.serviceJourney?.journeyPattern?.line?.id === lineId
        );
        if (sameLineDepartures.length > 0) {
          prioritizedDepartures = sameLineDepartures;
        }
      }
      
      // Limit the number of return departures to prevent performance issues
      const limitedReturnDepartures = prioritizedDepartures.slice(0, 20);
      
      // Return departures found and prioritized
      return limitedReturnDepartures
        .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime))
        .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }));
        
    } catch (error) {
      return [];
    }
  };

  const handleKeyDown = (e) => {
    switch (e.key) {
      case 'Escape':
        setQuery('');
        setFerryStops([]);
        setHasInteracted(false);
        setSelectedStop(null);
        setInlineDestinations({});
        setDeparturesMap({});
        setDrivingTimes({});
        setDrivingTimesLoading({});
        // Kjøretid beholdes aktivt på iOS
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
      {/* Custom Splash Screen */}
      {showCustomSplash && (
        <div className="fixed inset-0 bg-gradient flex flex-col items-center justify-start pt-20 sm:pt-24 z-50">
          <div className="text-center">
            <h1 className="text-5xl sm:text-7xl font-extrabold text-white tracking-tight mb-8 drop-shadow-lg fergetid-title">
              FergeTid
            </h1>
            <LoadingSpinner message={"laster"} />
          </div>
        </div>
      )}

      <div className="bg-gradient flex flex-col items-center min-h-screen pb-16 sm:pb-24 pt-20 sm:pt-24">
        <h1 className="text-5xl sm:text-7xl font-extrabold text-white tracking-tight mb-6 sm:mb-6 drop-shadow-lg fergetid-title">{APP_NAME}</h1>
      
        {/* Premium fjernet: ingen paywall/CTA */}
      
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
                        // Ikke deaktiver kjøretidsberegning - behold den for GPS-resultater
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder="Søk fergekai eller klikk på GPS-ikonet"
                    className="w-full px-4 py-3 rounded-lg bg-white/90 backdrop-blur-md shadow-lg border border-fuchsia-200 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200 placeholder:text-gray-600 placeholder:opacity-90"
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
                  Søk fergekai eller klikk på GPS-ikonet  
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
            
            {/* Hamburger Menu Button */}
            <button
              type="button"
              onClick={() => setShowHamburgerMenu(!showHamburgerMenu)}
              className="px-4 py-3 bg-transparent hover:bg-white/20 backdrop-blur-md text-white font-semibold rounded-lg shadow-lg transition-colors border border-white focus:border-white focus:outline-none focus:ring-2 focus:ring-white/50"
              title="Meny"
            >
              <svg 
                width="24" 
                height="24" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
                className="text-white"
              >
                <line x1="3" y1="6" x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Filter Menu - shown below search field */}
        {showHamburgerMenu && (
          <div className="w-full max-w-[350px] sm:max-w-md mb-6 px-3 sm:px-4 -mt-3">
            <div className="bg-white/15 backdrop-blur-md rounded-xl shadow-lg border-2 border-fuchsia-200 p-4 transform transition-all duration-300 ease-out">
              <div className="flex gap-2">
                {/* Car Ferry Filter */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!filters.carFerry}
                  onClick={() => setFilters(prev => ({ ...prev, carFerry: !prev.carFerry }))}
                  className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg focus:outline-none transition-colors"
                  title="Bilferge"
                >
                  <span className="w-4 h-4 rounded border border-white bg-white flex items-center justify-center">
                    {filters.carFerry ? (
                      <svg viewBox="0 0 24 24" className="w-3 h-3 text-fuchsia-600" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="text-white font-medium text-sm">Bilferge</span>
                </button>
                
                {/* Passenger Ferry Filter */}
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={!!filters.passengerFerry}
                  onClick={() => setFilters(prev => ({ ...prev, passengerFerry: !prev.passengerFerry }))}
                  className="flex items-center gap-2 flex-1 px-3 py-2 rounded-lg focus:outline-none transition-colors"
                  title="Passasjerferge"
                >
                  <span className="w-4 h-4 rounded border border-white bg-white flex items-center justify-center">
                    {filters.passengerFerry ? (
                      <svg viewBox="0 0 24 24" className="w-3 h-3 text-fuchsia-600" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : null}
                  </span>
                  <span className="text-white font-medium text-sm">Passasjerferge</span>
                </button>
              </div>
              
              {/* Legal Links */}
              <div className="mt-4 pt-3 border-t border-white/20">
                <div className="text-xs text-white/80">
                  {(() => {
                    const isIOSApp = typeof window !== 'undefined' && window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === 'ios';
                    const termsHref = config?.LEGAL?.getTermsOfUseUrl?.();
                    const privacyHref = config?.LEGAL?.getPrivacyPolicyUrl?.();
                    const supportHref = config?.LEGAL?.getSupportUrl?.();
                    return (
                      <>
                        <a
                          href={termsHref}
                          onClick={(e) => {
                            if (!isIOSApp) {
                              e.preventDefault();
                              setLegalModalTitle('Bruksvilkår');
                              const url = termsHref + (termsHref.includes('?') ? '&' : '?') + 'embed=1';
                              setLegalModalUrl(url);
                              setLegalModalOpen(true);
                            }
                          }}
                          {...(isIOSApp ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="underline mr-4"
                        >
                          Bruksvilkår
                        </a>
                        <a
                          href={privacyHref}
                          onClick={(e) => {
                            if (!isIOSApp) {
                              e.preventDefault();
                              setLegalModalTitle('Personvernerklæring');
                              const url = privacyHref + (privacyHref.includes('?') ? '&' : '?') + 'embed=1';
                              setLegalModalUrl(url);
                              setLegalModalOpen(true);
                            }
                          }}
                          {...(isIOSApp ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="underline mr-4"
                        >
                          Personvernerklæring
                        </a>
                        <a
                          href={supportHref}
                          onClick={(e) => {
                            if (!isIOSApp) {
                              e.preventDefault();
                              setLegalModalTitle('Support');
                              const url = supportHref + (supportHref.includes('?') ? '&' : '?') + 'embed=1';
                              setLegalModalUrl(url);
                              setLegalModalOpen(true);
                            }
                          }}
                          {...(isIOSApp ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                          className="underline"
                        >
                          Support
                        </a>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}


        {/* GPS Location Display */}
        {mode === 'gps' && locationName && (
          <div className="text-base sm:text-lg text-white mb-4 text-center px-3">
            Din posisjon er <span className="font-bold">{locationName}</span>
          </div>
        )}









        {/* GPS Status Display */}
        {mode === 'gps' && !locationName && !loading && !error && (
          <div className="text-sm text-white/80 mb-4 text-center px-3">
            <p>GPS-funksjon aktivert</p>
            <p className="text-xs mt-1">Henter posisjon og fergekaier...</p>
          </div>
        )}

        {/* Toggle for kjøretidsberegning - fjernet fra iOS */}

        {/* Loading and Error States */}
        <div 
          style={{ 
            minHeight: loading ? '150px' : '0px',
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            transition: 'min-height 0.3s ease-out',
            overflow: 'hidden'
          }}
        >
          {loading && (
            <LoadingSpinner 
              message={location ? "Laster fergekaier..." : "Laster posisjon og fergekaier..."} 
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
                const nextDepartureTime = new Date(stop.nextDeparture.aimedDepartureTime);
                
                // Sjekk om neste avgang har passert
                if (nextDepartureTime > now) {
                  nextDeparture = { ...stop.nextDeparture, aimed: nextDepartureTime };
                  
                  // Bruk departuresMap for senere avganger hvis tilgjengelig
                  if (departuresMap[stop.id]) {
                    const sortedCalls = departuresMap[stop.id]
                      .filter(dep => dep.aimedDepartureTime)
                      .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }))
                      .sort((a, b) => a.aimed - b.aimed);
                    
                    // Filtrer bort avganger som har passert
                    const futureCalls = sortedCalls.filter(c => c.aimed > now);
                    
                    if (futureCalls.length > 1) {
                      // Ta de neste 4 avgangene (ekskluder neste avgang)
                      laterDepartures = futureCalls.slice(1, 5);
                    }
                  }
                }
              } else if (departures && departures.length > 0) {
                // Søk-format: finn neste avgang fra departures
                const sortedCalls = departures
                  .filter(dep => dep.aimedDepartureTime)
                  .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }))
                  .sort((a, b) => a.aimed - b.aimed);
                
                // Filtrer bort avganger som har passert
                const futureCalls = sortedCalls.filter(c => c.aimed > now);
                
                if (futureCalls.length > 0) {
                  // Hvis det er langt å kjøre, finn en avgang som passer bedre med kjøretiden
                  if (showDrivingTimes && drivingTimes[stop.id] && drivingTimes[stop.id] > 120) { // Hvis kjøretid > 2 timer
                    const drivingTimeMinutes = drivingTimes[stop.id];
                    const currentTime = new Date();
                    
                    // Finn avganger som er minst 30 minutter etter ankomsttid
                    const suitableDepartures = futureCalls.filter(dep => {
                      const departureTime = new Date(dep.aimedDepartureTime || dep.aimed);
                      const arrivalTime = new Date(currentTime.getTime() + drivingTimeMinutes * 60000);
                      const timeBuffer = 30 * 60000; // 30 minutter buffer
                      
                      return departureTime >= new Date(arrivalTime.getTime() + timeBuffer);
                    });
                    
                    // Bruk den første passende avgangen, eller den første tilgjengelige hvis ingen passer
                    if (suitableDepartures.length > 0) {
                      nextDeparture = suitableDepartures[0];
                      laterDepartures = suitableDepartures.slice(1, 5);
                    } else {
                      nextDeparture = futureCalls[0];
                      laterDepartures = futureCalls.slice(1, 5);
                    }
                  } else {
                    // Vanlig logikk for korte kjøreturer
                    nextDeparture = futureCalls[0];
                    laterDepartures = futureCalls.slice(1, 5);
                  }
                }
              }

              // Bare vis fergekortet hvis det er avganger
              if (!nextDeparture) {
                return null;
              }
              
              // Sjekk om neste avgang har passert
              if (nextDeparture.aimed <= now) {
                return null;
              }

              return (
                <div key={stopData.id} className="flex flex-col">
                  {/* Km-avstand som egen boks over fergekortet */}
                  {distance && (
                    <div className="bg-blue-500 text-white text-lg font-bold px-2.5 py-1.5 rounded-2xl shadow-lg mb-[-10px] self-start relative z-20 -ml-4">
                      {(() => {
                        const drivingDistance = drivingDistances[stopData.id];
                        const fallbackDistance = distance;
                        const finalDistance = drivingDistance ?? fallbackDistance;
                        

                        
                        return formatDistance(finalDistance);
                      })()}
                    </div>
                  )}
                  
                  <div
                                          id={'ferry-card-' + stopData.id}
                                          className={'relative ' + (distance ? 'rounded-tr-2xl rounded-br-2xl rounded-bl-2xl' : 'rounded-2xl') + ' p-4 sm:p-5 card-expand w-full max-w-[350px] sm:max-w-md bg-white shadow-lg border border-gray-200'}
                    style={{ minWidth: '280px' }}
                  >
                    <h2 
                      className="ferry-quay-name"
                      style={{ 
                        fontSize: getOptimalFontSize(cleanDestinationText(stopData.name || '')),
                        lineHeight: '1.2'
                      }}
                    >
                      {cleanDestinationText(stopData.name || '').toUpperCase()}
                    </h2>
                    <hr className="border-gray-300 my-2" />
                    
                    {/* Kjøretidsbeskrivelse rett etter fergekainavn */}
                    {showDrivingTimes && drivingTimes[stopData.id] && location && (() => {
                      const sub = (stopData?.nextDeparture?.serviceJourney?.journeyPattern?.line?.transportSubmode) || (departures?.[0]?.serviceJourney?.journeyPattern?.line?.transportSubmode) || stopData?.submode || null;
                      const isPassengerOnly = sub && PASSENGER_FERRY_SUBMODES.includes(sub);
                      if (isPassengerOnly) {
                        return (
                          <div className="mt-2 text-sm text-gray-600 leading-relaxed">
                            {`Det tar ca ${formatMinutes(drivingTimes[stopData.id])} å gå.`}
                          </div>
                        );
                      }
                      return (
                        <div className="mt-2 text-sm text-gray-600 leading-relaxed">
                          <div dangerouslySetInnerHTML={{
                            __html: generateTravelDescription(
                              (drivingDistances[stopData.id] ?? distance),
                              drivingTimes[stopData.id],
                              nextDeparture ? calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed) : 0,
                              (() => {
                                const allAvailableDepartures = [];
                                if (departuresMap[stopData.id]) allAvailableDepartures.push(...departuresMap[stopData.id]);
                                if (stop.departures && Array.isArray(stop.departures)) allAvailableDepartures.push(...stop.departures);
                                if (nextDeparture) allAvailableDepartures.push(nextDeparture);
                                if (laterDepartures && Array.isArray(laterDepartures)) allAvailableDepartures.push(...laterDepartures);
                                const uniqueDepartures = allAvailableDepartures.filter((dep, index, self) =>
                                  index === self.findIndex(d => (d.aimedDepartureTime || d.aimed) === (dep.aimedDepartureTime || dep.aimed))
                                );
                                return uniqueDepartures;
                              })(),
                              false
                            )
                          }} />
                        </div>
                      );
                    })()}
                  
                  {nextDeparture ? (
                    <>
                                              <div className="mt-2 text-base sm:text-lg mb-6">
                          <ul className="space-y-0">
                          {(() => {
                            // Kombiner neste avgang og senere avganger til en liste
                            const allDepartures = [nextDeparture, ...laterDepartures].filter(Boolean);
                            // Ekstra filtrering for å sikre at ingen avganger som har passert vises
                            const futureDepartures = allDepartures.filter(dep => dep.aimed > now);
                            
                            // Hvis det er langt å kjøre, finn avganger som passer bedre med kjøretiden
                            let relevantDepartures = futureDepartures;
                            if (showDrivingTimes && drivingTimes[stopData.id] && drivingTimes[stopData.id] > 120) { // Hvis kjøretid > 2 timer
                              const drivingTimeMinutes = drivingTimes[stopData.id];
                              const currentTime = new Date();
                              
                              // Finn avganger som er minst 30 minutter etter ankomsttid
                              relevantDepartures = futureDepartures.filter(dep => {
                                const departureTime = new Date(dep.aimedDepartureTime || dep.aimed);
                                const arrivalTime = new Date(currentTime.getTime() + drivingTimeMinutes * 60000);
                                const timeBuffer = 30 * 60000; // 30 minutter buffer
                                
                                return departureTime >= new Date(arrivalTime.getTime() + timeBuffer);
                              });
                              
                              // Hvis ingen avganger passer, vis de neste 5 avganger som vanlig
                              if (relevantDepartures.length === 0) {
                                relevantDepartures = futureDepartures;
                              }
                            }
                            
                            return relevantDepartures.slice(0, 5).map((dep, idx) => {
                              const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                              const isMissed = isDepartureMissed(dep.aimedDepartureTime || dep.aimed, drivingTimes[stopData.id], showDrivingTimes, mode);
                              const strikeClass = isMissed ? 'line-through' : '';
                              
                              return (
                                <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-0.5 leading-snug">
                                  <span className={`font-bold w-16 text-left text-sm ${strikeClass}`}>
                                    {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                  <span className="flex-1 flex justify-start items-center gap-1">
                                    <span className={`text-sm font-bold align-middle whitespace-nowrap pl-4 ${getDepartureTimeColor(dep.aimedDepartureTime || dep.aimed, drivingTimes[stopData.id], showDrivingTimes, mode)} ${strikeClass}`}>
                                      {formatMinutes(mins)}
                                    </span>
                                  </span>
                                  <span 
                                    className={`w-24 text-gray-700 text-right font-semibold ${strikeClass}`}
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

                      {/* debug removed */}
                      {inlineDestinations[stopData.id] && inlineDestinations[stopData.id].map((destination, destIndex) => (
                                                      <div key={stopData.id + '-' + destination.stopId} className="mt-5 p-4 sm:p-5 rounded-lg bg-gray-100/80 backdrop-blur-md shadow-lg relative">
                          <div className="bg-purple-100 text-purple-700 text-sm font-bold px-2 py-1 rounded-full shadow-lg absolute top-[-10px] left-0 z-20">
                            Retur
                          </div>
                          <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-800">
                              {cleanDestinationText(destination.name).toUpperCase()}
                            </h3>
                          </div>
                          <hr className="border-gray-300 my-2" />
                          <div className="mt-2 text-base sm:text-lg">
                            <ul className="space-y-0">
                              {destination.departures
                                .filter(dep => new Date(dep.aimed) > now)
                                .slice(0, 5).map((dep, idx) => {
                                const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                                const isMissed = isDepartureMissed(dep.aimedDepartureTime || dep.aimed, drivingTimes[destination.stopId], showDrivingTimes, mode);
                                const strikeClass = isMissed ? 'line-through' : '';
                                
                                return (
                                  <li key={'inline-' + destination.stopId + '-' + dep.aimedDepartureTime + '-' + idx} className="flex items-center py-0.5 leading-snug">
                                    <span className={`font-bold w-16 text-left text-sm ${strikeClass}`}>
                                      {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                    <span className="flex-1 flex justify-start items-center gap-1">
                                      <span className={`text-sm font-bold align-middle whitespace-nowrap pl-1 text-green-600 ${strikeClass}`}>
                                        {formatMinutes(mins)}
                                      </span>
                                    </span>
                                    <span 
                                      className={`w-24 text-gray-700 text-right font-semibold ${strikeClass}`}
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
                  ) : null}
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
              : (
                <div>
                  <p className="mb-4">Ingen fergekaier funnet i nærheten</p>
                  <div className="text-sm text-white/80 space-y-2">
                    <p>• Sjekk at GPS er aktivert på enheten din</p>
                    <p>• Tillat posisjonsdeling i nettleseren</p>
                    <p>• Prøv å søke manuelt i stedet</p>
                    <p>• Sjekk internettforbindelsen din</p>
                  </div>
                </div>
              )
            }
          </div>
        )}
        {/* Footer legal links */}
        <div className="mt-auto w-full flex justify-center pt-8 sm:pt-10 pb-8 sm:pb-10">
        </div>
        {/* Legal modal (web only) */}
        <LegalModal
          open={legalModalOpen}
          url={legalModalUrl}
          title={legalModalTitle}
          onClose={() => setLegalModalOpen(false)}
        />
      </div>
    </>
  );
}

export default App;