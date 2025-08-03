import { useEffect, useState } from 'react';
import { GraphQLClient, gql } from 'graphql-request';

const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';
const client = new GraphQLClient(ENTUR_ENDPOINT);

const NEARBY_QUERY = gql`
  query NearestStops($latitude: Float!, $longitude: Float!) {
    nearest(latitude: $latitude, longitude: $longitude, maximumDistance: 70000, maximumResults: 20) {
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

function isFerryStopName(name) {
  if (!name) return false;
  const lowered = name.toLowerCase();
  return (
    lowered.includes('ferje') ||
    lowered.includes('fergekai') ||
    lowered.includes('kai') ||
    lowered.includes('ferry')
  );
}

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
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json`
          );
          const data = await res.json();
          const name = data.address?.city || data.address?.town || data.address?.village || 'ukjent sted';
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

        // Vi lager et array av { place, distance } for stopp som er ferge
        const places = data.nearest.edges
          .map((e) => e.node)
          .filter((n) => n.place && isFerryStopName(n.place.name))
          .slice(0, 5)
          .map(({ place, distance }) => ({ place, distance }));

        setFerryStops(places);
        setHighlightedStop(places[0] || null);
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
            line.transportMode === 'water' ||
            line.transportMode === 'buswater'
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

  if (loading) return <p>Laster posisjon og fergekaier...</p>;

  return (
    <div className="p-4 space-y-6">
      {error && <p className="text-red-600 font-bold">{error}</p>}

      {locationName && <p className="text-lg font-medium">📍 Din posisjon er {locationName}.</p>}

      {ferryStops.length === 0 && <p>❌ Fant ingen bilferge-stopp i nærheten.</p>}

      {ferryStops.map(({ place, distance }, i) => (
        <div
          key={place.id}
          onClick={() => setHighlightedStop({ place, distance })}
          className={`cursor-pointer rounded-xl p-4 shadow-md ${
            highlightedStop?.place.id === place.id
              ? 'bg-blue-100 border-2 border-blue-500'
              : 'bg-white'
          }`}
        >
          <h2 className="text-xl font-bold">{place.name}</h2>
          <p className="text-sm text-gray-600">Avstand: {distance ? distance.toFixed(0) : '?'} m</p>

          {highlightedStop?.place.id === place.id && departures.length > 0 && (
            <>
              <p className="mt-2 font-semibold">Neste bilfergeavganger:</p>
              <ul className="mt-1 text-sm">
                {departures.map((dep, idx) => (
                  <li key={idx}>
                    🕒{' '}
                    {new Date(dep.aimedDepartureTime).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    → {dep.destinationDisplay?.frontText || 'Ukjent destinasjon'}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
