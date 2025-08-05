import React from 'react';
import { generateTravelDescription } from '../utils/openRouteService';
import { formatDistance, formatMinutes, calculateTimeDiff } from '../utils/helpers';
import { cleanDestinationText } from '../utils/helpers';

const FerryCard = ({ 
  stop, 
  distance, 
  drivingTimes, 
  drivingTimesLoading, 
  showDrivingTimes, 
  departuresMap, 
  selectedStop, 
  cardLoading, 
  onCardClick,
  getOptimalFontSize,
  getDepartureTimeColor
}) => {

  const stopData = stop;
  const isExpanded = selectedStop === stopData.id;
  const now = new Date();
  
  // Bruk departuresMap hvis tilgjengelig (for konsistens), ellers fallback til stop.departures
  const departures = departuresMap[stop.id] || stop.departures || [];
  const departuresForDescription = departuresMap[stop.id] || [];
  
  // Debug departures data
  if (showDrivingTimes) {
    console.log(`🔍 FerryCard ${stop.name} - Departures:`, {
      stopId: stop.id,
      showDrivingTimes,
      hasDrivingTime: !!drivingTimes[stop.id],
      drivingTime: drivingTimes[stop.id],
      departuresMapHasData: !!departuresMap[stop.id],
      departuresMapLength: departuresMap[stop.id]?.length || 0,
      stopDeparturesLength: stop.departures?.length || 0,
      finalDeparturesLength: departures.length,
      finalDescriptionLength: departuresForDescription.length
    });
  }
  

  
  // Find the next and later departures
  let nextDeparture = null;
  let laterDepartures = [];
  
  // Finn neste avgang og senere avganger (samme logikk for begge modus)
  // Bruk departuresMap hvis tilgjengelig for bedre data
  const departuresForNext = departuresMap[stop.id] || departures;
  
  if (departuresForNext && departuresForNext.length > 0) {
    const sortedCalls = departuresForNext
      .filter(dep => dep.aimedDepartureTime)
      .map(dep => ({ ...dep, aimed: new Date(dep.aimedDepartureTime) }))
      .sort((a, b) => a.aimed - b.aimed);
    
    if (sortedCalls.length > 0) {
      // Finn neste avgang (første som er etter nåværende tid)
      nextDeparture = sortedCalls.find(c => c.aimed > now) || sortedCalls[0];
      const nextIdx = sortedCalls.indexOf(nextDeparture);
      
      // Ta de neste 4 avgangene (ekskluder neste avgang)
      laterDepartures = sortedCalls.slice(nextIdx + 1, nextIdx + 5);
    }
  } else if (stop.nextDeparture) {
    // Fallback for GPS-modus hvis departures ikke er tilgjengelig
    nextDeparture = { ...stop.nextDeparture, aimed: new Date(stop.nextDeparture.aimedDepartureTime) };
  }

  return (
    <div
      id={`ferry-card-${stopData.id}`}
      key={stopData.id + '-' + (distance || '')}
      className={`relative rounded-2xl p-4 sm:p-5 glass-card card-expand w-full max-w-[350px] sm:max-w-[370px] ${
        isExpanded ? 'expanded' : 'cursor-pointer'
      }`}
      style={{ minWidth: '280px', maxWidth: '350px' }}
      onClick={() => onCardClick(stopData)}
    >
      {/* Blå km-boks i øvre venstre hjørne */}
      {distance && (
        <div className="absolute top-2 left-2 bg-blue-500 text-white text-xs font-bold px-2 py-1 rounded-md shadow-sm z-10">
          {formatDistance(distance)}
        </div>
      )}
      <h2 
        className="ferry-quay-name"
        style={{ 
          fontSize: getOptimalFontSize(cleanDestinationText(stopData.name || '')),
          lineHeight: '1.2'
        }}
      >
        {cleanDestinationText(stopData.name || '')}
      </h2>
      
      {/* Avstand og kjøretidsbeskrivelse - kun vist når toggle er aktivert */}
      {distance && showDrivingTimes && (
        <div className="text-sm text-gray-600 mt-2">
          {drivingTimes[stopData.id] ? (
            <div className="text-gray-700" style={{ 
              '--tw-text-opacity': '1'
            }} dangerouslySetInnerHTML={{
              __html: (() => {
                const description = generateTravelDescription(
                  distance,
                  drivingTimes[stopData.id],
                  nextDeparture ? calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed) : 0,
                  departuresForDescription
                );

                return description;
              })()
            }} />
          ) : drivingTimesLoading[stopData.id] ? (
            <div>
              <span className="text-gray-500">Laster kjøretid...</span>
            </div>
          ) : null}
        </div>
      )}
      
      {nextDeparture ? (
        <>
          <div className="mt-2 text-base sm:text-lg">
            <div className="text-gray-700 flex flex-row flex-wrap items-center gap-2">
              <span>Neste avgang:</span>
            </div>
            <div className="flex items-center py-0.5">
              <span className="font-bold w-16 text-left">
                {nextDeparture.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="flex-1 flex justify-center items-center gap-1">
                <span className={`text-sm font-bold align-middle whitespace-nowrap ${getDepartureTimeColor(nextDeparture.aimedDepartureTime || nextDeparture.aimed, drivingTimes[stopData.id])}`}>
                  {formatMinutes(calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed))}
                </span>
                {showDrivingTimes && drivingTimes[stopData.id] && (
                  (() => {
                    const timeToDeparture = calculateTimeDiff(nextDeparture.aimedDepartureTime || nextDeparture.aimed);
                    const margin = timeToDeparture - drivingTimes[stopData.id];
                    if (margin > 0 && margin < 5) {
                      return <span className="text-xs text-red-500 font-bold">⚠️</span>;
                    } else if (margin > 0 && margin < 15) {
                      return <span className="text-xs text-yellow-500 font-bold">⚡</span>;
                    }
                    return null;
                  })()
                )}
              </span>
              <span 
                className="w-24 text-gray-700 text-right font-semibold"
                style={{ 
                  fontSize: getOptimalFontSize(cleanDestinationText(nextDeparture.destinationDisplay?.frontText), 96)
                }}
              >
                {cleanDestinationText(nextDeparture.destinationDisplay?.frontText)}
              </span>
            </div>
          </div>
          
          {/* Vis kun "Senere avganger" hvis vi har data eller kortet er utvidet */}
          {(laterDepartures.length > 0 || isExpanded) && (
            <div className="mt-4 departures-list">
              <div className="text-base sm:text-lg text-gray-700 font-normal mb-0.5">Senere avganger:</div>
              <ul>
                {laterDepartures.length > 0 ? (
                  laterDepartures.map((dep, idx) => {
                    const mins = Math.max(0, Math.round((dep.aimed - now) / 60000));
                    return (
                      <li key={dep.aimedDepartureTime + '-' + idx} className="flex items-center">
                        <span className="font-bold w-16 text-left">
                          {dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="flex-1 flex justify-center items-center gap-1">
                          <span className={`text-sm font-bold align-middle whitespace-nowrap ${getDepartureTimeColor(dep.aimedDepartureTime || dep.aimed, drivingTimes[stopData.id])}`}>
                            {formatMinutes(mins)}
                          </span>
                          {showDrivingTimes && drivingTimes[stopData.id] && (
                            (() => {
                              const timeToDeparture = mins;
                              const margin = timeToDeparture - drivingTimes[stopData.id];
                              if (margin > 0 && margin < 5) {
                                return <span className="text-xs text-red-500 font-bold">⚠️</span>;
                              } else if (margin > 0 && margin < 15) {
                                return <span className="text-xs text-yellow-500 font-bold">⚡</span>;
                              }
                              return null;
                            })()
                          )}
                        </span>
                        <span 
                          className="w-24 text-gray-700 text-right font-semibold"
                          style={{ 
                            fontSize: getOptimalFontSize(cleanDestinationText(dep.destinationDisplay?.frontText), 96)
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
};

export default FerryCard; 