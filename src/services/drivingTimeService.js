import { config } from '../config';

class DrivingTimeService {
  constructor() {
    this.isAvailable = false;
  }

  // Initialize the service
  async initialize() {
    // Check if Google Maps API is configured
    this.isAvailable = config.GOOGLE_MAPS_CONFIG.isConfigured();
    return this.isAvailable;
  }

  // Calculate driving time from current location to a ferry port
  async calculateDrivingTime(fromLat, fromLng, toLat, toLng) {
    if (!this.isAvailable) {
      throw new Error('Google Maps API not configured');
    }

    try {
      const directionsUrl = config.GOOGLE_MAPS_CONFIG.getDirectionsUrl(
        fromLat, fromLng, toLat, toLng
      );

      console.log('🚗 Calculating driving time from Google Maps API');

      const response = await fetch(directionsUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json'
        },
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('🚗 Google Maps directions response:', data);

      if (data.status !== 'OK') {
        console.error('🚗 Google Maps API error:', data.status, data.error_message);
        throw new Error(`Google Maps API error: ${data.status}`);
      }

      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const leg = route.legs[0];
        
        return {
          duration: leg.duration.value, // Duration in seconds
          durationText: leg.duration.text, // Human readable duration
          distance: leg.distance.value, // Distance in meters
          distanceText: leg.distance.text, // Human readable distance
          success: true
        };
      } else {
        throw new Error('No route found');
      }
    } catch (error) {
      console.error('🚗 Failed to calculate driving time:', error);
      throw error;
    }
  }

  // Calculate if user can make it to a ferry departure
  calculateCanMakeIt(drivingTimeSeconds, departureTime) {
    const now = new Date();
    const departure = new Date(departureTime);
    const timeToDeparture = (departure - now) / 1000; // Convert to seconds
    
    // User needs at least 2 minutes buffer to make it
    const bufferTime = 2 * 60; // 2 minutes in seconds
    const canMakeIt = (timeToDeparture - drivingTimeSeconds) >= bufferTime;
    
    return {
      canMakeIt,
      timeToDeparture: Math.max(0, timeToDeparture),
      timeToDepartureMinutes: Math.max(0, Math.round(timeToDeparture / 60)),
      drivingTimeMinutes: Math.round(drivingTimeSeconds / 60),
      bufferMinutes: Math.round(bufferTime / 60),
      marginMinutes: canMakeIt ? 
        Math.round((timeToDeparture - drivingTimeSeconds - bufferTime) / 60) : 
        Math.round((drivingTimeSeconds + bufferTime - timeToDeparture) / 60)
    };
  }

  // Get status text for departure
  getStatusText(calculation) {
    if (calculation.canMakeIt) {
      return `Du rekker avgangen med ${calculation.marginMinutes} minutter å spare`;
    } else {
      return `Du rekker ikke avgangen. ${calculation.marginMinutes} minutter for sent`;
    }
  }

  // Get color for departure based on status
  getStatusColor(calculation) {
    if (calculation.canMakeIt) {
      return 'green';
    } else {
      return 'red';
    }
  }

  // Calculate wait time until next departure
  calculateWaitTime(currentDepartureTime, nextDepartureTime) {
    const current = new Date(currentDepartureTime);
    const next = new Date(nextDepartureTime);
    const waitTimeMinutes = Math.round((next - current) / (1000 * 60));
    
    if (waitTimeMinutes < 60) {
      return `${waitTimeMinutes} minutter`;
    } else {
      const hours = Math.floor(waitTimeMinutes / 60);
      const minutes = waitTimeMinutes % 60;
      if (minutes === 0) {
        return `${hours} ${hours === 1 ? 'time' : 'timer'}`;
      } else {
        return `${hours} ${hours === 1 ? 'time' : 'timer'} ${minutes} minutter`;
      }
    }
  }
}

// Create singleton instance
const drivingTimeService = new DrivingTimeService();

export default drivingTimeService;
