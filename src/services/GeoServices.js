// Google Maps API service for driving times and location names
// Using the latest Google Maps APIs with proper configuration

import { config } from '../config/config';

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
  return true;
};

// Function to disable ferry checking (default in development)
export const disableFerryChecking = () => {
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
  

  
  if (!data.routes || data.routes.length === 0) {
    console.warn('HERE API: No routes found, response:', data);
    throw new Error('No routes found in HERE response');
  }
  
  const route = data.routes[0];
  
  // Check for ferry violations in the route
  let hasFerry = false;
  if (options.roadOnly) {
    // Check sections for ferry transport
    const ferrySections = route.sections?.filter(section => 
      section.transport?.mode === 'ferry'
    );
    
    if (ferrySections.length > 0) {
      hasFerry = true;
      if (import.meta.env.DEV) {
        console.warn('🚢 HERE API: Ferry detected despite avoid[features]=ferry:', {
          ferrySections: ferrySections.length
        });
      }
    }
  }
  
  const summary = route.sections?.[0]?.summary;
  
  if (!summary) {
    console.warn('HERE API: No summary found in route:', route);
    throw new Error('No summary found in HERE route');
  }
  
  const durationSeconds = summary.duration || 0;
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const distanceMeters = summary.length || 0;
  
  if (import.meta.env.DEV) {

  }
  
  // If HERE API returns 0 distance, fall back to haversine
  if (distanceMeters === 0) {
    console.warn('HERE API returned 0 distance, falling back to haversine');
    throw new Error('HERE API returned 0 distance');
  }
  
  return { 
    time: durationMinutes, 
    distance: distanceMeters, 
    source: 'here_routing_v8',
    hasFerry: hasFerry
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






