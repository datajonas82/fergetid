// OpenRouteService API utility for calculating driving times
const OPENROUTE_API_BASE = 'https://api.openrouteservice.org/v2/directions/driving-car';

// You'll need to get a free API key from: https://openrouteservice.org/dev/#/signup
const API_KEY = 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk1ZDZiMWRjNjE1ZTQ4YWRhYjVkYTEwN2E2OTc4ODlkIiwiaCI6Im11cm11cjY0In0='; // Add your API key here

export const calculateDrivingTime = async (startCoords, endCoords) => {
  if (!API_KEY) {
    console.warn('OpenRouteService API key not configured. Using fallback calculation.');
    return calculateFallbackTime(startCoords, endCoords);
  }

  try {
    const url = `${OPENROUTE_API_BASE}?api_key=${API_KEY}&start=${startCoords.lng},${startCoords.lat}&end=${endCoords.lng},${endCoords.lat}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`OpenRouteService API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.features && data.features.length > 0) {
      const route = data.features[0];
      const duration = route.properties.segments[0].duration; // Duration in seconds
      return Math.round(duration / 60); // Convert to minutes
    }
    
    throw new Error('No route found');
    
  } catch (error) {
    console.error('Error calculating driving time:', error);
    return calculateFallbackTime(startCoords, endCoords);
  }
};

// Fallback calculation using estimated average speed
const calculateFallbackTime = (startCoords, endCoords) => {
  const distance = calculateDistance(startCoords, endCoords);
  const averageSpeedKmh = 50; // Estimated average speed in km/h
  const timeHours = distance / averageSpeedKmh;
  return Math.round(timeHours * 60); // Convert to minutes
};

// Calculate distance between two coordinates using Haversine formula
const calculateDistance = (coord1, coord2) => {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (coord2.lat - coord1.lat) * Math.PI / 180;
  const dLon = (coord2.lng - coord1.lng) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(coord1.lat * Math.PI / 180) * Math.cos(coord2.lat * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// Format time for display
export const formatDrivingTime = (minutes) => {
  if (minutes < 60) {
    return `${minutes} min estimert kjøretid`;
  } else {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours} t estimert kjøretid`;
    } else {
      return `${hours} t ${remainingMinutes} min estimert kjøretid`;
    }
  }
}; 