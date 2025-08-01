// Hjelpefunksjon for å oversette nynorsk 'ferjekai' til bokmål 'fergekai'
function bokmaalify(text) {
  if (!text) return text;
  return text.replace(/ferjekai/gi, 'fergekai');
}
import { useEffect, useState, useCallback } from 'react';
import { GraphQLClient, gql } from 'graphql-request';

const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';
const client = new GraphQLClient(ENTUR_ENDPOINT);

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

const DEPARTURES_QUERY = gql`
  query StopPlaceDepartures($id: String!) {
    stopPlace(id: $id) {
      name
      estimatedCalls(timeRange: 72100, numberOfDepartures: 20) {
        aimedDepartureTime
        destinationDisplay {
          frontText
        }
        serviceJourney {
          journeyPattern {
            line {
              transportMode
              transportSubmode
            }
          }
        }
      }
    }
  }
`;

const LOCAL_KEY = 'fergetid_ferrystops_v1';

export default function AppLokal() {
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [ferryStops, setFerryStops] = useState([]);
  const [highlightedStop, setHighlightedStop] = useState(null);
  const [departures, setDepartures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  // Geolokasjon og stedsnavn
  useEffect(() => {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        };
        setLocation(coords);

        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=nb`
          );
          const data = await res.json();
          const address = data.address || {};
          const mainPlace =
            address.city ||
            address.town ||
            address.village ||
            address.hamlet ||
            address.locality ||
            address.suburb;
          let name;
          if (mainPlace) {
            name = mainPlace;
          } else if (
            address.county ||
            address.state ||
            address.region
          ) {
            const nearby =
              address.city ||
              address.town ||
              address.village ||
              address.hamlet ||
              address.locality ||
              address.suburb;
            if (nearby) {
              name = `i nærheten av ${nearby}`;
            } else {
              name =
                address.county ||
                address.state ||
                address.region ||
                address.country ||
                'ukjent sted';
            }
          } else {
            name = address.country || 'ukjent sted';
          }
          setLocationName(name);
        } catch {
          setLocationName('ukjent sted');
        }
      },
      (err) => {
        setError('Geolokasjon feilet, kan ikke hente posisjon');
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  // Hent stopp og avganger fra localStorage eller API
  const fetchAndStoreStops = useCallback(async (coords) => {
    setLoading(true);
    setError(null);
    try {
      const data = await client.request(NEARBY_QUERY, {
        latitude: coords.latitude,
        longitude: coords.longitude,
      });
      const places = [];
      const seenIds = new Set();
      for (const e of data.nearest.edges) {
        const { place, distance } = e.node;
        if (place && !seenIds.has(place.id)) {
          let departures = [];
          try {
            const depData = await client.request(DEPARTURES_QUERY, { id: place.id });
            const calls = depData.stopPlace?.estimatedCalls || [];
            departures = calls
              .filter((call) => {
                const line = call.serviceJourney?.journeyPattern?.line;
                return line && line.transportSubmode === 'localCarFerry';
              })
              .slice(0, 5);
          } catch {
            departures = [];
          }
          if (departures.length > 0) {
            places.push({ place, distance, departures });
            seenIds.add(place.id);
          }
        }
      }
      localStorage.setItem(LOCAL_KEY, JSON.stringify(places));
      setFerryStops(places);
      setLoading(false);
    } catch (err) {
      setError('Kunne ikke hente fergekaier');
      setLoading(false);
    }
  }, []);

  // Automatisk oppdatering hvert 15. minutt
  useEffect(() => {
    if (!location) return;
    const interval = setInterval(() => {
      fetchAndStoreStops(location);
    }, 15 * 60 * 1000); // 15 minutter
    return () => clearInterval(interval);
  }, [location, fetchAndStoreStops]);

  useEffect(() => {
    if (!location) return;
    // Prøv localStorage først
    const cached = localStorage.getItem(LOCAL_KEY);
    if (cached) {
      setFerryStops(JSON.parse(cached));
      setLoading(false);
    } else {
      fetchAndStoreStops(location);
    }
  }, [location, fetchAndStoreStops]);

  // Manuell oppdatering (pull to refresh)
  const handleRefresh = async () => {
    if (!location) return;
    setRefreshing(true);
    await fetchAndStoreStops(location);
    setRefreshing(false);
  };

  // Hent avganger for valgt stopp (alltid live)
  useEffect(() => {
    if (!highlightedStop) {
      setDepartures([]);
      return;
    }
    const fetchDepartures = async () => {
      try {
        const data = await client.request(DEPARTURES_QUERY, { id: highlightedStop.place.id });
        const calls = data.stopPlace?.estimatedCalls || [];
        const ferryDepartures = calls.filter((call) => {
          const line = call.serviceJourney?.journeyPattern?.line;
          if (!line) return false;
          return (
            line.transportSubmode === 'localCarFerry' ||
            line.transportMode === 'water'
          );
        });
        setDepartures(ferryDepartures);
      } catch (err) {
        setError('Kunne ikke hente avganger for valgt fergekai');
      }
    };
    fetchDepartures();
  }, [highlightedStop]);

  if (loading) {
    return (
      <div className="min-h-screen bg-fuchsia-500 flex flex-col items-center justify-center py-6">
        <h1 className="text-5xl font-extrabold text-white tracking-widest mb-6">FERGETID</h1>
        <div className="flex flex-col items-center">
          <span className="relative flex h-12 w-12 mb-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-40"></span>
            <span className="relative inline-flex rounded-full h-12 w-12 border-4 border-t-fuchsia-200 border-b-fuchsia-700 border-l-white border-r-white animate-spin"></span>
          </span>
          <p className="text-lg text-white font-semibold">Laster posisjon og fergekaier...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-fuchsia-500 flex flex-col items-center py-6">
      <h1 className="text-5xl font-extrabold text-white tracking-widest mb-6">FERGETID</h1>
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="mb-4 px-4 py-2 bg-white text-fuchsia-700 font-bold rounded-lg shadow hover:bg-fuchsia-100 transition disabled:opacity-50"
      >
        {refreshing ? 'Oppdaterer...' : 'Oppdater fergetider'}
      </button>
      {locationName && (
        <div className="text-lg text-white mb-4 text-center">
          <div>
            Din posisjon er <span className="font-bold">{locationName}</span>
          </div>
          <div>
            Klokken er: <span className="font-bold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
      )}
      {error && <p className="text-black font-bold">{error}</p>}
      {ferryStops.length === 0 && (
        <p className="text-white">Fant ingen bilferger i nærheten.</p>
      )}
      <div className="w-full max-w-md space-y-6 px-4 sm:px-0">
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
                {bokmaalify(place.name)}
              </h2>
              <hr className="my-2" />
              {departures && departures.length > 0 ? (
                <>
                  <div className="mt-2 text-lg">
                    <div className="text-gray-700">
                      {departures[0].aimedDepartureTime ? (
                        <>
                          Neste avgang:{' '}
                          <span className="font-extrabold">
                            {new Date(departures[0].aimedDepartureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {' '}– om {' '}
                          <span className="text-green-600 font-bold">
                            <span className="text-sm text-green-600 font-bold align-middle">
                              {formatMinutes(
                                Math.max(
                                  0,
                                  Math.round(
                                    (new Date(departures[0].aimedDepartureTime) - new Date()) / 60000
                                  )
                                )
                              )}
                            </span>
                          </span>
                        </>
                      ) : 'Neste avgang: ?'}
                    </div>
                    <div className="text-gray-500 text-base leading-tight">
                      {bokmaalify(departures[0].destinationDisplay?.frontText || '')}
                    </div>
                  </div>
                  {isHighlighted && departures.length > 1 && (
                    <SenereAvganger
                      departures={departures}
                      stopId={highlightedStop.place.id}
                    />
                  )}
                </>
              ) : (
                <p className="mt-2 text-sm text-gray-500">Ingen avganger funnet</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Hjelpefunksjoner og komponenter ---

function formatMinutes(mins) {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'time' : 'timer'}`;
  }
  return `${hours} ${hours === 1 ? 'time' : 'timer'} ${minutes} min`;
}

function SenereAvganger({ departures, stopId }) {
  const [allDepartures, setAllDepartures] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function fetchAllDepartures() {
      setLoading(true);
      try {
        // Hent alle avganger for dagen (maks 50 for sikkerhet)
        const ALL_DEPARTURES_QUERY = gql`
          query StopPlaceDepartures($id: String!) {
            stopPlace(id: $id) {
              estimatedCalls(timeRange: 86400, numberOfDepartures: 50) {
                aimedDepartureTime
                destinationDisplay { frontText }
                serviceJourney { journeyPattern { line { transportMode transportSubmode } } }
              }
            }
          }
        `;
        const data = await client.request(ALL_DEPARTURES_QUERY, { id: stopId });
        if (isMounted) {
          setAllDepartures(data.stopPlace?.estimatedCalls || []);
        }
      } catch {
        if (isMounted) setAllDepartures(null);
      }
      setLoading(false);
    }
    fetchAllDepartures();
    return () => { isMounted = false; };
  }, [stopId]);

  function findNextInAll(thisTime) {
    if (!allDepartures) return null;
    return allDepartures
      .map((d) => new Date(d.aimedDepartureTime))
      .filter((t) => t > thisTime)
      .sort((a, b) => a - b)[0] || null;
  }

  if (loading || !allDepartures) {
    return <div className="text-gray-500 text-sm">Laster flere avganger...</div>;
  }

  return (
    <div className="mt-4">
      <div className="text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
      <ul>
        {departures.slice(1, 6).map((dep, idx, arr) => {
          const mins = Math.max(
            0,
            Math.round(
              (new Date(dep.aimedDepartureTime) - new Date()) / 60000
            )
          );
          return (
            <li key={dep.aimedDepartureTime + '-' + idx} className="flex justify-between py-1">
              <span className="flex items-center gap-1">
                <span className="font-bold">{new Date(dep.aimedDepartureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> – <span className="text-green-600 text-sm font-bold align-middle">{formatMinutes(mins)}</span>
              </span>
              <span className="text-gray-500">{bokmaalify(dep.destinationDisplay?.frontText)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// Merk: Entur sitt API gir ikke ut "alle avganger for alle stopp" i én bulk, men du kan cache stopp og avganger for ditt område.
// For Vilde: localStorage fungerer i browser og PWA, men ikke i SSR. Dette oppsettet er trygt for Vilde.
