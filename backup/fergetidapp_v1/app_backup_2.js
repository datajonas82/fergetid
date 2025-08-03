import { useEffect, useState } from 'react';
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

export default function App() {
  const [location, setLocation] = useState(null);
  const [locationName, setLocationName] = useState(null);
  const [ferryStops, setFerryStops] = useState([]);
  const [highlightedStop, setHighlightedStop] = useState(null);
  const [departures, setDepartures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

          // Prøv å finne beste stedsnavn
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
            // Hvis bare county/state/region finnes, vis "i nærheten av [nærmeste større sted]"
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
        console.error('Geolokasjon feilet:', err);
        setError('Geolokasjon feilet, kan ikke hente posisjon');
        setLoading(false);
      },
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    if (!location) return;

    const fetchStops = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await client.request(NEARBY_QUERY, {
          latitude: location.latitude,
          longitude: location.longitude,
        });

        const places = [];
        const seenIds = new Set();

        for (const e of data.nearest.edges) {
          const { place, distance } = e.node;
          if (place && !seenIds.has(place.id)) {
            // Hent avganger for hvert stoppested
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
            // Only add stop if it has carferry departures
            if (departures.length > 0) {
              places.push({ place, distance, departures });
              seenIds.add(place.id);
            }
          }
        }

        setFerryStops(places);
        setLoading(false);
      } catch (err) {
        console.error('Feil ved henting av fergekaier:', err);
        setError('Kunne ikke hente fergekaier');
        setLoading(false);
      }
    };

    fetchStops();
  }, [location]);

  useEffect(() => {
    if (!highlightedStop) {
      setDepartures([]);
      return;
    }

    const fetchDepartures = async () => {
      try {
        const data = await client.request(DEPARTURES_QUERY, { id: highlightedStop.place.id });
        const calls = data.stopPlace?.estimatedCalls || [];

        // Filtrer avganger med relevant transportmodus
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
        console.error('Kunne ikke hente avganger:', err);
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
          {/* Kul spinner med farger og bevegelse */}
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
              {/* Avstand øverst til venstre */}
              <div className="absolute -top-4 -left-3 bg-white rounded-lg px-3 py-1 shadow text-base font-bold text-blue-600 border border-gray-200">
                {distance ? `${Math.round(distance / 1000)} KM` : '? KM'}
              </div>
              {/* Rutenavn */}
              <h2 className="text-3xl font-bold tracking-wide mb-2 text-gray-900">
                {place.name}
              </h2>
              <hr className="my-2" />
              {/* Avgang og ETA */}
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
                      {departures[0].destinationDisplay?.frontText || ''}
                    </div>
                  </div>
                  {/* Ekstra avganger hvis valgt */}
                  {isHighlighted && departures.length > 1 && (
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
                          const thisTime = new Date(dep.aimedDepartureTime);
                          const next = departures
                            .map((d) => new Date(d.aimedDepartureTime))
                            .filter((t) => t > thisTime)
                            .sort((a, b) => a - b)[0];
                          const diffToNext = next ? (next - thisTime) / (1000 * 60 * 60) : null;
                          // Rød hvis >8 timer til neste, eller hvis siste avgang og ingen ny avgang innen 1 time
                          const isLastInList = idx === arr.length - 1;
                          const isLastOverall = !next;
                          const markRed = (diffToNext !== null && diffToNext > 8) || (isLastInList && isLastOverall && (diffToNext === null || diffToNext > 1));
                          return (
                            <li key={dep.aimedDepartureTime + '-' + idx} className={"flex justify-between py-1 " + (markRed ? "text-red-600 font-bold" : "")}> 
                              <span className="flex items-center gap-1">
                                <span className="font-bold">{new Date(dep.aimedDepartureTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span> – <span className="text-green-600 text-sm font-bold align-middle">{formatMinutes(mins)}</span>
                              </span>
                              <span className={markRed ? "text-red-600 font-bold" : "text-gray-500"}>{dep.destinationDisplay?.frontText}</span>
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
    </div>
  );
}

function formatMinutes(mins) {
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  const minutes = mins % 60;
  if (minutes === 0) {
    return `${hours} ${hours === 1 ? 'time' : 'timer'}`;
  }
  return `${hours} ${hours === 1 ? 'time' : 'timer'} ${minutes} min`;
}

// function isFerryStopName(name) {
//   if (!name) return false;
//   const lowered = name.toLowerCase();
//   return (
//     lowered.includes('ferje') ||
//     lowered.includes('fergekai') ||
//     lowered.includes('kai') || lowered.includes('lalala') ||
//     lowered.includes('ferry')
//   );
// }
