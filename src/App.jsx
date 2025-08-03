import { useEffect, useState } from 'react';
import Search from './Search';
import { GraphQLClient, gql } from 'graphql-request';
import BottomMenu from './components/BottomMenu';
import LoadingSpinner from './components/LoadingSpinner';
import { 
  ENTUR_ENDPOINT, 
  NEARBY_SEARCH_CONFIG, 
  TRANSPORT_MODES, 
  PAGES, 
  APP_NAME,
  GEOLOCATION_OPTIONS 
} from './constants';
import { 
  formatMinutes, 
  formatDistance, 
  getCurrentTime, 
  calculateTimeDiff, 
  cleanDestinationText,
  extractLocationName 
} from './utils/helpers';

const client = new GraphQLClient(ENTUR_ENDPOINT);


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
      estimatedCalls(timeRange: 7200, numberOfDepartures: 6) {
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
  const [page, setPage] = useState(PAGES.SEARCH);
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [ferryStops, setFerryStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlightedStop, setHighlightedStop] = useState(null);

  useEffect(() => {
    if (page !== PAGES.LOCATION) return;
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
        // Hent fergekaier
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
                }).slice(0, 5);
              } catch {
                departures = [];
              }
              if (departures.length > 0) {
                places.push({ place, distance, departures });
                seenIds.add(place.id);
              }
            }
          }
          setFerryStops(places);
        } catch (err) {
          setError('Kunne ikke hente fergekaier');
        }
        setLoading(false);
      },
      (err) => {
        setError('Geolokasjon feilet, kan ikke hente posisjon');
        setLoading(false);
      },
      GEOLOCATION_OPTIONS
    );
  }, [page]);

  if (page === PAGES.SEARCH) {
    return (
      <div className="bg-gradient flex flex-col items-center py-6 pb-24">
        <Search />
        <BottomMenu page={page} setPage={setPage} />
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <LoadingSpinner />
        <BottomMenu page={page} setPage={setPage} />
      </>
    );
  }

  return (
    <div className="bg-gradient flex flex-col items-center py-6 pb-24">
      <h1 className="text-5xl font-extrabold text-white tracking-widest mb-6 drop-shadow-lg">{APP_NAME}</h1>
      {locationName && (
        <div className="text-lg text-white mb-4 text-center">
          Din posisjon er <span className="font-bold">{locationName}</span>
          <div>
            Klokken er: <span className="font-bold">{getCurrentTime()}</span>
          </div>
        </div>
      )}
      {error && <p className="text-black font-bold">{error}</p>}
      {ferryStops.length === 0 && (
        <p className="text-white">Fant ingen bilferger i nærheten.</p>
      )}
      <div className="w-full max-w-md space-y-8 px-4 sm:px-0">
        {ferryStops.map(({ place, distance, departures }, i) => {
          const isHighlighted = highlightedStop && highlightedStop.place.id === place.id;
          return (
            <div
              key={place.id + '-' + distance}
              className={
                "relative rounded-2xl p-5 glass-card card-expand w-full " +
                (isHighlighted ? "ring-4 ring-fuchsia-400 scale-105 z-10 expanded" : "cursor-pointer")
              }
              onClick={() =>
                isHighlighted
                  ? setHighlightedStop(null)
                  : setHighlightedStop({ place, distance, departures })
              }
            >
              <div className="absolute -top-4 -left-3 distance-badge rounded-lg px-3 py-1 text-base font-bold text-blue-600">
                {formatDistance(distance)}
              </div>
              <h2 className="text-3xl font-bold tracking-wide mb-2 text-gray-900">
                {place.name}
              </h2>
              <hr className="my-2" />
              {departures && departures.length > 0 ? (
                <>
                  <div className="mt-2 text-lg">
                    <div className="text-gray-700 flex flex-row flex-wrap items-center gap-2">
                      {departures[0].aimedDepartureTime ? (
                        <>
                          <span>Neste avgang:</span>
                          <span className="font-extrabold">
                            {new Date(departures[0].aimedDepartureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <span className="text-gray-700 text-base font-normal">–</span>
                          <span className="text-green-600 font-bold text-sm whitespace-nowrap">
                            {formatMinutes(calculateTimeDiff(departures[0].aimedDepartureTime))}
                          </span>
                        </>
                      ) : 'Neste avgang: ?'}
                    </div>
                    <div className="text-gray-700 text-base leading-tight font-semibold">
                      {cleanDestinationText(departures[0].destinationDisplay?.frontText)}
                    </div>
                  </div>
                  {isHighlighted && departures.length > 1 && (
                    <div className="mt-4 departures-list">
                      <div className="text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
                      <ul>
                        {departures.slice(1, 6).map((dep, idx) => {
                          const mins = calculateTimeDiff(dep.aimedDepartureTime);
                          return (
                            <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-1">
                              <span className="font-bold w-16 text-left">{new Date(dep.aimedDepartureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span className="flex-1 flex justify-center">
                                <span className="text-green-600 text-sm font-bold align-middle whitespace-nowrap">{formatMinutes(mins)}</span>
                              </span>
                              <span className="w-24 text-gray-700 text-right font-semibold">{cleanDestinationText(dep.destinationDisplay?.frontText)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Ingen avganger funnet</p>
              )}
            </div>
          );
        })}
      </div>
      <BottomMenu page={page} setPage={setPage} />
    </div>
  );
}

export default App;

