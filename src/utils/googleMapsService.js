// Google Maps API service for driving times and location names
// Using the latest Google Maps APIs with proper configuration

import { config } from '../config';

// In-memory cache and de-duplication for driving time calculations
const drivingTimeCache = new Map(); // key -> { time, distance }
const pendingDrivingTimePromises = new Map(); // key -> Promise<{ time, distance }>

const getCacheKey = (startCoords, endCoords) => {
  const s = `${startCoords.lat.toFixed(5)},${startCoords.lng.toFixed(5)}`;
  const e = `${endCoords.lat.toFixed(5)},${endCoords.lng.toFixed(5)}`;
  return `${s}|${e}`;
};

// Calculate driving time and distance using Google Maps Routes API (latest version)
export const calculateDrivingTime = async (startCoords, endCoords) => {
  const cacheKey = getCacheKey(startCoords, endCoords);

  // Serve from cache if available
  if (drivingTimeCache.has(cacheKey)) {
    return drivingTimeCache.get(cacheKey);
  }

  // Return the same in-flight promise if already fetching
  if (pendingDrivingTimePromises.has(cacheKey)) {
    return await pendingDrivingTimePromises.get(cacheKey);
  }

  const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
  
  if (!apiKey) {
    const fallback = calculateSimpleDistance(startCoords, endCoords);
    drivingTimeCache.set(cacheKey, fallback);
    return fallback;
  }

  const promise = (async () => {
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
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Routes API failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in response');
    }

    const route = data.routes[0];
    const durationSeconds = parseInt(route.duration.replace('s', ''));
    const durationMinutes = Math.round(durationSeconds / 60);
    const distanceMeters = route.distanceMeters;
    const result = { time: durationMinutes, distance: distanceMeters };
    drivingTimeCache.set(cacheKey, result);
    return result;

  } catch (error) {
    // First fallback: Google Directions API v1 (GET)
    try {
      const v1Result = await calculateDrivingTimeWithDirectionsV1(startCoords, endCoords);
      drivingTimeCache.set(cacheKey, v1Result);
      return v1Result;
    } catch (_v1err) {
      // In browsers, OpenRouteService is commonly blocked by CORS and rate limits → skip to simple
      const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
      if (isBrowser) {
        const fallback = calculateSimpleDistance(startCoords, endCoords);
        drivingTimeCache.set(cacheKey, fallback);
        return fallback;
      }

      // Non-browser (native/server) can try OpenRouteService as fallback
      try {
        const openRouteResult = await calculateDrivingTimeWithOpenRoute(startCoords, endCoords);
        drivingTimeCache.set(cacheKey, openRouteResult);
        return openRouteResult;
      } catch (_) {
        const fallback = calculateSimpleDistance(startCoords, endCoords);
        drivingTimeCache.set(cacheKey, fallback);
        return fallback;
      }
    }
  }
  })();

  pendingDrivingTimePromises.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingDrivingTimePromises.delete(cacheKey);
  }
};

// Google Directions API v1 fallback (GET)
const calculateDrivingTimeWithDirectionsV1 = async (startCoords, endCoords) => {
  const url = config.GOOGLE_MAPS_CONFIG.getDirectionsUrl(
    startCoords.lat,
    startCoords.lng,
    endCoords.lat,
    endCoords.lng
  );
  if (!url) throw new Error('Directions V1 URL missing (no API key)');

  const response = await fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`Directions V1 failed: ${response.status}`);
  const data = await response.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No routes in Directions V1 response');
  const leg = data.routes[0]?.legs?.[0];
  if (!leg || !leg.duration || !leg.distance) throw new Error('Missing leg info in Directions V1');
  const durationSeconds = leg.duration.value;
  const durationMinutes = Math.round(durationSeconds / 60);
  const distanceMeters = leg.distance.value;
  return { time: durationMinutes, distance: distanceMeters };
};

// Calculate driving time and distance using OpenRouteService as fallback
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
      throw new Error(`OpenRouteService API failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in OpenRouteService response');
    }

    const route = data.routes[0];
    const durationSeconds = route.summary.duration;
    const durationMinutes = Math.round(durationSeconds / 60);
    const distanceMeters = route.summary.distance;

    return { time: durationMinutes, distance: distanceMeters };

  } catch (error) {
    throw new Error('Failed to calculate driving time with OpenRouteService API');
  }
};

// Simple distance calculation as final fallback
const calculateSimpleDistance = (startCoords, endCoords) => {
  
  // Calculate distance using Haversine formula
  const R = 6371000; // Earth's radius in meters
  const dLat = (endCoords.lat - startCoords.lat) * Math.PI / 180;
  const dLng = (endCoords.lng - startCoords.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(startCoords.lat * Math.PI / 180) * Math.cos(endCoords.lat * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceMeters = R * c;
  
  // Estimate driving time (assuming average speed of 50 km/h in urban areas)
  const estimatedSpeedKmh = 50;
  const distanceKm = distanceMeters / 1000;
  const estimatedTimeMinutes = Math.round((distanceKm / estimatedSpeedKmh) * 60);
  
  return { time: estimatedTimeMinutes, distance: distanceMeters };
};

// Generate natural language description
export const generateTravelDescription = (distance, drivingTime, timeToDeparture, allDepartures = []) => {
  const distanceText = formatDistance(distance);
  const drivingTimeText = formatDrivingTime(drivingTime);
  
  if (timeToDeparture > drivingTime) {
    const margin = timeToDeparture - drivingTime;
    if (margin < 5) {
      const minuteText = margin === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold; font-size: 1.1em;">SKYND DEG!</span> Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${margin} ${minuteText}</span>.`;
    } else if (margin < 60) {
      const minuteText = margin === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${margin} ${minuteText}</span>.`;
    } else {
      const marginHours = Math.floor(margin / 60);
      const marginMinutes = margin % 60;
      if (marginMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer</span>.`;
      } else {
        const minuteText = marginMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer og ${marginMinutes} ${minuteText}</span>.`;
      }
    }
  } else {
    const missedBy = drivingTime - timeToDeparture;
    if (missedBy < 60) {
      const minuteText = missedBy === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold;">Du kommer ${missedBy} ${minuteText} for sent</span>.`;
    } else {
      const missedHours = Math.floor(missedBy / 60);
      const missedMinutes = missedBy % 60;
      if (missedMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold;">Du kommer ${missedHours} timer for sent</span>.`;
      } else {
        const minuteText = missedMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold;">Du kommer ${missedHours} timer og ${missedMinutes} ${minuteText} for sent</span>.`;
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

// Helper function to format driving time
const formatDrivingTime = (minutes) => {
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

// Calculate driving distance using Google Maps Routes API
export const calculateDrivingDistance = async (startCoords, endCoords) => {
  try {
    const result = await calculateDrivingTime(startCoords, endCoords);
    return result.distance;
  } catch (error) {
    // Fallback to simple distance calculation if API fails
    return calculateSimpleDistance(startCoords, endCoords).distance;
  }
};
