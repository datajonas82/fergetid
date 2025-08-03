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
  const [error, setError] = useState(null);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [mode, setMode] = useState('search'); // 'search' or 'gps'

  // Auto-focus search input when component mounts
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  // Generate suggestions based on query
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const generateSuggestions = async () => {
      try {
        const data = await client.request(ALL_FERRY_STOPS_QUERY);

        let stops = (data.stopPlaces || []).filter(
          (stop) => {
            if (!Array.isArray(stop.transportMode) || !stop.transportMode.includes('water')) return false;
            if (EXCLUDED_SUBMODES.includes(stop.transportSubmode)) return false;
            const name = (stop.name || '').toLowerCase();
            if (!(name.includes('fergekai') || name.includes('ferjekai'))) return false;
            return normalizeText(stop.name).includes(normalizeText(query));
          }
        );
        
        // Sorter slik at treff som starter med søkeordet kommer øverst
        const normQuery = normalizeText(query).toLowerCase();
        stops = stops.sort((a, b) => {
          const aName = normalizeText(a.name).toLowerCase();
          const bName = normalizeText(b.name).toLowerCase();
          if (aName.startsWith(normQuery) && !bName.startsWith(normQuery)) return -1;
          if (!aName.startsWith(normQuery) && bName.startsWith(normQuery)) return 1;
          if (aName.includes(normQuery) && !bName.includes(normQuery)) return -1;
          if (!aName.includes(normQuery) && bName.includes(normQuery)) return 1;
          return aName.localeCompare(bName);
        });
        
        // Limit to 5 suggestions and format them
        const formattedSuggestions = stops.slice(0, 5).map(stop => ({
          id: stop.id,
          name: stop.name,
          displayName: stop.name
        }));

        setSuggestions(formattedSuggestions);
        setShowSuggestions(true);
      } catch (error) {
        console.error('Error generating suggestions:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    };

    const timeoutId = setTimeout(generateSuggestions, 300);
    return () => clearTimeout(timeoutId);
  }, [query]);

  // GPS functionality
  const handleGPSLocation = async () => {
    setMode('gps');
    setLoading(true);
    setError(null);
    setQuery('');
    setSuggestions([]);
    setShowSuggestions(false);
    
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
        
        // Hent fergekaier med avganger
        try {
          const data = await client.request(NEARBY_QUERY, { latitude, longitude });
          const places = [];
          const seenIds = new Set();
          
          for (const e of data.nearest.edges) {
            const { place, distance } = e.node;
            if (place && !seenIds.has(place.id)) {
              let departures = [];
              try {
                const depData = await client.request(DEPARTURES_QUERY, { id: place.id });
                const calls = depData.stopPlace?.estimatedCalls || [];
                departures = calls.filter((call) => {
                  const line = call.serviceJourney?.journeyPattern?.line;
                  return line && line.transportSubmode === TRANSPORT_MODES.LOCAL_CAR_FERRY;
                });
              } catch {
                departures = [];
              }
              if (departures.length > 0) {
                places.push({ 
                  place, 
                  distance, 
                  departures 
                });
                seenIds.add(place.id);
              }
            }
          }
          
          setFerryStops(places);
          setHasInteracted(true);
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

  // Search functionality
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    setMode('search');
    setLoading(true);
    setError(null);
    setShowSuggestions(false);
    
    try {
      const data = await client.request(ALL_FERRY_STOPS_QUERY);
      
      let stops = (data.stopPlaces || []).filter(
        (stop) => {
          if (!Array.isArray(stop.transportMode) || !stop.transportMode.includes('water')) return false;
          if (EXCLUDED_SUBMODES.includes(stop.transportSubmode)) return false;
          const name = (stop.name || '').toLowerCase();
          if (!(name.includes('fergekai') || name.includes('ferjekai'))) return false;
          return normalizeText(stop.name).includes(normalizeText(query));
        }
      );
      
      // Sorter etter relevans
      const normQuery = normalizeText(query).toLowerCase();
      stops = stops.sort((a, b) => {
        const aName = normalizeText(a.name).toLowerCase();
        const bName = normalizeText(b.name).toLowerCase();
        if (aName.startsWith(normQuery) && !bName.startsWith(normQuery)) return -1;
        if (!aName.startsWith(normQuery) && bName.startsWith(normQuery)) return 1;
        return aName.localeCompare(bName);
      });
      
      const formattedStops = stops.map(stop => ({
        id: stop.id,
        name: stop.name,
        distance: null // No distance for search results
      }));
      
      setFerryStops(formattedStops);
      setHasInteracted(true);
    } catch (err) {
      setError('Kunne ikke søke etter fergekaier');
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleShowDepartures = async (stop) => {
    if (departuresMap[stop.id]) {
      setSelectedStop(selectedStop === stop.id ? null : stop.id);
      return;
    }

    setLoading(true);
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
    } catch (err) {
      console.error('Error fetching departures:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    setQuery(suggestion.name);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions) return;
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedSuggestionIndex >= 0) {
          handleSuggestionClick(suggestions[selectedSuggestionIndex]);
        } else {
          handleSearch(e);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedSuggestionIndex(-1);
        break;
    }
  };

  return (
    <div className="bg-gradient flex flex-col items-center py-6 pb-24">
      <h1 className="text-5xl font-extrabold text-white tracking-widest mb-6 drop-shadow-lg">{APP_NAME}</h1>
      
      {/* Search Section */}
      <div className="w-full max-w-md mb-8 px-4">
        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="flex-1 relative">
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Søk etter fergekai..."
              className="w-full px-4 py-3 rounded-lg bg-white/90 backdrop-blur-sm shadow-lg border border-fuchsia-200 focus:border-fuchsia-400 focus:outline-none focus:ring-2 focus:ring-fuchsia-200"
            />
            
            {/* Suggestions dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg shadow-lg border border-fuchsia-200 z-10 max-h-60 overflow-y-auto">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    type="button"
                    onClick={() => handleSuggestionClick(suggestion)}
                    className={`w-full px-4 py-3 text-left hover:bg-fuchsia-50 transition-colors ${
                      index === selectedSuggestionIndex ? 'bg-fuchsia-100' : ''
                    } ${index === 0 ? 'rounded-t-lg' : ''} ${index === suggestions.length - 1 ? 'rounded-b-lg' : ''}`}
                  >
                    {suggestion.displayName}
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            type="submit"
            className="px-6 py-3 bg-fuchsia-700/90 hover:bg-fuchsia-800/90 backdrop-blur-sm text-white font-semibold rounded-lg shadow-lg transition-colors"
          >
            Søk
          </button>
          
          <button
            type="button"
            onClick={handleGPSLocation}
            className="px-4 py-3 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white font-semibold rounded-lg shadow-lg transition-colors border border-white/30"
            title="Bruk GPS-plassering"
          >
            ⊕
          </button>
        </form>
      </div>

      {/* Loading and Error States */}
      {loading && <LoadingSpinner />}
      {error && (
        <div className="text-center text-white bg-red-500/20 p-4 rounded-lg mb-6 border border-red-300/30">
          {error}
        </div>
      )}

      {/* GPS Location Display */}
      {mode === 'gps' && locationName && (
        <div className="text-lg text-white mb-4 text-center">
          Din posisjon er <span className="font-bold">{locationName}</span>
          <div>
            Klokken er: <span className="font-bold">{getCurrentTime()}</span>
          </div>
        </div>
      )}

                 {/* Results */}
         {hasInteracted && !loading && ferryStops.length > 0 && (
           <div className="w-full max-w-md space-y-8 px-4 sm:px-0 mx-auto">
             {ferryStops.map((stop, i) => {
               // Handle both old GPS format and new search format
               const isGPSFormat = stop.place;
               const stopData = isGPSFormat ? stop.place : stop;
               const distance = isGPSFormat ? stop.distance : stop.distance;
               const departures = isGPSFormat ? (stop.departures || []) : (departuresMap[stop.id] || []);
               const isExpanded = selectedStop === stopData.id;
               const now = new Date();
               
               // Find the next and later departures
               let nextDeparture = null;
               let laterDepartures = [];
               if (departures && departures.length > 0) {
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
                   key={stopData.id + '-' + (distance || '')}
                   className={`relative rounded-2xl p-5 glass-card card-expand w-full max-w-[370px] ${
                     isExpanded ? 'expanded' : 'cursor-pointer'
                   }`}
                   style={{ minWidth: '320px', maxWidth: '370px' }}
                   onClick={() => handleShowDepartures(stopData)}
                 >
                   {distance && (
                     <div className="absolute -top-4 -left-3 distance-badge rounded-lg px-3 py-1 text-base font-bold text-blue-600">
                       {formatDistance(distance)}
                     </div>
                   )}
                   
                   <h2 className="ferry-quay-name">
                     {cleanDestinationText(stopData.name || '')}
                   </h2>
                   
                   <hr />
                   
                   {nextDeparture ? (
                     <>
                       <div className="mt-2 text-lg">
                         <div className="text-gray-700 flex flex-row flex-wrap items-center gap-2">
                           <span>Neste avgang:</span>
                         </div>
                         <div className="flex items-center py-1">
                           <span className="font-bold w-16 text-left">
                             {nextDeparture.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                           </span>
                           <span className="flex-1 flex justify-center">
                             <span className="text-green-600 text-sm font-bold align-middle whitespace-nowrap">
                               {formatMinutes(calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed))}
                             </span>
                           </span>
                           <span className="w-24 text-gray-700 text-right font-semibold">
                             {cleanDestinationText(nextDeparture.destinationDisplay?.frontText)}
                           </span>
                         </div>
                       </div>
                       
                       <div className="mt-4 departures-list">
                         <div className="text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
                         <ul>
                           {laterDepartures.map((dep, idx) => {
                             const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                             return (
                               <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-1">
                                 <span className="font-bold w-16 text-left">
                                   {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                 </span>
                                 <span className="flex-1 flex justify-center">
                                   <span className="text-green-600 text-sm font-bold align-middle whitespace-nowrap">
                                     {formatMinutes(mins)}
                                   </span>
                                 </span>
                                 <span className="w-24 text-gray-700 text-right font-semibold">
                                   {cleanDestinationText(dep.destinationDisplay?.frontText)}
                                 </span>
                               </li>
                             );
                           })}
                         </ul>
                       </div>
                       
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
     </div>
  );
}

export default App;

