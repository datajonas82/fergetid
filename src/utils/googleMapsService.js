import { config } from '../config.js';

// Google Maps API service for driving times and location names
// Using the latest Google Maps APIs with proper configuration

// Calculate driving time using Google Maps Routes API (latest version)
export const calculateDrivingTime = async (startCoords, endCoords) => {
  if (!config.isGoogleMapsConfigured()) {
    throw new Error('Google Maps API key not configured. Please set VITE_GOOGLE_MAPS_API_KEY in your .env file');
  }

  try {
    // Use Google Maps Routes API v2 (latest) with optimized settings
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
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE", // Use traffic-unaware for more realistic times
      computeAlternativeRoutes: false,
      routeModifiers: {
        avoidTolls: false,
        avoidHighways: false,
        avoidFerries: false
      },
      languageCode: "no-NO",
      units: "METRIC"
    };

        const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': config.getGoogleMapsApiKey(),
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Routes API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in response');
    }

    const route = data.routes[0];
    const durationSeconds = parseInt(route.duration.replace('s', ''));
    const durationMinutes = Math.round(durationSeconds / 60);
    const distanceKm = (route.distanceMeters / 1000).toFixed(1);
    const speedKmh = ((route.distanceMeters / 1000) / (durationSeconds / 3600)).toFixed(1);

    // Check if Google Maps time seems unrealistic and try OpenRouteService
    if (parseFloat(distanceKm) > 5 && parseFloat(speedKmh) < 35) {
      try {
        const openRouteTime = await calculateDrivingTimeWithOpenRoute(startCoords, endCoords);
        
        // Use the shorter time (more realistic)
        const finalTime = Math.min(durationMinutes, openRouteTime);
        return finalTime;
      } catch (openRouteError) {
        return durationMinutes;
      }
    }

    return durationMinutes;

            } catch (error) {
            // Try OpenRouteService as fallback
            try {
              const openRouteTime = await calculateDrivingTimeWithOpenRoute(startCoords, endCoords);
              return openRouteTime;
            } catch (openRouteError) {
              throw new Error('Failed to calculate driving time with both Google Maps and OpenRouteService APIs');
            }
          }
};

// Calculate driving time using OpenRouteService as fallback
const calculateDrivingTimeWithOpenRoute = async (startCoords, endCoords) => {
  try {
    const url = 'https://api.openrouteservice.org/v2/directions/driving-car';
    
    const requestBody = {
      coordinates: [
        [startCoords.lng, startCoords.lat],
        [endCoords.lng, endCoords.lat]
      ],
      instructions: false,
      geometry: false
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6Ijk1ZDZiMWRjNjE1ZTQ4YWRhYjVkYTEwN2E2OTc4ODlkIiwiaCI6Im11cm11cjY0In0='
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouteService API failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.routes || data.routes.length === 0) {
      throw new Error('No routes found in OpenRouteService response');
    }

    const route = data.routes[0];
    const durationSeconds = route.summary.duration;
    const durationMinutes = Math.round(durationSeconds / 60);
    const distanceKm = (route.summary.distance / 1000).toFixed(1);
    const speedKmh = ((route.summary.distance / 1000) / (durationSeconds / 3600)).toFixed(1);

    return durationMinutes;

  } catch (error) {
    throw new Error('Failed to calculate driving time with OpenRouteService API');
  }
};

// Get location name from coordinates using Google Geocoding API
export const getLocationName = async (coords) => {
  console.log('📍 Getting location name for coords:', coords);
  
  // Check if we're on iOS and use native geocoding
  console.log('🔍 Checking for iOS native geocoding...');
  console.log('🔍 window.webkit exists:', !!window.webkit);
  console.log('🔍 window.webkit.messageHandlers exists:', !!window.webkit?.messageHandlers);
  console.log('🔍 window.webkit.messageHandlers.storekit exists:', !!window.webkit?.messageHandlers?.storekit);
  
  if (typeof window !== 'undefined' && window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.storekit) {
    console.log('📱 Using iOS native geocoding');
    
    return new Promise((resolve) => {
      // Set up response handler
      window.geocodingResponse = (data) => {
        console.log('📱 iOS geocoding response:', data);
        if (data.success && data.locationName) {
          resolve(data.locationName);
        } else {
          console.log('📱 iOS geocoding failed:', data.error);
          resolve(getFallbackLocationName(coords));
        }
      };
      
      // Send request to iOS
      try {
        window.webkit.messageHandlers.storekit.postMessage({
          action: 'getLocationName',
          lat: coords.lat,
          lng: coords.lng
        });
        console.log('📱 iOS geocoding request sent');
      } catch (error) {
        console.log('📱 iOS geocoding request failed:', error);
        resolve(getFallbackLocationName(coords));
      }
    });
  }
  
  // Fallback to Google Maps API for web
  console.log('🌐 Using Google Maps API for web');
  
  if (!config.isGoogleMapsConfigured()) {
    console.log('❌ Google Maps not configured');
    return null;
  }

  const apiKey = config.getGoogleMapsApiKey();
  console.log('🔑 Using API key:', apiKey.substring(0, 10) + '...');

  try {
        const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${apiKey}&language=nb&region=no`;
    console.log('🌐 Fetching from URL:', url.replace(apiKey, 'API_KEY_HIDDEN'));

    console.log('📱 iOS: Making fetch request...');
    
    // Add timeout for iOS
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
    
    const response = await fetch(url, {
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    console.log('📱 iOS: Fetch response status:', response.status);
    console.log('📱 iOS: Fetch response ok:', response.ok);
    
    const data = await response.json();
    console.log('📡 Geocoding response status:', data.status);
    console.log('📡 Geocoding response:', data);
    
    if (data.status === 'OK' && data.results && data.results.length > 0) {
            const result = data.results[0];
      const locationName = result.formatted_address;

      // Clean up the location name - be more careful with Norwegian characters
      let cleanedName = locationName.trim();

      // Remove any weird characters but preserve Norwegian letters
      cleanedName = cleanedName
        .replace(/[^\w\sæøåÆØÅ,.-]/g, '') // Remove all non-alphanumeric except Norwegian letters, spaces, commas, dots, hyphens
        .replace(/\s+/g, ' ') // Replace multiple spaces with single space
        .trim();

      // If the name is too short or empty, use a fallback
      if (cleanedName.length < 3) {
        cleanedName = `Posisjon (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
      }

      return cleanedName;
    } else {
      console.log('⚠️ Geocoding failed, using fallback location name');
      return getFallbackLocationName(coords);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log('⏰ Geocoding timeout on iOS, using fallback location name');
    } else {
      console.log('❌ Geocoding error, using fallback location name:', error.message);
    }
    return getFallbackLocationName(coords);
  }
};

// Generate a fallback location name based on coordinates
const getFallbackLocationName = (coords) => {
  const { lat, lng } = coords;
  
  // Simple location description based on coordinates
  // This is a basic fallback when Google Geocoding API is not available
  const latStr = lat.toFixed(4);
  const lngStr = lng.toFixed(4);
  
  // Try to give a more user-friendly description
  let locationDesc = `Posisjon (${latStr}, ${lngStr})`;
  
  // Add some basic location hints based on coordinates
  if (lat > 70) {
    locationDesc = `Nord-Norge (${latStr}, ${lngStr})`;
  } else if (lat > 65) {
    locationDesc = `Midt-Norge (${latStr}, ${lngStr})`;
  } else if (lat > 60) {
    locationDesc = `Sør-Norge (${latStr}, ${lngStr})`;
  } else if (lat > 58) {
    locationDesc = `Østlandet (${latStr}, ${lngStr})`;
  }
  
  return locationDesc;
};

// Format driving time for display
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
  
  if (timeToDeparture > drivingTime) {
    const margin = timeToDeparture - drivingTime;
    
    // Find next ferry you can catch (after driving time)
    let nextCatchableFerry = null;
    let waitTimeAtQuay = 0;
    
    if (allDepartures.length > 0) {
      const arrivalTimeAtQuay = new Date(Date.now() + drivingTime * 60000);
      
      for (const departure of allDepartures) {
        const departureTime = new Date(departure.aimedDepartureTime || departure.aimed);
        if (departureTime > arrivalTimeAtQuay) {
          nextCatchableFerry = departure;
          waitTimeAtQuay = Math.round((departureTime - arrivalTimeAtQuay) / 60000);
          break;
        }
      }
    }
    
    let waitTimeText = '';
    if (nextCatchableFerry && waitTimeAtQuay > 0) {
      if (waitTimeAtQuay < 60) {
        const minuteText = waitTimeAtQuay === 1 ? 'minutt' : 'minutter';
        waitTimeText = ` Du må vente i <strong>${waitTimeAtQuay} ${minuteText}</strong> på fergekaien.`;
      } else {
        const waitHours = Math.floor(waitTimeAtQuay / 60);
        const waitMinutes = waitTimeAtQuay % 60;
        if (waitMinutes === 0) {
          waitTimeText = ` Du må vente i <strong>${waitHours} timer</strong> på fergekaien.`;
        } else {
          const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
          waitTimeText = ` Du må vente i <strong>${waitHours} timer og ${waitMinutes} ${minuteText}</strong> på fergekaien.`;
        }
      }
    }
    
    if (margin < 5) {
      const minuteText = margin === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. <span style="color: #dc2626; font-weight: bold; font-size: 1.1em;">SKYND DEG!</span> Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${margin} ${minuteText}</span>.${waitTimeText}`;
    } else if (margin < 60) {
      const minuteText = margin === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${margin} ${minuteText}</span>.${waitTimeText}`;
    } else {
      const marginHours = Math.floor(margin / 60);
      const marginMinutes = margin % 60;
      if (marginMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer</span>.${waitTimeText}`;
      } else {
        const minuteText = marginMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer og ${marginMinutes} ${minuteText}</span>.${waitTimeText}`;
      }
    }
  } else {
    const missedBy = drivingTime - timeToDeparture;
    
    // Find next ferry you can catch (after driving time)
    let nextCatchableFerry = null;
    let waitTimeAtQuay = 0;
    
    if (allDepartures.length > 0) {
      const arrivalTimeAtQuay = new Date(Date.now() + drivingTime * 60000);
      
      for (const departure of allDepartures) {
        const departureTime = new Date(departure.aimedDepartureTime || departure.aimed);
        if (departureTime > arrivalTimeAtQuay) {
          nextCatchableFerry = departure;
          waitTimeAtQuay = Math.round((departureTime - arrivalTimeAtQuay) / 60000);
          break;
        }
      }
    }
    
    let waitTimeText = '';
    if (nextCatchableFerry && waitTimeAtQuay > 0) {
      if (waitTimeAtQuay < 60) {
        const minuteText = waitTimeAtQuay === 1 ? 'minutt' : 'minutter';
        waitTimeText = ` Du må vente i <strong>${waitTimeAtQuay} ${minuteText}</strong> på fergekaien.`;
      } else {
        const waitHours = Math.floor(waitTimeAtQuay / 60);
        const waitMinutes = waitTimeAtQuay % 60;
        if (waitMinutes === 0) {
          waitTimeText = ` Du må vente i <strong>${waitHours} timer</strong> på fergekaien.`;
        } else {
          const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
          waitTimeText = ` Du må vente i <strong>${waitHours} timer og ${waitMinutes} ${minuteText}</strong> på fergekaien.`;
        }
      }
    }
    
    if (missedBy < 60) {
      const minuteText = missedBy === 1 ? 'minutt' : 'minutter';
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer <span style="color: #dc2626; font-weight: bold;">${missedBy}</span> ${minuteText} for sent.${waitTimeText}`;
    } else {
      const missedHours = Math.floor(missedBy / 60);
      const missedMinutes = missedBy % 60;
      if (missedMinutes === 0) {
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer ${missedHours} timer for sent.${waitTimeText}`;
      } else {
        const minuteText = missedMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer ${missedHours} timer og <span style="color: #dc2626; font-weight: bold;">${missedMinutes}</span> ${minuteText} for sent.${waitTimeText}`;
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