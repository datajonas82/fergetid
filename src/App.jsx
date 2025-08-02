import { useEffect, useState } from 'react';
import Search from './Search';
import { GraphQLClient, gql } from 'graphql-request';

const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';
const client = new GraphQLClient(ENTUR_ENDPOINT);

function BottomMenu({ page, setPage }) {
  return (
    <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-fuchsia-200 flex justify-center z-50">
      <button
        className={'flex-1 py-3 text-lg font-bold ' + (page === 'lokasjon' ? 'text-fuchsia-700' : 'text-gray-400')}
        onClick={() => setPage('lokasjon')}
      >
        Auto GPS
      </button>
      <button
        className={'flex-1 py-3 text-lg font-bold ' + (page === 'sok' ? 'text-fuchsia-700' : 'text-gray-400')}
        onClick={() => setPage('sok')}
      >
        Søk
      </button>
    </nav>
  );
}


const NEARBY_QUERY = gql`
  query NearestStops($latitude: Float!, $longitude: Float!) {
    nearest(
      latitude: $latitude,
      longitude: $longitude,
      maximumDistance: 50000,
      maximumResults: 80,
      filterByModes: [water]
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

// Hjelpefunksjon for å vise tid til neste avgang
function formatMinutes(mins) {
  if (mins < 1) return 'nå';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} time${h > 1 ? 'r' : ''}${m > 0 ? ` ${m} min` : ''}`;
}

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
  const [page, setPage] = useState('lokasjon');
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState('');
  const [ferryStops, setFerryStops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [highlightedStop, setHighlightedStop] = useState(null);

  useEffect(() => {
    if (page !== 'lokasjon') return;
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
          // Prøv å finne by, tettsted, eller lignende
          let sted =
            data.address?.city ||
            data.address?.town ||
            data.address?.village ||
            data.address?.suburb ||
            data.address?.hamlet ||
            data.address?.municipality ||
            data.address?.county ||
            null;
          setLocationName(sted || 'Ukjent sted');
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
                  return line && line.transportSubmode === 'localCarFerry';
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
      { enableHighAccuracy: true }
    );
  }, [page]);

  if (page === 'sok') {
    return (
      <div className="min-h-screen bg-[#d95cff] flex flex-col items-center py-6 pb-24">
        <Search />
        <BottomMenu page={page} setPage={setPage} />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#d95cff] flex flex-col items-center justify-center py-6">
        <h1 className="text-5xl font-extrabold text-white tracking-widest mb-6">FERGETID</h1>
        <div className="flex flex-col items-center">
          <span className="relative flex h-12 w-12 mb-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40"></span>
            <span className="relative inline-flex rounded-full h-12 w-12 border-4 border-t-fuchsia-200 border-b-fuchsia-700 border-l-white border-r-white animate-spin"></span>
          </span>
          <p className="text-lg text-white font-semibold">Laster posisjon og fergekaier...</p>
        </div>
        <BottomMenu page={page} setPage={setPage} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#d95cff] flex flex-col items-center py-6 pb-24">
      <h1 className="text-5xl font-extrabold text-white tracking-widest mb-6">FERGETID</h1>
      {locationName && (
        <div className="text-lg text-white mb-4 text-center">
          Din posisjon er <span className="font-bold">{locationName}</span>
          <div>
            Klokken er: <span className="font-bold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
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
                "relative rounded-2xl p-5 shadow-lg bg-white transition-all duration-200 " +
                (isHighlighted ? "ring-4 ring-fuchsia-400 scale-105 z-10" : "cursor-pointer")
              }
              onClick={() =>
                isHighlighted
                  ? setHighlightedStop(null)
                  : setHighlightedStop({ place, distance, departures })
              }
            >
              <div className="absolute -top-4 -left-3 bg-white rounded-lg px-3 py-1 shadow text-base font-bold text-blue-600 border border-gray-200">
                {distance ? `${Math.round(distance / 1000)} KM` : '? KM'}
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
                            {formatMinutes(
                              Math.max(
                                0,
                                Math.round(
                                  (new Date(departures[0].aimedDepartureTime) - new Date()) / 60000
                                )
                              )
                            )}
                          </span>
                        </>
                      ) : 'Neste avgang: ?'}
                    </div>
                    <div className="text-gray-500 text-base leading-tight">
                      {(departures[0].destinationDisplay?.frontText || '').replace(/E39/gi, '').replace(/  +/g, ' ').trim()}
                    </div>
                  </div>
                  {isHighlighted && departures.length > 1 && (
                    <div className="mt-4">
                      <div className="text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
                      <ul>
                        {departures.slice(1, 6).map((dep, idx) => {
                          const mins = Math.max(
                            0,
                            Math.round(
                              (new Date(dep.aimedDepartureTime) - new Date()) / 60000
                            )
                          );
                          return (
                            <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-1">
                              <span className="font-bold w-16 text-left">{new Date(dep.aimedDepartureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span className="flex-1 flex justify-center">
                                <span className="text-green-600 text-sm font-bold align-middle whitespace-nowrap">{formatMinutes(mins)}</span>
                              </span>
                              <span className="w-24 text-gray-500 text-right">{(dep.destinationDisplay?.frontText || '').replace(/E39/gi, '').replace(/  +/g, ' ').trim()}</span>
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

