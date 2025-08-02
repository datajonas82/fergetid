import { useState } from 'react';
import { GraphQLClient, gql } from 'graphql-request';

const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';
const client = new GraphQLClient(ENTUR_ENDPOINT, {
  headers: { 'ET-Client-Name': 'fergetid-app' }
});

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

function bokmaalify(text) {
  if (!text) return text;
  return text.replace(/ferjekai/gi, 'fergekai');
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [departuresMap, setDeparturesMap] = useState({}); // { stopId: [calls] }
  const [selectedStop, setSelectedStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  function normalize(str) {
    return (str || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
  }

  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSelectedStop(null);
    setDeparturesMap({});
    try {
      const data = await client.request(ALL_FERRY_STOPS_QUERY);
      const stops = (data.stopPlaces || []).filter(
        (stop) =>
          Array.isArray(stop.transportMode) && stop.transportMode.includes('water') &&
          normalize(stop.name).includes(normalize(query))
      );
      setResults(stops);
      // Hent avganger for alle stopp parallelt
      const departuresResults = await Promise.all(
        stops.map(async (stop) => {
          try {
            const depData = await client.request(DEPARTURES_QUERY, { id: stop.id });
            return [stop.id, depData.stopPlace?.estimatedCalls || []];
          } catch {
            return [stop.id, []];
          }
        })
      );
      const depMap = Object.fromEntries(departuresResults);
      setDeparturesMap(depMap);
    } catch {
      setError('Kunne ikke hente fergekaier');
      setResults([]);
      setDeparturesMap({});
    }
    setLoading(false);
  }

  function handleShowDepartures(stop) {
    if (selectedStop && selectedStop.id === stop.id) {
      setSelectedStop(null); // Minimer hvis allerede utvidet
    } else {
      setSelectedStop(stop);
    }
  }

  return (
    <div className="bg-[#d95cff] flex flex-col items-center py-8 pb-24">
      <h1 className="text-5xl font-extrabold text-white tracking-widest mb-3 drop-shadow-lg" style={{letterSpacing:'0.08em'}}>FERGETID</h1>
      <div className="text-base text-white font-semibold mb-6">Klokken er: <span className="font-bold">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>
      <form onSubmit={handleSearch} className="w-full max-w-xl flex mb-6 px-4 gap-2">
        <input
          className="flex-1 rounded-xl px-4 py-3 text-base border-2 border-fuchsia-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 bg-white shadow"
          type="text"
          placeholder="Søk etter fergekai..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="bg-fuchsia-700 hover:bg-fuchsia-800 text-white font-bold px-6 py-3 rounded-xl shadow-lg text-base"
          disabled={loading || !query.trim()}
        >
          Søk
        </button>
      </form>
      {error && <p className="text-white font-bold mb-3 bg-fuchsia-900/80 px-3 py-2 rounded-xl shadow text-base">{error}</p>}
      {loading && <p className="text-white mb-3 text-base animate-pulse">Laster...</p>}
      <div className="w-full max-w-xl space-y-6 px-4 sm:px-0">
        {results.map((stop) => {
          const calls = departuresMap[stop.id] || [];
          const now = new Date();
          const sortedCalls = calls
            .filter(dep => dep.aimedDepartureTime)
            .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }))
            .sort((a, b) => a.aimed - b.aimed);
          let nextDepartureText = null;
          let laterDepartures = null;
          if (sortedCalls.length > 0) {
            const next = sortedCalls.find(c => c.aimed > now) || sortedCalls[0];
            const nextIdx = sortedCalls.indexOf(next);
            const later = sortedCalls.slice(nextIdx + 1, nextIdx + 5);
            function timeDiffStr(from, to) {
              let diff = Math.round((to - from) / 60000);
              if (diff < 60) return `${diff} min`;
              const h = Math.floor(diff / 60);
              const m = diff % 60;
              return `${h} time${h > 1 ? 'r' : ''}${m > 0 ? ` ${m} min` : ''}`;
            }
            nextDepartureText = (
              <>
                <div className="flex flex-row flex-wrap items-center gap-2 mt-1 text-lg">
                  <span className="text-gray-700">Neste avgang:</span>
                  <span className="font-extrabold text-black text-lg leading-tight">{next.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="text-gray-700 text-base font-normal">–</span>
                  <span className="text-green-600 font-bold text-sm whitespace-nowrap">{timeDiffStr(now, next.aimed)}</span>
                </div>
                <div className="text-gray-500 text-base leading-tight">
                  {(next.destinationDisplay?.frontText || '').replace(/E39/gi, '').replace(/  +/g, ' ').trim()}
                </div>
              </>
            );
            laterDepartures = later.length > 0 ? (
              <div className="mt-4">
                <div className="text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
                <ul>
                  {later.map((dep, idx) => {
                    const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                    return (
                      <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-1">
                        <span className="font-bold text-left">{dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="flex-1 flex justify-center">
                          <span className="text-green-600 font-bold text-sm whitespace-nowrap align-middle
                          ">{timeDiffStr(now, dep.aimed)}</span>
                        </span>
                        <span className="w-24 text-gray-500 text-right">{(dep.destinationDisplay?.frontText || '').replace(/E39/gi, '').replace(/  +/g, ' ').trim()}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null;
          }
          return (
            <div
              key={stop.id}
              className={
                'relative rounded-3xl p-6 shadow-2xl bg-white border-4 border-white transition-all duration-200 cursor-pointer group overflow-hidden' +
                (selectedStop && selectedStop.id === stop.id ? ' ring-4 ring-fuchsia-400 scale-105 z-10' : '')
              }
              style={{ background: '#fff' }}
              onClick={() => handleShowDepartures(stop)}
            >
              <div className="flex flex-col gap-1">
                <h2 className="text-2xl font-extrabold tracking-wide text-gray-900 mb-1">{bokmaalify(stop.name)}</h2>
                <hr className="mb-1 border-gray-200" />
                {/* Vis neste avgang alltid */}
                {nextDepartureText || <div className="text-gray-400 text-sm italic">Ingen avganger funnet</div>}
              </div>
              {/* Utvidet visning for senere avganger */}
              {selectedStop && selectedStop.id === stop.id && laterDepartures}
            </div>
          );
        })}
      </div>
    </div>
  );
}
