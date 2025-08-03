import { useState } from 'react';
import { GraphQLClient, gql } from 'graphql-request';
import { ENTUR_ENDPOINT, EXCLUDED_SUBMODES } from './constants';
import { normalizeText, bokmaalify, cleanDestinationText, calculateTimeDiff, formatMinutes } from './utils/helpers';

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



export default function Search() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [departuresMap, setDeparturesMap] = useState({}); // { stopId: [calls] }
  const [selectedStop, setSelectedStop] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);



  async function handleSearch(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSelectedStop(null);
    setDeparturesMap({});
    try {
      const data = await client.request(ALL_FERRY_STOPS_QUERY);
      // ...eksisterende kode...

      const stops = (data.stopPlaces || []).filter(
        (stop) => {
          if (!Array.isArray(stop.transportMode) || !stop.transportMode.includes('water')) return false;
          if (EXCLUDED_SUBMODES.includes(stop.transportSubmode)) return false;
          const name = (stop.name || '').toLowerCase();
          // Inkluder kun navn som inneholder 'fergekai' eller 'ferjekai'
          if (!(name.includes('fergekai') || name.includes('ferjekai'))) return false;
          return normalizeText(stop.name).includes(normalizeText(query));
        }
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
    <div className="flex flex-col items-center py-8 pb-24">
      <h1 className="text-5xl font-extrabold text-white tracking-widest mb-3 drop-shadow-lg mx-auto" style={{letterSpacing:'0.08em', maxWidth: '260px'}}>FERGETID</h1>
      {/* Klokken fjernet */}
      <form onSubmit={handleSearch} className="mx-auto flex mb-6 px-0 gap-2" style={{maxWidth: '260px'}}>
        <input
          className="flex-1 rounded-xl px-1 py-3 text-base border-2 border-fuchsia-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-400 bg-white/90 backdrop-blur-sm shadow-lg"
          type="text"
          placeholder="Søk etter fergekai..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="submit"
          className="bg-fuchsia-700/90 hover:bg-fuchsia-800/90 backdrop-blur-sm text-white font-bold px-4 py-3 rounded-xl shadow-lg text-base transition-all duration-200"
          disabled={loading || !query.trim()}
        >
          Søk
        </button>
      </form>
      {error && <p className="text-white font-bold mb-3 bg-fuchsia-900/80 px-2 py-2 rounded-xl shadow text-base">{error}</p>}
      {loading && <p className="text-white mb-3 text-base animate-pulse">Laster...</p>}
      <div className="w-full max-w-md space-y-8 px-4 sm:px-0">
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
                <div className="flex flex-row flex-wrap items-center gap-2 mt-2 text-lg">
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
              <div className="mt-4 departures-list">
                <div className="text-lg text-gray-700 font-normal mb-1">Senere avganger:</div>
                <ul>
                  {later.map((dep, idx) => {
                    const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                    return (
                      <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center py-1">
                        <span className="font-bold w-16 text-left">{dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="flex-1 flex justify-center">
                          <span className="text-green-600 text-sm font-bold align-middle whitespace-nowrap">{timeDiffStr(now, dep.aimed)}</span>
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
                'relative rounded-2xl p-5 glass-card card-expand cursor-pointer group overflow-hidden w-full' +
                (selectedStop && selectedStop.id === stop.id ? ' ring-4 ring-fuchsia-400 scale-105 z-10 expanded' : '')
              }
              onClick={() => handleShowDepartures(stop)}
            >
              <div className="flex flex-col">
                <h2 className="text-3xl font-bold tracking-wide mb-2 text-gray-900">{bokmaalify(stop.name)}</h2>
                <hr className="my-2" />
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
