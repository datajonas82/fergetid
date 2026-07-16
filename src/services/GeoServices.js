// Google Maps API service for driving times and location names
// Using the latest Google Maps APIs with proper configuration

import { config } from '../config/config';

// ─── Cache configuration ──────────────────────────────────────────────────────
const CACHE_TTL = 60 * 60 * 1000;  // 1 hour — re-fetch after this
const POSITION_THRESHOLD = 350;     // metres — re-fetch if moved further than this

const CACHE_STORAGE_KEY = 'fergetid_dtc_v1';
const FERRY_ONLY_STORAGE_KEY = 'fergetid_ferry_only_v1';

// Position-aware cache: endKey → Array<{ startLat, startLng, result, timestamp }>
const drivingTimeCache = new Map();
// In-flight deduplication: exactKey → Promise
const pendingDrivingTimePromises = new Map();
// Ferry stop endpoints known to have no road connection (saves one HERE call per refresh)
const ferryOnlyEndpoints = new Set();

// ─── Internal helpers ─────────────────────────────────────────────────────────

const _distanceMeters = (a, b) => {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lng - a.lng) * Math.PI / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
};

const getEndKey = (endCoords, options) =>
  `${endCoords.lat.toFixed(5)},${endCoords.lng.toFixed(5)}|${options?.roadOnly ? 'road' : 'any'}`;

const getExactKey = (startCoords, endCoords, options) =>
  `${startCoords.lat.toFixed(5)},${startCoords.lng.toFixed(5)}|${getEndKey(endCoords, options)}`;

const findCached = (startCoords, endCoords, options) => {
  const endKey = getEndKey(endCoords, options);
  const entries = drivingTimeCache.get(endKey);
  if (!entries?.length) return null;
  const now = Date.now();
  const valid = entries.filter(e => now - e.timestamp < CACHE_TTL);
  if (valid.length !== entries.length) drivingTimeCache.set(endKey, valid);
  return (
    valid.find(e =>
      _distanceMeters(startCoords, { lat: e.startLat, lng: e.startLng }) <= POSITION_THRESHOLD
    )?.result ?? null
  );
};

const storeCached = (startCoords, endCoords, options, result) => {
  const endKey = getEndKey(endCoords, options);
  const existing = (drivingTimeCache.get(endKey) ?? []).filter(
    e => _distanceMeters(startCoords, { lat: e.startLat, lng: e.startLng }) > POSITION_THRESHOLD
  );
  existing.push({ startLat: startCoords.lat, startLng: startCoords.lng, result, timestamp: Date.now() });
  drivingTimeCache.set(endKey, existing);
  // Haversine results are estimates only — persist real API results
  if (result.source !== 'haversine') _schedulePersist();
};

// Debounced write so rapid bursts (8+ stops computed at once) cause only one I/O
let _persistTimer = null;
const _schedulePersist = () => {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      const obj = {};
      for (const [key, entries] of drivingTimeCache) obj[key] = entries;
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch (_) {}
  }, 500);
};

const _persistFerryOnly = () => {
  try {
    localStorage.setItem(FERRY_ONLY_STORAGE_KEY, JSON.stringify([...ferryOnlyEndpoints]));
  } catch (_) {}
};

// ─── Load persisted data on module init ──────────────────────────────────────
(() => {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(CACHE_STORAGE_KEY);
    if (raw) {
      for (const [key, entries] of Object.entries(JSON.parse(raw))) {
        const valid = entries.filter(e => now - e.timestamp < CACHE_TTL);
        if (valid.length) drivingTimeCache.set(key, valid);
      }
    }
  } catch (_) {}
  try {
    JSON.parse(localStorage.getItem(FERRY_ONLY_STORAGE_KEY) || '[]').forEach(k =>
      ferryOnlyEndpoints.add(k)
    );
  } catch (_) {}
})();

// ─── Shared fetch utility ─────────────────────────────────────────────────────

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

// ─── Public API ───────────────────────────────────────────────────────────────

export const calculateDrivingTime = async (startCoords, endCoords, options = {}) => {
  // 1. Position-aware cache lookup (hit if moved <350m from a cached position)
  const cached = findCached(startCoords, endCoords, options);
  if (cached) return cached;

  // 2. De-duplicate identical in-flight requests
  const exactKey = getExactKey(startCoords, endCoords, options);
  if (pendingDrivingTimePromises.has(exactKey)) {
    return await pendingDrivingTimePromises.get(exactKey);
  }

  const promise = (async () => {
    try {
      // First try: HERE Routing API v8 (better ferry exclusion)
      if (config.HERE_CONFIG.isConfigured()) {
        try {
          const hereResult = await calculateDrivingTimeWithHERE(startCoords, endCoords, options);
          // Remember ferry-only stops so the double-call is skipped next time
          if (hereResult.hasFerry && options.roadOnly) {
            const ferryEndKey = `${endCoords.lat.toFixed(5)},${endCoords.lng.toFixed(5)}`;
            if (!ferryOnlyEndpoints.has(ferryEndKey)) {
              ferryOnlyEndpoints.add(ferryEndKey);
              _persistFerryOnly();
            }
          }
          storeCached(startCoords, endCoords, options, hereResult);
          return hereResult;
        } catch (hereError) {
          console.warn('HERE Routing API failed, falling back to Google Maps:', hereError);
        }
      }

      // Second try: Google Maps Routes API v2 (fallback)
      if (config.GOOGLE_MAPS_CONFIG.isConfigured()) {
        try {
          const googleResult = await calculateDrivingTimeWithGoogle(startCoords, endCoords, options);
          storeCached(startCoords, endCoords, options, googleResult);
          return googleResult;
        } catch (googleError) {
          console.warn('Google Maps API failed, using haversine fallback:', googleError);
        }
      }

      // Final fallback: simple haversine estimate (not persisted to localStorage)
      const fallback = calculateHaversineDistance(startCoords, endCoords);
      const result = { ...fallback, hasFerry: false };
      storeCached(startCoords, endCoords, options, result);
      return result;

    } catch (error) {
      console.error('All routing APIs failed:', error);
      const fallback = calculateHaversineDistance(startCoords, endCoords);
      const result = { ...fallback, hasFerry: false };
      storeCached(startCoords, endCoords, options, result);
      return result;
    }
  })();

  pendingDrivingTimePromises.set(exactKey, promise);
  try {
    return await promise;
  } finally {
    pendingDrivingTimePromises.delete(exactKey);
  }
};


// HERE Routing API v8 implementation
const calculateDrivingTimeWithHERE = async (startCoords, endCoords, options = {}) => {
  // If this stop is already known to be ferry-only, skip the road-only call and
  // go straight to unrestricted routing — saves one HERE API call per refresh.
  const ferryEndKey = `${endCoords.lat.toFixed(5)},${endCoords.lng.toFixed(5)}`;
  if (options.roadOnly && ferryOnlyEndpoints.has(ferryEndKey)) {
    const urlNoAvoid = config.HERE_CONFIG.getRoutingUrl(
      startCoords.lat, startCoords.lng,
      endCoords.lat, endCoords.lng,
      { ...options, roadOnly: false }
    );
    if (!urlNoAvoid) throw new Error('HERE Routing URL missing (no API key)');
    const response = await fetchWithTimeout(urlNoAvoid, { method: 'GET' }, 10000);
    if (!response.ok) throw new Error(`HERE Routing API failed: ${response.status}`);
    const data = await response.json();
    if (!data.routes?.length) throw new Error('No routes found in HERE response');
    const summary = data.routes[0].sections?.[0]?.summary;
    if (!summary) throw new Error('No summary found in HERE route');
    if (!summary.length) throw new Error('HERE API returned 0 distance');
    return {
      time: Math.max(1, Math.round((summary.duration || 0) / 60)),
      distance: summary.length,
      source: 'here_routing_v8',
      hasFerry: true,
    };
  }

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

  // Check for ferry sections in the route
  let hasFerry = false;
  if (options.roadOnly) {
    const ferrySections = route.sections?.filter(section =>
      section.transport?.mode === 'ferry'
    ) || [];

    if (ferrySections.length > 0) {
      // avoid[features]=ferry returned a ferry route – this can happen when HERE
      // prefers the ferry even with the avoid flag set. Retry WITHOUT avoidance to
      // check if the natural (fastest) route is actually road-only. If the natural
      // route has no ferry sections the destination IS reachable by road.
      try {
        const urlNoAvoid = config.HERE_CONFIG.getRoutingUrl(
          startCoords.lat, startCoords.lng,
          endCoords.lat, endCoords.lng,
          { ...options, roadOnly: false }
        );
        const retryResponse = await fetchWithTimeout(urlNoAvoid, { method: 'GET' }, 8000);
        if (retryResponse.ok) {
          const retryData = await retryResponse.json();
          const retryRoute = retryData.routes?.[0];
          if (retryRoute) {
            const retryFerrySections = retryRoute.sections?.filter(s =>
              s.transport?.mode === 'ferry'
            ) || [];
            if (retryFerrySections.length === 0) {
              // Natural route has no ferry → road exists, use this result instead
              const retrySummary = retryRoute.sections?.[0]?.summary;
              if (retrySummary && retrySummary.length > 0) {
                return {
                  time: Math.max(1, Math.round((retrySummary.duration || 0) / 60)),
                  distance: retrySummary.length,
                  source: 'here_routing_v8',
                  hasFerry: false
                };
              }
            }
          }
        }
      } catch (_) {
        // Retry failed – fall through and treat as hasFerry: true
      }
      hasFerry = true;
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

  // Request route information including warnings to detect ferries
  const fieldMask = options.roadOnly
    ? 'routes.duration,routes.distanceMeters,routes.warnings'
    : 'routes.duration,routes.distanceMeters';

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': fieldMask
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

  // Check for ferry transport in route when roadOnly is true
  let hasFerry = false;
  if (options.roadOnly) {
    // When avoidFerries is true, Google Maps API should avoid ferries
    // However, if no alternative route exists, API might still return a route with ferries
    // Check warnings for ferry-related messages
    const warnings = route.warnings || [];
    const hasFerryWarning = warnings.some(warning => {
      if (typeof warning === 'string') {
        const warningText = warning.toLowerCase();
        return warningText.includes('ferry') || warningText.includes('ferge') || warningText.includes('ferje');
      }
      if (warning && typeof warning === 'object') {
        // Warning might be an object with message or code
        const warningMsg = (warning.message || warning.code || JSON.stringify(warning)).toLowerCase();
        return warningMsg.includes('ferry') || warningMsg.includes('ferge') || warningMsg.includes('ferje');
      }
      return false;
    });

    hasFerry = hasFerryWarning;

    // Note: Google Routes API v2 doesn't always expose ferry info clearly
    // When avoidFerries is true and route is returned, we trust it doesn't contain ferries
    // But if warnings mention ferries, we mark it as hasFerry

    if (hasFerry && import.meta.env.DEV) {
      console.warn('🚢 Google Maps API: Ferry detected in route despite avoidFerries:', {
        warnings: warnings
      });
    }
  }

  const durationSeconds = typeof route.duration === 'string'
    ? parseFloat(route.duration.replace('s', ''))
    : (route.duration?.seconds ?? 0);
  const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));
  const distanceMeters = route.distanceMeters;

  return {
    time: durationMinutes,
    distance: distanceMeters,
    source: 'google_routes_v2',
    hasFerry: hasFerry
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
  return { time, distance, source: 'haversine', hasFerry: false }; // Can't determine for haversine
};
