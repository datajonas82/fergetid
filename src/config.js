// API Configuration
export const config = {
  // Entur API Client Name
  ENTUR_CLIENT_NAME: import.meta.env.VITE_ENTUR_CLIENT_NAME || 'fergetid-app',
  
  // Development settings
  isDevelopment: import.meta.env.DEV,
  
  // Geolocation settings for development
  GEOLOCATION_CONFIG: {
    // Use more lenient settings in development
    getOptions: () => {
      const baseOptions = {
        enableHighAccuracy: false,
        timeout: 30000,
        maximumAge: 600000
      };
      
      // In development, use even more lenient settings
      if (import.meta.env.DEV) {
        return {
          ...baseOptions,
          timeout: 45000, // 45 seconds in development
          enableHighAccuracy: false
        };
      }
      
      return baseOptions;
    }
  },
  
  // HERE API Configuration
  HERE_CONFIG: {
    // Get HERE API key
    getApiKey: () => {
      return import.meta.env.VITE_HERE_API_KEY;
    },
    
    // Check if API key is configured
    isConfigured: () => {
      const apiKey = config.HERE_CONFIG.getApiKey();
      return !!apiKey;
    },
    
    ROUTING_BASE_URL: 'https://router.hereapi.com/v8/routes',
    
    // Get routing URL for driving time calculation
    getRoutingUrl: (fromLat, fromLng, toLat, toLng, options = {}) => {
      const apiKey = config.HERE_CONFIG.getApiKey();
      if (!apiKey) {
        return null;
      }
      
      const origin = `${fromLat},${fromLng}`;
      const destination = `${toLat},${toLng}`;
      
      // Ferry avoidance - only use valid parameters
      const avoid = options.roadOnly ? '&avoid[features]=ferry' : '';
      
      const url = `${config.HERE_CONFIG.ROUTING_BASE_URL}?origin=${origin}&destination=${destination}&transportMode=car&routingMode=fast&return=summary${avoid}&apiKey=${apiKey}`;
      
      if (import.meta.env.DEV) {
    
      }
      
      return url;
    }
  },
  
  // Google Maps API Configuration (now as fallback)
  GOOGLE_MAPS_CONFIG: {
    // Get the appropriate API key based on platform
    getApiKey: () => {
      // Use the iOS key ONLY for native (Capacitor) builds
      if (typeof window !== 'undefined' && window.Capacitor) {
        try {
          const platform = window.Capacitor.getPlatform();
          if (platform === 'ios') {
            return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS;
          }
        } catch (_) {
          return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS;
        }
      }
      // Always use the WEB key in browsers (including iOS Safari)
      return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_WEB;
    },
    
    // Use HERE Geocoding API instead of Google Maps (since we have a valid HERE key)
    GEOCODING_BASE_URL: 'https://revgeocode.search.hereapi.com/v1/revgeocode',
    
    // Get reverse geocoding URL using HERE API
    getGeocodingUrl: (lat, lon) => {
      const apiKey = config.HERE_CONFIG.getApiKey();
      if (!apiKey) {
        return null;
      }
      
      return `${config.GOOGLE_MAPS_CONFIG.GEOCODING_BASE_URL}?at=${lat},${lon}&apiKey=${apiKey}&lang=no`;
    },
    
    // Check if API key is configured
    isConfigured: () => {
      const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
      return !!apiKey;
    },
    
    DIRECTIONS_BASE_URL: 'https://maps.googleapis.com/maps/api/directions/json',
    
    // Get directions URL for driving time calculation
    getDirectionsUrl: (fromLat, fromLng, toLat, toLng, options = {}) => {
      const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
      if (!apiKey) {
        return null;
      }
      
      const origin = `${fromLat},${fromLng}`;
      const destination = `${toLat},${toLng}`;
      const avoid = options.roadOnly ? '&avoid=ferries' : '';
      
      // Use live traffic like Google Maps by setting departure_time=now and traffic_model=best_guess
      return `${config.GOOGLE_MAPS_CONFIG.DIRECTIONS_BASE_URL}?origin=${origin}&destination=${destination}&mode=driving${avoid}&departure_time=now&traffic_model=best_guess&key=${apiKey}&language=no`;
    }
  }
}; 