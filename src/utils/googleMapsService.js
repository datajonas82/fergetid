// Google Maps API service for driving times and location names
// Using the latest Google Maps APIs with proper configuration

const GOOGLE_API_KEY = 'AIzaSyAVihtnKArRGgnSqUKHqjYNFO95dsgI8hA';

// Calculate driving time using Google Maps Routes API (latest version)
export const calculateDrivingTime = async (startCoords, endCoords) => {
  if (!GOOGLE_API_KEY) {
    throw new Error('Google Maps API key not configured');
  }

  try {
    // Use Google Maps Routes API v2 (latest) with optimized settings
    const url = 'https://routes.googleapis.com/directions/v2:computeRoutes';
    
    const requestBody = {
      origin: {
        location: {
          latLng: {
            latitude: startCoords.lat,
            longitude: startCoords.lng
          }
        }
      },
      destination: {
        location: {
          latLng: {
            latitude: endCoords.lat,
            longitude: endCoords.lng
          }
        }
      },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE", // Use traffic-unaware for more realistic times
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false
      },
      languageCode: "no-NO",
      units: "METRIC"
    };

        const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Routes API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in response');
    }

    const route = data.routes[0];
    const durationSeconds = parseInt(route.duration.replace('s', ''));
    const durationMinutes = Math.round(durationSeconds / 60);
    const distanceKm = (route.distanceMeters / 1000).toFixed(1);
    const speedKmh = ((route.distanceMeters / 1000) / (durationSeconds / 3600)).toFixed(1);

    // Check if Google Maps time seems unrealistic and try OpenRouteService
    if (parseFloat(distanceKm) > 5 && parseFloat(speedKmh) < 35) {
      try {
        const openRouteTime = await calculateDrivingTimeWithOpenRoute(startCoords, endCoords);
        
        // Use the shorter time (more realistic)
        const finalTime = Math.min(durationMinutes, openRouteTime);
        return finalTime;
      } catch (openRouteError) {
        return durationMinutes;
      }
    }

    return durationMinutes;

            } catch (error) {
            // Try OpenRouteService as fallback
            try {
              const openRouteTime = await calculateDrivingTimeWithOpenRoute(startCoords, endCoords);
              return openRouteTime;
            } catch (openRouteError) {
              throw new Error('Failed to calculate driving time with both Google Maps and OpenRouteService APIs');
            }
          }
};

// Calculate driving time using OpenRouteService as fallback
const calculateDrivingTimeWithOpenRoute = async (startCoords, endCoords) => {
  try {
    const url = 'https://api.openrouteservice.org/v2/directions/driving-car';
    
    const requestBody = {
      coordinates: [
        [startCoords.lng, startCoords.lat],
        [endCoords.lng, endCoords.lat]
      ],
      instructions: false,
      geometry: false
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk1ZDZiMWRjNjE1ZTQ4YWRhYjVkYTEwN2E2OTc4ODlkIiwiaCI6Im11cm11cjY0In0='
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouteService API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in OpenRouteService response');
    }

    const route = data.routes[0];
    const durationSeconds = route.summary.duration;
    const durationMinutes = Math.round(durationSeconds / 60);
    const distanceKm = (route.summary.distance / 1000).toFixed(1);
    const speedKmh = ((route.summary.distance / 1000) / (durationSeconds / 3600)).toFixed(1);

    return durationMinutes;

  } catch (error) {
    throw new Error('Failed to calculate driving time with OpenRouteService API');
  }
};

// Get location name from coordinates using Google Geocoding API
export const getLocationName = async (coords) => {
  if (!GOOGLE_API_KEY) {
    return null;
  }

  try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_API_KEY}&language=nb&region=no`;

    const response = await fetch(url);
    const data = await response.json();
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = data.results[0];
      const locationName = result.formatted_address;

      // Clean up the location name - be more careful with Norwegian characters
      let cleanedName = locationName.trim();

      // Remove any weird characters but preserve Norwegian letters
      cleanedName = cleanedName
        .replace(/[^\w\sæøåÆØÅ,.-]/g, '') // Remove all non-alphanumeric except Norwegian letters, spaces, commas, dots, hyphens
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();

      // If the name is too short or empty, use a fallback
      if (cleanedName.length < 3) {
        cleanedName = `Posisjon (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
      }

      return cleanedName;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
};

// Format driving time for display
export const formatDrivingTime = (minutes) => {
  if (minutes < 60) {
    return `${minutes} min`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} t`;
    } else {
      return `${hours} t ${remainingMinutes} min`;
    }
  }
};

// Generate natural language description
export const generateTravelDescription = (distance, drivingTime, timeToDeparture, allDepartures = []) => {
  const distanceText = formatDistance(distance);
  const drivingTimeText = formatDrivingTime(drivingTime);
  
  if (timeToDeparture > drivingTime) {
    const margin = timeToDeparture - drivingTime;
    
    // Find next ferry you can catch (after driving time)
    let nextCatchableFerry = null;
    let waitTimeAtQuay = 0;
    
    if (allDepartures.length > 0) {
      const arrivalTimeAtQuay = new Date(Date.now() + drivingTime * 60000);
      
      for (const departure of allDepartures) {
        const departureTime = new Date(departure.aimedDepartureTime || departure.aimed);
        if (departureTime > arrivalTimeAtQuay) {
          nextCatchableFerry = departure;
          waitTimeAtQuay = Math.round((departureTime - arrivalTimeAtQuay) / 60000);
          break;
        }
      }
    }
    
    let waitTimeText = '';
    if (nextCatchableFerry && waitTimeAtQuay > 0) {
      if (waitTimeAtQuay < 60) {
        const minuteText = waitTimeAtQuay === 1 ? 'minutt' : 'minutter';
        waitTimeText = ` Du må vente i <strong>${waitTimeAtQuay} ${minuteText}</strong> på fergekaien.`;
      } else {
        const waitHours = Math.floor(waitTimeAtQuay / 60);
        const waitMinutes = waitTimeAtQuay % 60;
        if (waitMinutes === 0) {
          waitTimeText = ` Du må vente i <strong>${waitHours} timer</strong> på fergekaien.`;
        } else {
          const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
          waitTimeText = ` Du må vente i <strong>${waitHours} timer og ${waitMinutes} ${minuteText}</strong> på fergekaien.`;
        }
      }
    }
    
    if (margin < 5) {
      const minuteText = margin === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold; font-size: 1.1em;">SKYND DEG!</span> Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${margin} ${minuteText}</span>.${waitTimeText}`;
    } else if (margin < 60) {
      const minuteText = margin === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${margin} ${minuteText}</span>.${waitTimeText}`;
    } else {
      const marginHours = Math.floor(margin / 60);
      const marginMinutes = margin % 60;
      if (marginMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer</span>.${waitTimeText}`;
      } else {
        const minuteText = marginMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer og ${marginMinutes} ${minuteText}</span>.${waitTimeText}`;
      }
    }
  } else {
    const missedBy = drivingTime - timeToDeparture;
    
    // Find next ferry you can catch (after driving time)
    let nextCatchableFerry = null;
    let waitTimeAtQuay = 0;
    
    if (allDepartures.length > 0) {
      const arrivalTimeAtQuay = new Date(Date.now() + drivingTime * 60000);
      
      for (const departure of allDepartures) {
        const departureTime = new Date(departure.aimedDepartureTime || departure.aimed);
        if (departureTime > arrivalTimeAtQuay) {
          nextCatchableFerry = departure;
          waitTimeAtQuay = Math.round((departureTime - arrivalTimeAtQuay) / 60000);
          break;
        }
      }
    }
    
    let waitTimeText = '';
    if (nextCatchableFerry && waitTimeAtQuay > 0) {
      if (waitTimeAtQuay < 60) {
        const minuteText = waitTimeAtQuay === 1 ? 'minutt' : 'minutter';
        waitTimeText = ` Du må vente i <strong>${waitTimeAtQuay} ${minuteText}</strong> på fergekaien.`;
      } else {
        const waitHours = Math.floor(waitTimeAtQuay / 60);
        const waitMinutes = waitTimeAtQuay % 60;
        if (waitMinutes === 0) {
          waitTimeText = ` Du må vente i <strong>${waitHours} timer</strong> på fergekaien.`;
        } else {
          const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
          waitTimeText = ` Du må vente i <strong>${waitHours} timer og ${waitMinutes} ${minuteText}</strong> på fergekaien.`;
        }
      }
    }
    
    if (missedBy < 60) {
      const minuteText = missedBy === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer <span style="color: #dc2626; font-weight: bold;">${missedBy}</span> ${minuteText} for sent.${waitTimeText}`;
    } else {
      const missedHours = Math.floor(missedBy / 60);
      const missedMinutes = missedBy % 60;
      if (missedMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer ${missedHours} timer for sent.${waitTimeText}`;
      } else {
        const minuteText = missedMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer ${missedHours} timer og <span style="color: #dc2626; font-weight: bold;">${missedMinutes}</span> ${minuteText} for sent.${waitTimeText}`;
      }
    }
  }
};

// Helper function to format distance
const formatDistance = (distance) => {
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  } else {
    return `${(distance / 1000).toFixed(1)} km`;
  }
}; 