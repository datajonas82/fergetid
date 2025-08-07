// API Configuration
export const config = {
  // Entur API Client Name
  ENTUR_CLIENT_NAME: import.meta.env.VITE_ENTUR_CLIENT_NAME || 'fergetid-app',
  
  // Google Maps API Configuration
  GOOGLE_MAPS_CONFIG: {
    // Get the appropriate API key based on platform
    getApiKey: () => {
      // Check if we're in a Capacitor environment
      if (typeof window !== 'undefined' && window.Capacitor) {
        try {
          const platform = window.Capacitor.getPlatform();
          if (platform === 'ios') {
            return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS;
          }
        } catch (error) {
  
          return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS;
        }
      }
      
      // Check for iOS using user agent as fallback
      const userAgent = navigator.userAgent || '';
      const isIOS = /iPad|iPhone|iPod/.test(userAgent);
      
      if (isIOS) {
        return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS;
      }
      
      // Default to web key
      return import.meta.env.VITE_GOOGLE_MAPS_API_KEY_WEB;
    },
    
    GEOCODING_BASE_URL: 'https://maps.googleapis.com/maps/api/geocode/json',
    
    // Get reverse geocoding URL
    getGeocodingUrl: (lat, lon) => {
      const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
      if (!apiKey) {
        throw new Error('Google Maps API key not found. Please set VITE_GOOGLE_MAPS_API_KEY_IOS and VITE_GOOGLE_MAPS_API_KEY_WEB in your .env file');
      }
      
      return `${config.GOOGLE_MAPS_CONFIG.GEOCODING_BASE_URL}?latlng=${lat},${lon}&key=${apiKey}&language=no`;
    },
    
    // Check if API key is configured
    isConfigured: () => {
      return !!config.GOOGLE_MAPS_CONFIG.getApiKey();
    },
    
    DIRECTIONS_BASE_URL: 'https://maps.googleapis.com/maps/api/directions/json',
    
    // Get directions URL for driving time calculation
    getDirectionsUrl: (fromLat, fromLng, toLat, toLng) => {
      const apiKey = config.GOOGLE_MAPS_CONFIG.getApiKey();
      if (!apiKey) {
        throw new Error('Google Maps API key not found. Please set VITE_GOOGLE_MAPS_API_KEY_IOS and VITE_GOOGLE_MAPS_API_KEY_WEB in your .env file');
      }
      
      const origin = `${fromLat},${fromLng}`;
      const destination = `${toLat},${toLng}`;
      
      return `${config.GOOGLE_MAPS_CONFIG.DIRECTIONS_BASE_URL}?origin=${origin}&destination=${destination}&mode=driving&key=${apiKey}&language=no`;
    }
  }
}; 