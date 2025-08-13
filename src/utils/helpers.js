import { TIME_FORMAT_OPTIONS, DISTANCE_UNITS } from '../constants';

// Format minutes to human readable time
export function formatMinutes(mins) {
  if (mins < 1) return 'nå';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} time${h > 1 ? 'r' : ''}${m > 0 ? ` ${m} min` : ''}`;
}

// Format distance in kilometers or meters
export function formatDistance(meters) {
  if (!meters || meters === 0) return '?';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${Math.round(meters / 1000)} ${DISTANCE_UNITS.KILOMETERS}`;
}



// Calculate time difference in minutes
export function calculateTimeDiff(targetTime) {
  return Math.max(
    0,
    Math.round((new Date(targetTime) - new Date()) / 60000)
  );
}

// Clean destination text
export function cleanDestinationText(text) {
  if (!text) return '';
  return text.replace(/E39/gi, '').replace(/\s+/g, ' ').trim();
}

// Normalize text for search (remove diacritics)
export function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}



// Get location name from reverse geocoding data (HERE API format)
export function extractLocationName(data) {
  // Handle HERE API response
  if (data.items && data.items.length > 0) {
    const item = data.items[0];
    const address = item.address;
    
    if (address) {
      // Try to get street name and city
      const streetName = address.street || '';
      const cityName = address.city || address.county || '';
      
      // Return street name and city if both are available
      if (streetName && cityName) {
        return `${streetName}, ${cityName}`;
      }
      
      // Return street name if available
      if (streetName) {
        return streetName;
      }
      
      // Return city name if available
      if (cityName) {
        return cityName;
      }
      
      // Fallback to title
      if (item.title) {
        return item.title;
      }
    }
  }
  
  // Fallback for Google Maps API format (if still used)
  if (data.results && data.results.length > 0) {
    const result = data.results[0];
    const addressComponents = result.address_components;
    
    let streetName = '';
    let localityName = '';
    
    // Extract street name and locality name
    for (const component of addressComponents) {
      if (component.types.includes('route')) {
        streetName = component.long_name;
      } else if (component.types.includes('locality') || 
                 component.types.includes('sublocality') ||
                 component.types.includes('administrative_area_level_2')) {
        localityName = component.long_name;
      }
    }
    
    // Return street name and locality if both are available
    if (streetName && localityName) {
      return `${streetName}, ${localityName}`;
    }
    
    // Return street name if available
    if (streetName) {
      return streetName;
    }
    
    // Return locality name if available
    if (localityName) {
      return localityName;
    }
    
    // Fallback to formatted address
    if (result.formatted_address) {
      const parts = result.formatted_address.split(', ');
      return parts[0] || 'Ukjent sted';
    }
  }
  
  return 'Ukjent sted';
}

 