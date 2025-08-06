// API Configuration
export const config = {
  // Google Maps API Keys - platform specific
  GOOGLE_MAPS_API_KEY_IOS: import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS,
  GOOGLE_MAPS_API_KEY_WEB: import.meta.env.VITE_GOOGLE_MAPS_API_KEY_WEB,
  
  // Entur API Client Name
  ENTUR_CLIENT_NAME: import.meta.env.VITE_ENTUR_CLIENT_NAME || 'fergetid-app',
  
  // Get the appropriate API key based on platform
  getGoogleMapsApiKey: () => {
    console.log('🔍 Checking platform for API key...');
    console.log('🔍 window.Capacitor exists:', !!window.Capacitor);
    
    // Check if we're in a Capacitor environment
    if (typeof window !== 'undefined' && window.Capacitor) {
      try {
        const platform = window.Capacitor.getPlatform();
        console.log('🌍 Platform detected:', platform);
        if (platform === 'ios') {
          console.log('📱 Using iOS API key:', config.GOOGLE_MAPS_API_KEY_IOS.substring(0, 10) + '...');
          return config.GOOGLE_MAPS_API_KEY_IOS;
        }
      } catch (error) {
        console.log('⚠️ Error detecting platform, using iOS key:', error);
        return config.GOOGLE_MAPS_API_KEY_IOS;
      }
    }
    
    // Check for iOS using user agent as fallback
    const userAgent = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    console.log('🔍 User agent check - isIOS:', isIOS);
    
    if (isIOS) {
      console.log('📱 Using iOS API key (user agent detected):', config.GOOGLE_MAPS_API_KEY_IOS.substring(0, 10) + '...');
      return config.GOOGLE_MAPS_API_KEY_IOS;
    }
    
    console.log('🌐 Using iOS API key for web (web key invalid):', config.GOOGLE_MAPS_API_KEY_IOS.substring(0, 10) + '...');
    return config.GOOGLE_MAPS_API_KEY_IOS;
  },
  
  // Check if API key is configured
  isGoogleMapsConfigured: () => {
    return !!(import.meta.env.VITE_GOOGLE_MAPS_API_KEY_IOS || import.meta.env.VITE_GOOGLE_MAPS_API_KEY_WEB);
  }
};

// Validate configuration
if (config.isGoogleMapsConfigured()) {
  console.log('✅ Google Maps API keys configured for iOS and Web');
} else {
  console.warn('⚠️ Google Maps API keys not found. Please set VITE_GOOGLE_MAPS_API_KEY_IOS and VITE_GOOGLE_MAPS_API_KEY_WEB in your .env file');
} 