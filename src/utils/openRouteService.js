// OpenRouteService API utility for calculating driving times
import { formatDistance } from './helpers';

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
    if (margin < 60) {
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
      if (waitTime < 60) {
        const minuteText = waitTime === 1 ? 'minutt' : 'minutter';
        const missedMinuteText = Math.abs(missedBy) === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitTime} ${minuteText}</span> til neste avgang.`;
      } else {
        const waitHours = Math.floor(waitTime / 60);
        const waitMinutes = waitTime % 60;
        const missedMinuteText = Math.abs(missedBy) === 1 ? 'minutt' : 'minutter';
        if (waitMinutes === 0) {
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer</span> til neste avgang.`;
        } else {
          const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
                      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du misser avgangen med <span style="color: #dc2626; font-weight: bold;">${Math.abs(missedBy)} ${missedMinuteText}</span> og må vente <span style="color: #ca8a04; font-weight: bold;">${waitHours} timer og ${waitMinutes} ${minuteText}</span> til neste avgang.`;
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