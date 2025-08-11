// Google Maps API service for driving times and location names
// Using the latest Google Maps APIs with proper configuration

import { config } from '../config';

// In-memory cache and de-duplication for driving time calculations
const drivingTimeCache = new Map(); // key -> { time, distance, source }
const pendingDrivingTimePromises = new Map(); // key -> Promise<{ time, distance, source }>

const fetchWithTimeout = async (url, options = {}, timeoutMs = 10000) => {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(id);
  }
};

const getCacheKey = (startCoords, endCoords, options) => {
  const s = `${startCoords.lat.toFixed(5)},${startCoords.lng.toFixed(5)}`;
  const e = `${endCoords.lat.toFixed(5)},${endCoords.lng.toFixed(5)}`;
  const flags = options?.roadOnly ? 'road' : 'any';
  return `${s}|${e}|${flags}`;
};

// Calculate driving time and distance using Google Maps Routes API (latest version)
export const calculateDrivingTime = async (startCoords, endCoords, options = {}) => {
  const cacheKey = getCacheKey(startCoords, endCoords, options);

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
    const fallback = { time: 0, distance: 0, source: 'no_api_key' };
    drivingTimeCache.set(cacheKey, fallback);
    return fallback;
  }

  const promise = (async () => {
    try {
      // Use Google Maps Routes API v2 (Compute Routes) with live traffic
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
        travelMode: 'DRIVE',
        routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        computeAlternativeRoutes: false,
        routeModifiers: {
          avoidTolls: false,
          avoidHighways: false,
          avoidFerries: options.roadOnly === true, // road-only access leg
        },
        languageCode: 'no-NO',
        units: 'METRIC'
      };

      const response = await fetchWithTimeout(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
        },
        body: JSON.stringify(requestBody)
      }, 10000);

    if (!response.ok) {
      throw new Error(`Routes API failed: ${response.status}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in response');
    }

    const route = data.routes[0];
    const durationSeconds = typeof route.duration === 'string'
      ? parseFloat(route.duration.replace('s', ''))
      : (route.duration?.seconds ?? 0);
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
    const distanceMeters = route.distanceMeters;
    const result = { time: durationMinutes, distance: distanceMeters, source: 'routes_v2' };
    drivingTimeCache.set(cacheKey, result);
    return result;

  } catch (error) {
      // First fallback: Google Directions API v1 (GET)
      try {
        const v1Result = await calculateDrivingTimeWithDirectionsV1(startCoords, endCoords, options);
        drivingTimeCache.set(cacheKey, v1Result);
        return v1Result;
      } catch (_v1err) {
        // Final fallback: simple haversine estimate
        const fallback = calculateHaversineDistance(startCoords, endCoords);
        drivingTimeCache.set(cacheKey, fallback);
        return fallback;
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
const calculateDrivingTimeWithDirectionsV1 = async (startCoords, endCoords, options = {}) => {
  const url = config.GOOGLE_MAPS_CONFIG.getDirectionsUrl(
    startCoords.lat,
    startCoords.lng,
    endCoords.lat,
    endCoords.lng,
    options
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
  return { time: durationMinutes, distance: distanceMeters, source: 'directions_v1' };
};

// Simple haversine distance calculation as fallback
const calculateHaversineDistance = (startCoords, endCoords) => {
  const R = 6371000; // Earth's radius in meters
  const dLat = (endCoords.lat - startCoords.lat) * Math.PI / 180;
  const dLon = (endCoords.lng - startCoords.lng) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(startCoords.lat * Math.PI / 180) * Math.cos(endCoords.lat * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  const time = Math.max(1, Math.round((distance / 1000) / 50 * 60)); // 50 km/h default
  return { time, distance, source: 'haversine' };
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


