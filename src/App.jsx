import { useEffect, useState, useRef } from 'react';
import { GraphQLClient, gql } from 'graphql-request';
import LoadingSpinner from './components/LoadingSpinner';
import { 
  ENTUR_ENDPOINT, 
  NEARBY_SEARCH_CONFIG, 
  TRANSPORT_MODES, 
  APP_NAME,
  GEOLOCATION_OPTIONS,
  EXCLUDED_SUBMODES
} from './constants';
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
import { calculateDrivingTime, formatDrivingTime, generateTravelDescription } from './utils/openRouteService';

const client = new GraphQLClient(ENTUR_ENDPOINT, {
  headers: { 'ET-Client-Name': 'fergetid-app' }
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

  // GPS state
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');

  // Shared state
  const [ferryStops, setFerryStops] = useState([]);
  const [departuresMap, setDeparturesMap] = useState({});
  const [selectedStop, setSelectedStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [cardLoading, setCardLoading] = useState({}); // Separate loading state for individual cards
  const [error, setError] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [mode, setMode] = useState('search'); // 'search' or 'gps'
  
  // Cache for all ferry stops (for autocomplete)
  const [allFerryStops, setAllFerryStops] = useState([]);
  const [ferryStopsLoaded, setFerryStopsLoaded] = useState(false);
  
  // Driving times state
  const [drivingTimes, setDrivingTimes] = useState({});
  const [drivingTimesLoading, setDrivingTimesLoading] = useState({});

  // Auto-focus search input when component mounts
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);



  // Load all ferry stops once for autocomplete (optimized)
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
        setAllFerryStops(stops);
        setFerryStopsLoaded(true);
      } catch (error) {
        console.error('Error loading ferry stops:', error);
        setFerryStopsLoaded(true); // Sett til true selv ved feil for å unngå evig lasting
      }
    };

    loadAllFerryStops();
  }, []);

  // Live search effect - show ferry cards as user types
  useEffect(() => {
    // Kun kjøre live search hvis brukeren faktisk har skrevet noe OG vi har data
    if (!query.trim() || !ferryStopsLoaded || allFerryStops.length === 0) {
      setFerryStops([]);
      setHasInteracted(false);
      setSelectedStop(null);
      setDrivingTimes({});
      setDrivingTimesLoading({});
      return;
    }

    const performLiveSearch = async () => {
      const normQuery = normalizeText(query).toLowerCase();
      
      let stops = allFerryStops.filter(stop => 
        normalizeText(stop.name).includes(normQuery)
      );
      
      // Sorter slik at treff som starter med søkeordet kommer øverst
      stops = stops.sort((a, b) => {
        const aName = normalizeText(a.name).toLowerCase();
        const bName = normalizeText(b.name).toLowerCase();
        if (aName.startsWith(normQuery) && !bName.startsWith(normQuery)) return -1;
        if (!aName.startsWith(normQuery) && bName.startsWith(normQuery)) return 1;
        return aName.localeCompare(bName);
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
        
        stopsWithDepartures.push({
          id: stop.id,
          name: stop.name,
          distance: null, // No distance for search results
          departures: departures
        });
      }
      
      const formattedStops = stopsWithDepartures.filter(stop => stop.id);
      
      // Kun sett hasInteracted til true hvis vi faktisk har resultater
      if (formattedStops.length > 0) {
        setFerryStops(formattedStops);
        setHasInteracted(true);
        setSelectedStop(formattedStops[0].id);
        // Auto-scroll til det første kortet med 4 sekunders delay
        setTimeout(() => {
          const cardElement = document.getElementById(`ferry-card-${formattedStops[0].id}`);
          if (cardElement) {
            cardElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center',
              inline: 'nearest'
            });
          }
        }, 4000);
      } else {
        setFerryStops([]);
        setHasInteracted(false);
        setSelectedStop(null);
        setDrivingTimes({});
        setDrivingTimesLoading({});
      }
    };

    // Debounce the live search
    const timeoutId = setTimeout(performLiveSearch, 300);
    return () => clearTimeout(timeoutId);
  }, [query, allFerryStops, ferryStopsLoaded]);

  // GPS functionality
  const handleGPSLocation = async () => {
    setMode('gps');
    setLoading(true);
    setError(null);
    setQuery('');
    setFerryStops([]);
    setHasInteracted(false);
    setSelectedStop(null);
    setDrivingTimes({});
    setDrivingTimesLoading({});
    
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
        
        // Hent fergekaier med neste avgang
        try {
          const data = await client.request(NEARBY_QUERY, { latitude, longitude });
          const places = [];
          const seenIds = new Set();
          
          for (const e of data.nearest.edges) {
            const { place, distance } = e.node;
            if (place && place.id && !seenIds.has(place.id)) {
              // Ekskluder hurtigbåtkai og kystrutekai basert på navn og transportSubmode
              const name = (place.name || '').toLowerCase();
              if (name.includes('hurtigbåt') || name.includes('express boat') || name.includes('kystrute') || 
                  EXCLUDED_SUBMODES.includes(place.transportSubmode)) {
                continue;
              }
              // Hent neste avgang for denne fergekaien
              let nextDeparture = null;
              try {
                const depData = await client.request(DEPARTURES_QUERY, { id: place.id });
                const calls = depData.stopPlace?.estimatedCalls || [];
                const filteredCalls = calls
                  .filter((call) => {
                    const line = call.serviceJourney?.journeyPattern?.line;
                    return line && line.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY;
                  })
                  .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));
                
                if (filteredCalls.length > 0) {
                  nextDeparture = filteredCalls[0]; // Kun neste avgang
                }
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
          
          setFerryStops(places);
          setHasInteracted(true);
          
          // Calculate driving times for all ferry stops
          if (places.length > 0) {
            const startCoords = { lat: latitude, lng: longitude };
            
            for (const place of places) {
              const stopId = place.id;
              setDrivingTimesLoading(prev => ({ ...prev, [stopId]: true }));
              
              try {
                const endCoords = { lat: place.latitude, lng: place.longitude };
                const drivingTime = await calculateDrivingTime(startCoords, endCoords);
                
                setDrivingTimes(prev => ({
                  ...prev,
                  [stopId]: drivingTime
                }));
              } catch (error) {
                console.error(`Error calculating driving time for ${place.name}:`, error);
              } finally {
                setDrivingTimesLoading(prev => ({ ...prev, [stopId]: false }));
              }
            }
          }
          
          // Automatisk utvid det første kortet hvis vi har resultater
          if (places.length > 0) {
            setSelectedStop(places[0].id);
            
            // Hent alle avganger for det første kortet automatisk
            const firstStop = places[0];
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
            
            // Auto-scroll til det første kortet
            setTimeout(() => {
              const cardElement = document.getElementById(`ferry-card-${places[0].id}`);
              if (cardElement) {
                cardElement.scrollIntoView({ 
                  behavior: 'smooth', 
                  block: 'center',
                  inline: 'nearest'
                });
              }
            }, 100);
          }
        } catch (err) {
          setError('Kunne ikke hente fergekaier');
          console.error('Error fetching ferry stops:', err);
        } finally {
          setLoading(false);
        }
      },
      (err) => {
        setError('Kunne ikke få tilgang til plassering');
        setLoading(false);
        console.error('Geolocation error:', err);
      },
      GEOLOCATION_OPTIONS
    );
  };



  const handleShowDepartures = async (stop) => {
    // Sjekk at stop og stop.id eksisterer
    if (!stop || !stop.id) {
      console.error('Invalid stop object:', stop);
      return;
    }

    // Hvis kortet allerede er utvidet, bare toggle
    if (selectedStop === stop.id) {
      setSelectedStop(null);
      return;
    }

    // Sjekk om vi allerede har alle avganger for denne fergekaien
    const hasAllDepartures = departuresMap[stop.id] && departuresMap[stop.id].length > 1;
    
    // Hvis vi har alle avganger, bare utvid
    if (hasAllDepartures) {
      setSelectedStop(stop.id);
      // Auto-scroll til kortet
      setTimeout(() => {
        const cardElement = document.getElementById(`ferry-card-${stop.id}`);
        if (cardElement) {
          cardElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 100);
      return;
    }

    // Hent avganger for første gang
    setCardLoading(prev => ({ ...prev, [stop.id]: true }));
    try {
      const data = await client.request(DEPARTURES_QUERY, { id: stop.id });
      const calls = data.stopPlace.estimatedCalls || [];
      
      // Filter and sort departures
      const filteredCalls = calls
        .filter(call => call.serviceJourney?.journeyPattern?.line?.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY)
        .sort((a, b) => new Date(a.aimedDepartureTime) - new Date(b.aimedDepartureTime));

      setDeparturesMap(prev => ({
        ...prev,
        [stop.id]: filteredCalls
      }));
      setSelectedStop(stop.id);
      // Auto-scroll til kortet
      setTimeout(() => {
        const cardElement = document.getElementById(`ferry-card-${stop.id}`);
        if (cardElement) {
          cardElement.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 100);
    } catch (err) {
      console.error('Error fetching departures:', err);
      setSelectedStop(stop.id); // Fortsett å vise kortet som utvidet selv om det feiler
    } finally {
      setCardLoading(prev => ({ ...prev, [stop.id]: false }));
    }
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

  const getDepartureTimeColor = (departureTime, drivingTime) => {
    if (!drivingTime || mode !== 'gps') return 'text-green-600'; // Default green for search mode
    
    const timeToDeparture = calculateTimeDiff(departureTime);
    const canMakeIt = timeToDeparture > drivingTime;
    
    return canMakeIt ? 'text-green-600' : 'text-red-600';
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
      <div className="bg-gradient flex flex-col items-center py-4 sm:py-6 pb-16 sm:pb-24">
        <h1 className="text-5xl sm:text-7xl font-extrabold text-white tracking-tight mb-4 sm:mb-6 drop-shadow-lg fergetid-title">{APP_NAME}</h1>
      
      {/* Search Section */}
      <div className="w-full max-w-[350px] sm:max-w-md mb-6 sm:mb-8 px-3 sm:px-4 mt-8 sm:mt-12">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Søk fergekai eller klikk GPS"
              className="w-full px-4 py-3 rounded-lg bg-white/90 backdrop-blur-md shadow-lg border border-fuchsia-200 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
            />
            

          </div>
          

          
          <button
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

      {/* Loading and Error States */}
      {(loading || !ferryStopsLoaded) && (
        <div className="mt-8 sm:mt-12">
          <LoadingSpinner 
            message={!ferryStopsLoaded ? "Laster fergekaier..." : "Laster posisjon og fergekaier..."} 
          />
        </div>
      )}
      {error && (
        <div className="text-center text-white bg-red-500/20 p-4 rounded-lg mb-6 border border-red-300/30">
          {error}
        </div>
      )}

                 {/* Results */}
         {hasInteracted && !loading && ferryStops.length > 0 && (
           <div className="w-full max-w-[350px] sm:max-w-md space-y-10 sm:space-y-12 px-3 sm:px-4 sm:px-0 mx-auto mt-4">
             {ferryStops.map((stop, i) => {
               // Handle both GPS format (with nextDeparture) and search format (with departures array)
               const isGPSFormat = stop.nextDeparture !== undefined;
               const isSearchFormat = stop.departures !== undefined;
               const stopData = stop; // Samme format for begge nå
               const distance = stop.distance;
               const departures = isGPSFormat ? (departuresMap[stop.id] || []) : 
                                 isSearchFormat ? (stop.departures || []) : 
                                 (departuresMap[stop.id] || []);
               const isExpanded = selectedStop === stopData.id;
               const now = new Date();
               
               // Find the next and later departures
               let nextDeparture = null;
               let laterDepartures = [];
               
               if (isGPSFormat && stop.nextDeparture) {
                 // GPS-format: bruk nextDeparture som allerede er hentet
                 nextDeparture = { ...stop.nextDeparture, aimed: new Date(stop.nextDeparture.aimedDepartureTime) };
                 
                 // Hvis kortet er utvidet, bruk departuresMap for senere avganger
                 if (isExpanded && departuresMap[stop.id]) {
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
                 <div
                   id={`ferry-card-${stopData.id}`}
                   key={stopData.id + '-' + (distance || '')}
                   className={`relative rounded-2xl p-4 sm:p-5 glass-card card-expand w-full max-w-[350px] sm:max-w-[370px] ${
                     isExpanded ? 'expanded' : 'cursor-pointer'
                   }`}
                   style={{ minWidth: '280px', maxWidth: '350px' }}
                   onClick={() => handleShowDepartures(stopData)}
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
                   
                   {distance && (
                     <div className="text-sm text-gray-600">
                                              {mode === 'gps' && drivingTimes[stopData.id] && nextDeparture ? (
                         <div className="text-gray-700" style={{ 
                           '--tw-text-opacity': '1'
                         }} dangerouslySetInnerHTML={{
               __html: generateTravelDescription(
                 distance,
                 drivingTimes[stopData.id],
                 calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed),
                 departures
               )
             }} />
                       ) : mode === 'gps' && drivingTimesLoading[stopData.id] ? (
                         <div>
                           <span className="text-blue-600">{formatDistance(distance)}</span>
                           <span className="text-gray-500"> / </span>
                           <span className="text-gray-400">Laster...</span>
                         </div>
                       ) : (
                         <div className="text-blue-600">{formatDistance(distance)}</div>
                       )}
                     </div>
                   )}
                   
                   
                   {nextDeparture ? (
                     <>
                       <div className="mt-2 text-base sm:text-lg">
                         <div className="text-gray-700 flex flex-row flex-wrap items-center gap-2">
                           <span>Neste avgang:</span>
                         </div>
                         <div className="flex items-center py-1">
                           <span className="font-bold w-16 text-left">
                             {nextDeparture.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </span>
                           <span className="flex-1 flex justify-center">
                             <span className={`text-sm font-bold align-middle whitespace-nowrap ${getDepartureTimeColor(nextDeparture.aimedDepartureTime || nextDeparture.aimed, drivingTimes[stopData.id])}`}>
                               {formatMinutes(calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed))}
                             </span>
                           </span>
                           <span 
                             className="w-24 text-gray-700 text-right font-semibold"
                             style={{ 
                               fontSize: getOptimalFontSize(cleanDestinationText(nextDeparture.destinationDisplay?.frontText), 96) // 96px = 6rem = w-24
                             }}
                           >
                             {cleanDestinationText(nextDeparture.destinationDisplay?.frontText)}
                           </span>
                         </div>
                       </div>
                       
                       {/* Vis kun "Senere avganger" hvis vi har data eller kortet er utvidet */}
                       {(laterDepartures.length > 0 || isExpanded) && (
                         <div className="mt-4 departures-list">
                           <div className="text-base sm:text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
                           <ul>
                             {laterDepartures.length > 0 ? (
                               laterDepartures.map((dep, idx) => {
                                 const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                                 return (
                                   <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-1">
                                     <span className="font-bold w-16 text-left">
                                       {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                     </span>
                                     <span className="flex-1 flex justify-center">
                                       <span className={`text-sm font-bold align-middle whitespace-nowrap ${getDepartureTimeColor(dep.aimedDepartureTime || dep.aimed, drivingTimes[stopData.id])}`}>
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
                               })
                             ) : (
                               <li className="text-gray-500 text-sm py-2">
                                 {cardLoading[stopData.id] ? "Laster senere avganger..." : "Ingen senere avganger"}
                               </li>
                             )}
                           </ul>
                         </div>
                       )}
                       
                       {/* Symbol for å indikere utvidelse - midtstilt og stikker ut */}
                       <div className="absolute left-1/2 -translate-x-1/2 bottom-[-12px] flex pointer-events-none select-none">
                         <span className="bg-gray-200 rounded-full px-2.5 py-0.5 flex items-center shadow-md" style={{minWidth:'31px', minHeight:'17px'}}>
                           <span className="mx-0.5 w-1 h-1 bg-gray-500 rounded-full inline-block"></span>
                           <span className="mx-0.5 w-1 h-1 bg-gray-500 rounded-full inline-block"></span>
                           <span className="mx-0.5 w-1 h-1 bg-gray-500 rounded-full inline-block"></span>
                         </span>
                       </div>
                     </>
                   ) : (
                     <p className="mt-2 text-sm text-gray-500">Ingen avganger funnet</p>
                   )}
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

