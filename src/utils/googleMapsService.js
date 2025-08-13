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

// Function to check if route description contains ferry references
const checkRouteForFerries = (routeDescription) => {
  if (!routeDescription) return false;
  
  const ferryKeywords = [
    'ferry', 'ferge', 'ferje', 'ferry crossing', 'fergeoverfart',
    'ferry terminal', 'fergekai', 'ferjekai', 'ferry route',
    'this route includes a ferry', 'ferry service', 'fergeforbindelse'
  ];
  
  const lowerDescription = routeDescription.toLowerCase();
  return ferryKeywords.some(keyword => lowerDescription.includes(keyword));
};

// Function to enable ferry checking (for testing purposes)
export const enableFerryChecking = () => {
  console.log('🔧 Ferry checking enabled for testing');
  return true;
};

// Function to disable ferry checking (default in development)
export const disableFerryChecking = () => {
  console.log('🔧 Ferry checking disabled (development mode)');
  return false;
};

// Function to get detailed route description from Google Maps
const getRouteDescription = async (startCoords, endCoords, options = {}) => {
  const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
  if (!apiKey) return null;

  try {
    // Use Google Maps Directions API v1 to get detailed route description
    const url = config.GOOGLE_MAPS_CONFIG.getDirectionsUrl(
      startCoords.lat,
      startCoords.lng,
      endCoords.lat,
      endCoords.lng,
      options
    );
    
    if (!url) return null;

    const response = await fetchWithTimeout(url, { method: 'GET' }, 8000);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.routes || data.routes.length === 0) return null;

    const route = data.routes[0];
    const legs = route.legs || [];
    
    // Combine all step descriptions
    const stepDescriptions = legs.flatMap(leg => 
      (leg.steps || []).map(step => step.html_instructions || step.maneuver?.instruction || '')
    );
    
    // Also include route warnings and summary
    const warnings = route.warnings || [];
    const summary = route.summary || '';
    
    const fullDescription = [
      summary,
      ...warnings,
      ...stepDescriptions
    ].join(' ');

    return fullDescription;
  } catch (error) {
    // In development, don't log CORS errors as they're expected
    if (import.meta.env.DEV && error.message.includes('CORS')) {
      return null; // Silently fail in development
    }
    console.error('Error fetching route description:', error);
    return null;
  }
};

// Calculate driving time and distance using HERE Routing API v8 (primary) with Google Maps as fallback
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

  const promise = (async () => {
    try {
      // First try: HERE Routing API v8 (better ferry exclusion)
      if (config.HERE_CONFIG.isConfigured()) {
        try {
          const hereResult = await calculateDrivingTimeWithHERE(startCoords, endCoords, options);
          drivingTimeCache.set(cacheKey, hereResult);
          return hereResult;
        } catch (hereError) {
          console.warn('HERE Routing API failed, falling back to Google Maps:', hereError);
        }
      }

      // Second try: Google Maps Routes API v2 (fallback)
      if (config.GOOGLE_MAPS_CONFIG.isConfigured()) {
        try {
          const googleResult = await calculateDrivingTimeWithGoogle(startCoords, endCoords, options);
          drivingTimeCache.set(cacheKey, googleResult);
          return googleResult;
        } catch (googleError) {
          console.warn('Google Maps API failed, using haversine fallback:', googleError);
        }
      }

      // Final fallback: simple haversine estimate
      const fallback = calculateHaversineDistance(startCoords, endCoords);
      drivingTimeCache.set(cacheKey, fallback);
      return fallback;

    } catch (error) {
      console.error('All routing APIs failed:', error);
      const fallback = calculateHaversineDistance(startCoords, endCoords);
      drivingTimeCache.set(cacheKey, fallback);
      return fallback;
    }
  })();

  pendingDrivingTimePromises.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    pendingDrivingTimePromises.delete(cacheKey);
  }
};


// HERE Routing API v8 implementation
const calculateDrivingTimeWithHERE = async (startCoords, endCoords, options = {}) => {
  const url = config.HERE_CONFIG.getRoutingUrl(
    startCoords.lat,
    startCoords.lng,
    endCoords.lat,
    endCoords.lng,
    options
  );
  
  if (!url) throw new Error('HERE Routing URL missing (no API key)');

  const response = await fetchWithTimeout(url, { method: 'GET' }, 10000);
  if (!response.ok) throw new Error(`HERE Routing API failed: ${response.status}`);
  
  const data = await response.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No routes found in HERE response');
  
  const route = data.routes[0];
  const summary = route.sections?.[0]?.summary;
  
  if (!summary) throw new Error('No summary found in HERE route');
  
  const durationSeconds = summary.duration || 0;
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const distanceMeters = summary.length || 0;
  
  return { 
    time: durationMinutes, 
    distance: distanceMeters, 
    source: 'here_routing_v8',
    hasFerry: false // HERE handles ferry exclusion natively
  };
};

// Google Maps Routes API v2 implementation (fallback)
const calculateDrivingTimeWithGoogle = async (startCoords, endCoords, options = {}) => {
  const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
  if (!apiKey) throw new Error('Google Maps API key missing');
  
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
      avoidFerries: options.roadOnly === true,
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
    throw new Error(`Google Routes API failed: ${response.status}`);
  }

  const data = await response.json();
  if (!data.routes || data.routes.length === 0) {
    throw new Error('No routes found in Google response');
  }

  const route = data.routes[0];
  const durationSeconds = typeof route.duration === 'string'
    ? parseFloat(route.duration.replace('s', ''))
    : (route.duration?.seconds ?? 0);
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const distanceMeters = route.distanceMeters;
  
  return { 
    time: durationMinutes, 
    distance: distanceMeters, 
    source: 'google_routes_v2',
    hasFerry: false // Simplified for fallback
  };
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
    
    // Calculate wait time for next ferry (after arriving at terminal)
    const waitTimeForNextFerry = calculateWaitTimeForNextFerry(allDepartures, timeToDeparture, drivingTime);
    const waitTimeText = formatWaitTime(waitTimeForNextFerry);
    
    if (missedBy < 60) {
      const minuteText = missedBy === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold;">Du kommer ${missedBy} ${minuteText} for sent</span>. ${waitTimeText}`;
    } else {
      const missedHours = Math.floor(missedBy / 60);
      const missedMinutes = missedBy % 60;
      if (missedMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold;">Du kommer ${missedHours} timer for sent</span>. ${waitTimeText}`;
      } else {
        const minuteText = missedMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold;">Du kommer ${missedHours} timer og ${missedMinutes} ${minuteText} for sent</span>. ${waitTimeText}`;
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

// Calculate wait time at ferry terminal after arriving there
const calculateWaitTimeForNextFerry = (allDepartures, timeToDeparture, drivingTime) => {
  if (!allDepartures || allDepartures.length === 0) {
    return 0; // No departures available
  }
  
  // Calculate when we will arrive at the ferry terminal
  const now = new Date();
  const arrivalTime = new Date(now.getTime() + (drivingTime * 60000)); // Add driving time to now
  
  // Find departures that are after our arrival time
  const futureDepartures = allDepartures.filter(departure => {
    const departureTime = departure.aimed || departure.aimedDepartureTime;
    if (!departureTime) return false;
    
    const departureDate = new Date(departureTime);
    return departureDate > arrivalTime; // Only departures after we arrive
  });
  
  if (futureDepartures.length === 0) {
    return 0; // No future departures found
  }
  
  // Sort by departure time and get the next one
  futureDepartures.sort((a, b) => {
    const timeA = new Date(a.aimed || a.aimedDepartureTime);
    const timeB = new Date(b.aimed || b.aimedDepartureTime);
    return timeA - timeB;
  });
  
  const nextDeparture = futureDepartures[0];
  const nextDepartureTime = new Date(nextDeparture.aimed || nextDeparture.aimedDepartureTime);
  
  // Calculate wait time: time from arrival to next departure
  const waitTimeMinutes = Math.max(0, Math.round((nextDepartureTime - arrivalTime) / 60000));
  
  return waitTimeMinutes;
};

// Helper function to format wait time at ferry terminal
const formatWaitTime = (waitMinutes) => {
  if (waitMinutes === 0) {
    return '<span style="color: #dc2626; font-weight: bold;">Ingen flere avganger i dag</span>';
  } else if (waitMinutes < 5) {
    const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
    return `<span style="color: #f59e0b; font-weight: bold;">Du må vente ${waitMinutes} ${minuteText} på fergekaien</span>`;
  } else if (waitMinutes < 15) {
    const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
    return `<span style="color: #16a34a; font-weight: bold;">Du må vente ${waitMinutes} ${minuteText} på fergekaien</span>`;
  } else if (waitMinutes < 60) {
    const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
    return `<span style="color: #16a34a; font-weight: bold;">Du må vente ${waitMinutes} ${minuteText} på fergekaien</span>`;
  } else {
    const hours = Math.floor(waitMinutes / 60);
    const minutes = waitMinutes % 60;
    if (minutes === 0) {
      const hourText = hours === 1 ? 'time' : 'timer';
      return `<span style="color: #16a34a; font-weight: bold;">Du må vente ${hours} ${hourText} på fergekaien</span>`;
    } else {
      const hourText = hours === 1 ? 'time' : 'timer';
      const minuteText = minutes === 1 ? 'minutt' : 'minutter';
      return `<span style="color: #16a34a; font-weight: bold;">Du må vente ${hours} ${hourText} og ${minutes} ${minuteText} på fergekaien</span>`;
    }
  }
};


