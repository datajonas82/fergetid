// Google Maps API utility for calculating driving times and getting location names
// Primary: Google Maps Routes API (newest)
// Fallback: Google Maps Directions API (legacy)
// Final fallback: Manual calculation based on distance and estimated speeds
import { formatDistance } from './helpers';

const GOOGLE_API_KEY = 'AIzaSyAVihtnKArRGgnSqUKHqjYNFO95dsgI8hA';

// Google Maps API functions using new Routes API
export const calculateDrivingTimeWithGoogle = async (startCoords, endCoords) => {
  console.log('🚗 [GOOGLE] Starting Google Maps Routes API calculation...');
  console.log('🚗 [GOOGLE] From:', startCoords, 'To:', endCoords);
  
  if (!GOOGLE_API_KEY) {
    console.warn('⚠️ [GOOGLE] API key not configured. Using fallback calculation.');
    return calculateFallbackTime(startCoords, endCoords);
  }
  
  try {
    // Use new Google Maps Routes API
    const routesUrl = `https://routes.googleapis.com/directions/v2:computeRoutes`;
    
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
      routingPreference: "TRAFFIC_AWARE",
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false
      },
      languageCode: "no-NO",
      units: "METRIC"
    };
    
    // Try direct request first (works in production)
    let response;
    try {
      response = await fetch(routesUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_API_KEY,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Google Maps Routes API response:', data);
        
        if (data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const durationMinutes = Math.round(parseInt(route.duration.replace('s', '')) / 60);
          console.log('✅ [GOOGLE] SUCCESS - Calculated driving time:', durationMinutes, 'minutes');
          return durationMinutes;
        } else {
          throw new Error('No routes found in response');
        }
      }
    } catch (directError) {
      console.log('🔄 [GOOGLE] Direct Routes API request failed, trying legacy Directions API...');
    }
    
    // Fallback to legacy Directions API
    const directionsUrl = `https://maps.googleapis.com/maps/api/directions/json?origin=${startCoords.lat},${startCoords.lng}&destination=${endCoords.lat},${endCoords.lng}&mode=driving&key=${GOOGLE_API_KEY}`;
    
    try {
      response = await fetch(directionsUrl);
      if (response.ok) {
        const data = await response.json();
        console.log('Google Maps Directions API response:', data);
        
        if (data.status === 'OK' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          const durationMinutes = Math.round(route.legs[0].duration.value / 60);
          console.log('✅ [GOOGLE] SUCCESS - Calculated driving time (legacy):', durationMinutes, 'minutes');
          return durationMinutes;
        } else {
          throw new Error(`Google Maps Directions API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
        }
      }
    } catch (legacyError) {
      console.log('🔄 [GOOGLE] Legacy Directions API also failed, using fallback...');
    }
    
    throw new Error('Both Google Maps APIs failed');
  } catch (error) {
    console.error('❌ [GOOGLE] FAILED - Error calculating driving time with Google:', error);
    console.log('🔄 [GOOGLE] Falling back to manual calculation...');
    return calculateFallbackTime(startCoords, endCoords);
  }
};

// Get location name from coordinates using Google Geocoding API
export const getLocationName = async (coords) => {
  console.log('📍 [GOOGLE] Getting location name for coordinates:', coords);
  
  if (!GOOGLE_API_KEY) {
    console.warn('⚠️ [GOOGLE] API key not configured. Cannot get location name.');
    return null;
  }
  
  try {
    // Use Google Geocoding API (more reliable for reverse geocoding)
    const geocodingUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${GOOGLE_API_KEY}&language=nb&region=no`;
    
    const response = await fetch(geocodingUrl);
    
    if (!response.ok) {
      throw new Error(`Geocoding API request failed: ${response.status} - ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log('Google Geocoding API response:', data);
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
      const result = data.results[0];
      let locationName = result.formatted_address;
      
      // Clean up the location name - remove any weird characters
      locationName = locationName
        .replace(/^[^\w\sæøåÆØÅ]+/, '') // Remove leading non-alphanumeric characters
        .replace(/[^\w\sæøåÆØÅ,.-]+$/, '') // Remove trailing non-alphanumeric characters
        .trim();
      
      console.log('✅ [GOOGLE] SUCCESS - Location name:', locationName);
      return locationName;
    } else {
      throw new Error(`Geocoding API error: ${data.status} - ${data.error_message || 'Unknown error'}`);
    }
  } catch (error) {
    console.error('❌ [GOOGLE] FAILED - Error getting location name:', error);
    return null;
  }
};



// Manual fallback calculation using estimated average speeds based on Norwegian road conditions
const calculateFallbackTime = (startCoords, endCoords) => {
  console.log('📊 [FALLBACK] Using manual fallback calculation...');
  console.log('📊 [FALLBACK] From:', startCoords, 'To:', endCoords);
  
  const distance = calculateDistance(startCoords, endCoords);
  
  // Mer realistiske hastigheter basert på avstand og norske veier
  let averageSpeedKmh;
  if (distance < 1) {
    averageSpeedKmh = 25; // Bykjøring for korte avstander (trafikk, lyskryss, parkering)
  } else if (distance < 5) {
    averageSpeedKmh = 35; // Forstadsområde (fartsgrense 50, men trafikk)
  } else if (distance < 20) {
    averageSpeedKmh = 45; // Landevei (fartsgrense 60-80, men svinger)
  } else {
    averageSpeedKmh = 55; // Hovedvei (fartsgrense 80-90, men avstand)
  }
  
  const timeHours = distance / averageSpeedKmh;
  const timeMinutes = timeHours * 60;
  
  const result = Math.max(1, Math.round(timeMinutes));
  console.log('✅ [FALLBACK] SUCCESS - Calculated driving time:', result, 'minutes (distance:', distance.toFixed(2), 'km, speed:', averageSpeedKmh, 'km/h)');
  return result;
};

// Calculate distance between two coordinates using Haversine formula (accounts for Earth's curvature)
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

// Generate natural language description
export const generateTravelDescription = (distance, drivingTime, timeToDeparture, allDepartures = []) => {
  const distanceText = formatDistance(distance);
  const drivingTimeText = formatDrivingTime(drivingTime);
  
  // Debug info for korte avstander med lange kjøretider
  if (distance < 1000 && drivingTime > 30) {
    console.warn(`Suspicious calculation: ${distance}m distance, ${drivingTime}min driving time`);
  }

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
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-bold">${marginHours} timer</span>.`;
      } else {
        const minuteText = marginMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer og ${marginMinutes} ${minuteText}</span>.`;
      }
    }
  } else {
    const missedBy = timeToDeparture - drivingTime;
    
    // Finn den første avgangen som man faktisk rekker
    let nextReachableDeparture = null;
    let waitTime = 0;
    
    if (allDepartures.length > 0) {
      const now = new Date();
      const sortedDepartures = allDepartures
        .filter(dep => dep.aimedDepartureTime || dep.aimed)
        .map(dep => ({
          ...dep,
          aimed: new Date(dep.aimedDepartureTime || dep.aimed)
        }))
        .sort((a, b) => a.aimed - b.aimed);
      
      // Finn første avgang som man rekker
      nextReachableDeparture = sortedDepartures.find(dep => {
        const timeToDeparture = Math.max(0, Math.round((dep.aimed - now) / 60000));
        return timeToDeparture > drivingTime;
      });
      
      if (nextReachableDeparture) {
        const timeToDeparture = Math.max(0, Math.round((nextReachableDeparture.aimed - now) / 60000));
        waitTime = timeToDeparture - drivingTime;
      }
    }
    
    if (nextReachableDeparture && waitTime > 0) {
      // Finn alle avganger som man misser
      const now = new Date();
      const sortedDepartures = allDepartures
        .filter(dep => dep.aimedDepartureTime || dep.aimed)
        .map(dep => ({
          ...dep,
          aimed: new Date(dep.aimedDepartureTime || dep.aimed)
        }))
        .sort((a, b) => a.aimed - b.aimed);
      
      const missedDepartures = sortedDepartures.filter(dep => {
        const timeToDeparture = Math.max(0, Math.round((dep.aimed - now) / 60000));
        return timeToDeparture <= drivingTime;
      });
      
      const nextReachableTime = nextReachableDeparture.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      if (waitTime < 60) {
        const minuteText = waitTime === 1 ? 'minutt' : 'minutter';
        const missedMinuteText = Math.abs(missedBy) === 1 ? 'minutt' : 'minutter';
        
        if (missedDepartures.length === 1) {
          const missedTime = missedDepartures[0].aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen kl <span style="color: #000000; font-weight: bold;">${missedTime}</span> med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitTime} ${minuteText}</span> til neste avgang kl <span style="color: #000000; font-weight: bold;">${nextReachableTime}</span>.`;
        } else {
          const missedTimes = missedDepartures.map(dep => dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).join(' og ');
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangene kl <span style="color: #000000; font-weight: bold;">${missedTimes}</span> med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitTime} ${minuteText}</span> til neste avgang kl <span style="color: #000000; font-weight: bold;">${nextReachableTime}</span>.`;
        }
      } else {
        const waitHours = Math.floor(waitTime / 60);
        const waitMinutes = waitTime % 60;
        const missedMinuteText = Math.abs(missedBy) === 1 ? 'minutt' : 'minutter';
        
        if (missedDepartures.length === 1) {
          const missedTime = missedDepartures[0].aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          if (waitMinutes === 0) {
            return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen kl <span style="color: #000000; font-weight: bold;">${missedTime}</span> med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer</span> til neste avgang kl <span style="color: #000000; font-weight: bold;">${nextReachableTime}</span>.`;
          } else {
            const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
            return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen kl <span style="color: #000000; font-weight: bold;">${missedTime}</span> med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer og ${waitMinutes} ${minuteText}</span> til neste avgang kl <span style="color: #000000; font-weight: bold;">${nextReachableTime}</span>.`;
          }
        } else {
          const missedTimes = missedDepartures.map(dep => dep.aimed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })).join(' og ');
          if (waitMinutes === 0) {
            return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangene kl <span style="color: #000000; font-weight: bold;">${missedTimes}</span> med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer</span> til neste avgang kl <span style="color: #000000; font-weight: bold;">${nextReachableTime}</span>.`;
          } else {
            const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
            return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangene kl <span style="color: #000000; font-weight: bold;">${missedTimes}</span> med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer og ${waitMinutes} ${minuteText}</span> til neste avgang kl <span style="color: #000000; font-weight: bold;">${nextReachableTime}</span>.`;
          }
        }
      }
    } else {
      // Fallback hvis vi ikke finner en avgang man rekker
      const fallbackWaitTime = drivingTime - timeToDeparture;
      if (fallbackWaitTime < 60) {
        const minuteText = fallbackWaitTime === 1 ? 'minutt' : 'minutter';
        const missedMinuteText = Math.abs(missedBy) === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${fallbackWaitTime} ${minuteText}</span> til neste avgang.`;
      } else {
        const waitHours = Math.floor(fallbackWaitTime / 60);
        const waitMinutes = fallbackWaitTime % 60;
        const missedMinuteText = Math.abs(missedBy) === 1 ? 'minutt' : 'minutter';
        if (waitMinutes === 0) {
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer</span> til neste avgang.`;
        } else {
          const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer og ${waitMinutes} ${minuteText}</span> til neste avgang.`;
        }
      }
    }
  }
}; 