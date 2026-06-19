// Car Mode Service - Tracks car direction based on GPS movement using HERE Route Matching API
import { config } from '../config/config';

class CarModeService {
  constructor() {
    this.positionHistory = []; // Array of { lat, lng, timestamp }
    this.currentDirection = null; // Current direction in degrees (0-360, where 0 is North)
    this.currentRoadLink = null; // Current road link ID from HERE
    this.isTracking = false;
    this.maxHistorySize = 10; // Keep last 10 positions for route matching (increased for better direction detection)
    this.minDistanceForDirection = 10; // Minimum distance in meters to calculate direction (reduced for faster detection)
    this.updateInterval = null;
    this.matchCache = new Map(); // Cache route matching results
    this.lastApiCallTime = 0; // Timestamp of last HERE API call
    this.minApiCallInterval = 5000; // Minimum 5 seconds between HERE API calls to avoid rate limiting
    this.isCalculating = false; // Flag to prevent concurrent calculations
    this.pendingDirectionUpdate = null; // Queue for pending direction updates
  }

  /**
   * Start tracking car direction
   * @param {Function} onDirectionUpdate - Callback when direction is updated
   */
  startTracking(onDirectionUpdate) {
    if (this.isTracking) {
      return;
    }

    this.isTracking = true;
    this.onDirectionUpdate = onDirectionUpdate;

    // Update direction every 5 seconds to avoid rate limiting
    // We rely on fast GPS updates and position filtering instead
    this.updateInterval = setInterval(() => {
      this.updateDirection();
    }, 5000);
  }

  /**
   * Stop tracking car direction
   */
  stopTracking() {
    this.isTracking = false;
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    this.positionHistory = [];
    this.currentDirection = null;
    this.onDirectionUpdate = null;
  }

  /**
   * Add a new position to history and calculate direction
   * @param {number} latitude - Current latitude
   * @param {number} longitude - Current longitude
   */
  addPosition(latitude, longitude) {
    if (!this.isTracking) {
      return;
    }

    const now = Date.now();
    const newPosition = { lat: latitude, lng: longitude, timestamp: now };

    // Check if we've moved enough distance since last position
    // Only add if moved at least 10 meters (for fast direction detection)
    if (this.positionHistory.length > 0) {
      const lastPos = this.positionHistory[this.positionHistory.length - 1];
      const distance = this.calculateDistance(lastPos.lat, lastPos.lng, latitude, longitude);
      
      // Only add position if moved at least 10 meters
      if (distance < 10) {
        return; // Skip if not moved enough
      }
    }

    // Add to history
    this.positionHistory.push(newPosition);

    // Keep only last N positions
    if (this.positionHistory.length > this.maxHistorySize) {
      this.positionHistory.shift();
    }

    // Calculate direction if we have at least 2 positions and haven't called API recently
    // Use async but don't await to avoid blocking
    // Throttle HERE API calls to avoid rate limiting (429 errors)
    const timeSinceLastCall = now - this.lastApiCallTime;
    
    if (this.positionHistory.length >= 2) {
      // Use fallback calculation immediately for fast response
      // Only use HERE API if enough time has passed
      if (timeSinceLastCall >= this.minApiCallInterval && !this.isCalculating) {
        this.calculateDirection().catch(err => {
          // Silently fail - fallback will be used
          if (import.meta.env.DEV && !err.message?.includes('429')) {
            console.error('Error in calculateDirection:', err);
          }
        });
      } else {
        // Use fallback calculation for immediate direction detection
        this.calculateDirectionFallback();
      }
    }
  }

  /**
   * Calculate car direction using HERE Route Matching API
   * This uses the actual road network to determine direction, not just GPS points
   */
  async calculateDirection() {
    if (this.positionHistory.length < 2 || this.isCalculating) {
      return;
    }

    // In DEV mode, use bearing fallback only (HERE Route Matching gives wrong
    // direction for simulated GPS points that don't follow actual roads)
    if (import.meta.env.DEV) {
      this.calculateDirectionFallback();
      return;
    }

    // Check rate limiting - don't call HERE API too frequently
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCallTime;

    if (timeSinceLastCall < this.minApiCallInterval) {
      // Use fallback if API was called recently
      this.calculateDirectionFallback();
      return;
    }

    // Use recent positions for route matching
    const recentPositions = this.positionHistory.slice(-this.maxHistorySize);
    
    // Calculate distance moved - use last 2 positions for faster detection
    // Only require 10 meters movement for quick direction detection
    if (recentPositions.length >= 2) {
      const lastTwo = recentPositions.slice(-2);
      const [oldest, newest] = [lastTwo[0], lastTwo[1]];
      const distance = this.calculateDistance(oldest.lat, oldest.lng, newest.lat, newest.lng);

      // Only update direction if car has moved at least 10 meters
      // This allows for fast direction detection even at slow speeds
      if (distance < this.minDistanceForDirection) {
        return;
      }
    }

    this.isCalculating = true;
    
    try {
      // Use HERE Route Matching API to get actual road direction
      const direction = await this.getDirectionFromHERE(recentPositions);
      
      this.lastApiCallTime = Date.now();
      
      if (direction !== null) {
        this.currentDirection = direction;

        // Notify callback if provided
        if (this.onDirectionUpdate) {
          this.onDirectionUpdate(direction);
        }
      }
    } catch (error) {
      this.lastApiCallTime = Date.now(); // Update even on error to avoid hammering
      
      // Only log non-rate-limit errors in dev mode
      if (import.meta.env.DEV && !error.message?.includes('429') && !error.message?.includes('CORS')) {
        console.error('Error calculating direction from HERE API:', error);
      }
      
      // Fallback to simple bearing calculation if HERE API fails
      this.calculateDirectionFallback();
    } finally {
      this.isCalculating = false;
    }
  }

  /**
   * Get direction from HERE Route Matching API
   * @param {Array} positions - Array of { lat, lng, timestamp }
   * @returns {Promise<number|null>} Direction in degrees or null
   */
  async getDirectionFromHERE(positions) {
    const apiKey = config.HERE_CONFIG.getApiKey();
    if (!apiKey || positions.length < 2) {
      return null;
    }

    try {
      // Prepare GPS trace in CSV format for HERE Route Matching API
      // Format: lat,lon,timestamp
      const csvTrace = positions.map(pos => {
        const timestamp = pos.timestamp ? new Date(pos.timestamp).toISOString() : new Date().toISOString();
        return `${pos.lat},${pos.lng},${timestamp}`;
      }).join('\n');

      // Use HERE Route Matching API v8 with CSV format
      const url = `https://routematching.hereapi.com/v8/match/routelinks?routeMatch=1&mode=fastest;car;traffic:disabled&apikey=${apiKey}&alignToGpsTime=0`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv'
        },
        body: csvTrace
      });

      if (!response.ok) {
        // Handle rate limiting gracefully
        if (response.status === 429) {
          // Rate limited - use fallback
          return null;
        }
        const errorText = await response.text();
        throw new Error(`HERE Route Matching API failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      // Extract direction from matched route links
      // The API returns matched links with geometry and direction of travel
      if (data.matchedLinks && data.matchedLinks.length > 0) {
        // Get the most recent matched link (last in array)
        const lastLink = data.matchedLinks[data.matchedLinks.length - 1];
        
        // Check if we have geometry points to calculate bearing
        if (lastLink.geometry && Array.isArray(lastLink.geometry) && lastLink.geometry.length >= 2) {
          const geometry = lastLink.geometry;
          
          // Get direction from geometry - use first two points
          // If directionOfTravel is backward, reverse the points
          let point1, point2;
          
          if (lastLink.directionOfTravel === 'backward' && geometry.length >= 2) {
            // Reverse direction if going backward
            point1 = geometry[geometry.length - 1];
            point2 = geometry[geometry.length - 2];
          } else {
            // Forward direction
            point1 = geometry[0];
            point2 = geometry[1];
          }
          
          if (point1 && point2 && point1.lat && point1.lng && point2.lat && point2.lng) {
            return this.calculateBearing(
              point1.lat, point1.lng,
              point2.lat, point2.lng
            );
          }
        }
        
        // Alternative: use position from matched link if available
        if (lastLink.position && lastLink.position.lat && lastLink.position.lng) {
          // Try to get next point from geometry or use last two positions
          if (positions.length >= 2) {
            const [prev, curr] = positions.slice(-2);
            return this.calculateBearing(prev.lat, prev.lng, curr.lat, curr.lng);
          }
        }
      }

      // If route matching didn't provide direction, use fallback
      return null;
    } catch (error) {
      console.error('HERE Route Matching API error:', error);
      return null;
    }
  }

  /**
   * Fallback method: Calculate direction using simple bearing between points
   */
  calculateDirectionFallback() {
    if (this.positionHistory.length < 2) {
      return;
    }

    const positions = this.positionHistory.slice(-2);
    const [oldPos, newPos] = positions;

    const distance = this.calculateDistance(oldPos.lat, oldPos.lng, newPos.lat, newPos.lng);
    if (distance < this.minDistanceForDirection) {
      return;
    }

    const bearing = this.calculateBearing(oldPos.lat, oldPos.lng, newPos.lat, newPos.lng);
    this.currentDirection = bearing;

    if (this.onDirectionUpdate) {
      this.onDirectionUpdate(bearing);
    }
  }

  /**
   * Update direction based on current position
   * Now async since it uses HERE API
   */
  async updateDirection() {
    if (this.positionHistory.length >= 2) {
      await this.calculateDirection();
    }
  }

  /**
   * Calculate distance between two points in meters using Haversine formula
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Calculate bearing (direction) from point A to point B in degrees
   * @returns {number} Bearing in degrees (0-360, where 0 is North)
   */
  calculateBearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) - 
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);

    let bearing = Math.atan2(y, x);
    bearing = bearing * 180 / Math.PI;
    bearing = (bearing + 360) % 360; // Normalize to 0-360

    return bearing;
  }

  /**
   * Check if a ferry terminal is in the same direction as the car
   * Uses HERE Routing API to determine if ferry is ahead based on route geometry
   * @param {number} carLat - Car's current latitude
   * @param {number} carLng - Car's current longitude
   * @param {number} ferryLat - Ferry terminal's latitude
   * @param {number} ferryLng - Ferry terminal's longitude
   * @returns {Promise<boolean>} True if ferry is ahead in car's direction
   */
  async isInSameDirection(carLat, carLng, ferryLat, ferryLng) {
    if (!this.currentDirection) {
      return true; // If no direction yet, include all ferries
    }

    const apiKey = config.HERE_CONFIG.getApiKey();
    if (!apiKey || import.meta.env.DEV) {
      // In DEV mode: use bearing-only fallback (HERE gives wrong direction for simulated routes)
      return this.isInSameDirectionFallback(carLat, carLng, ferryLat, ferryLng);
    }

    try {
      // Use HERE Routing API to get route from car to ferry
      // Check if the initial route direction aligns with car's current direction
      const origin = `${carLat},${carLng}`;
      const destination = `${ferryLat},${ferryLng}`;
      
      // Request route with sections to get departure/arrival points for direction checking
      // HERE API v8 returns sections with departure and arrival places by default
      const routeUrl = `${config.HERE_CONFIG.ROUTING_BASE_URL}?origin=${origin}&destination=${destination}&transportMode=car&routingMode=fast&return=summary&apiKey=${apiKey}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(routeUrl, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HERE Routing API failed: ${response.status}`);
      }

      const routeData = await response.json();
      
      if (!routeData.routes || routeData.routes.length === 0) {
        return false; // No route found
      }

      const route = routeData.routes[0];
      const firstSection = route.sections?.[0];
      
      if (!firstSection) {
        return false;
      }

      // Get initial route direction from departure/arrival points in sections
      // Check if route starts in similar direction to car's heading
      if (firstSection.departure && firstSection.arrival) {
        const departure = firstSection.departure;
        const arrival = firstSection.arrival;
        
        // Get coordinates from departure and arrival places
        // HERE API v8 uses place.location.latLng format
        const depPlace = departure.place;
        const arrPlace = arrival.place;
        
        const depLat = depPlace?.location?.latLng?.lat || depPlace?.location?.lat || depPlace?.lat;
        const depLng = depPlace?.location?.latLng?.lng || depPlace?.location?.lng || depPlace?.lng;
        const arrLat = arrPlace?.location?.latLng?.lat || arrPlace?.location?.lat || arrPlace?.lat;
        const arrLng = arrPlace?.location?.latLng?.lng || arrPlace?.location?.lng || arrPlace?.lng;
        
        if (depLat && depLng && arrLat && arrLng) {
          // Calculate bearing from departure to arrival (route's initial direction)
          const routeStartBearing = this.calculateBearing(depLat, depLng, arrLat, arrLng);
          
          // Compare route's initial bearing with car's current direction
          let diff = Math.abs(this.currentDirection - routeStartBearing);
          if (diff > 180) {
            diff = 360 - diff;
          }
          
          // If route starts within 90 degrees of car's direction, consider it in direction
          // This allows for reasonable turns and road network routing
          return diff <= 90;
        }
      }
      
      // Fallback: use route geometry if available
      if (firstSection.geometry) {
        const geometry = firstSection.geometry;
        
        // HERE Routing API v8 may return geometry as flexible polyline or array
        // For now, if it's a string (polyline), we skip it and use fallback
        if (typeof geometry === 'string') {
          // Would need polyline decoder - skip for now
          return this.isInSameDirectionFallback(carLat, carLng, ferryLat, ferryLng, 90);
        }
        
        if (Array.isArray(geometry) && geometry.length >= 2) {
          const firstPoint = geometry[0];
          const secondPoint = geometry[1];
          
          // Handle coordinate format: could be [lng, lat] or {lat, lng}
          const lat1 = firstPoint.lat || firstPoint[1] || firstPoint.latitude;
          const lng1 = firstPoint.lng || firstPoint[0] || firstPoint.longitude;
          const lat2 = secondPoint.lat || secondPoint[1] || secondPoint.latitude;
          const lng2 = secondPoint.lng || secondPoint[0] || secondPoint.longitude;
          
          if (lat1 && lng1 && lat2 && lng2) {
            const routeStartBearing = this.calculateBearing(lat1, lng1, lat2, lng2);
            
            let diff = Math.abs(this.currentDirection - routeStartBearing);
            if (diff > 180) {
              diff = 360 - diff;
            }
            
            return diff <= 90;
          }
        }
      }

      // If no geometry available, check route length
      // Very short routes might indicate ferry is behind or nearby
      const routeLength = firstSection.summary?.length || 0;
      if (routeLength < 100) {
        // Very short route - might be behind or side-by-side, exclude it
        return false;
      }

      // Fallback: if route exists and has reasonable length, assume it's ahead
      // But verify with bearing check
      return this.isInSameDirectionFallback(carLat, carLng, ferryLat, ferryLng, 90);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('HERE Routing API timeout, using fallback');
      } else {
        console.error('Error checking direction with HERE API:', error);
      }
      // Fallback to bearing-based check
      return this.isInSameDirectionFallback(carLat, carLng, ferryLat, ferryLng);
    }
  }

  /**
   * Fallback method: Check direction using bearing calculation
   */
  isInSameDirectionFallback(carLat, carLng, ferryLat, ferryLng, tolerance = 60) {
    if (!this.currentDirection) {
      return true;
    }

    const bearingToFerry = this.calculateBearing(carLat, carLng, ferryLat, ferryLng);
    let diff = Math.abs(this.currentDirection - bearingToFerry);
    
    if (diff > 180) {
      diff = 360 - diff;
    }

    return diff <= tolerance;
  }

  /**
   * Check if a ferry terminal has been passed by the car
   * A ferry is considered passed if it's behind the car based on route geometry
   * @param {number} carLat - Car's current latitude
   * @param {number} carLng - Car's current longitude
   * @param {number} ferryLat - Ferry terminal's latitude
   * @param {number} ferryLng - Ferry terminal's longitude
   * @returns {Promise<boolean>} True if ferry has been passed (is behind)
   */
  async hasPassedFerry(carLat, carLng, ferryLat, ferryLng) {
    if (!this.currentDirection) {
      return false; // Can't determine if no direction yet
    }

    const apiKey = config.HERE_CONFIG.getApiKey();
    if (!apiKey || import.meta.env.DEV) {
      // In DEV mode: use bearing-only fallback (HERE gives wrong direction for simulated routes)
      return this.hasPassedFerryFallback(carLat, carLng, ferryLat, ferryLng);
    }

    try {
      // Use HERE Routing API to get route from car to ferry
      // If the route would require going backwards, ferry has been passed
      const origin = `${carLat},${carLng}`;
      const destination = `${ferryLat},${ferryLng}`;
      
      const routeUrl = `${config.HERE_CONFIG.ROUTING_BASE_URL}?origin=${origin}&destination=${destination}&transportMode=car&routingMode=fast&return=summary&apiKey=${apiKey}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // Shorter timeout
      
      const response = await fetch(routeUrl, {
        method: 'GET',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HERE Routing API failed: ${response.status}`);
      }

      const routeData = await response.json();
      
      if (!routeData.routes || routeData.routes.length === 0) {
        // No route found - might be passed or unreachable
        return this.hasPassedFerryFallback(carLat, carLng, ferryLat, ferryLng);
      }

      const route = routeData.routes[0];
      const firstSection = route.sections?.[0];
      
      if (!firstSection || !firstSection.departure || !firstSection.arrival) {
        return this.hasPassedFerryFallback(carLat, carLng, ferryLat, ferryLng);
      }

      // Get route's initial direction from departure to arrival
      const departure = firstSection.departure;
      const arrival = firstSection.arrival;
      
      const depPlace = departure.place;
      const arrPlace = arrival.place;
      
      const depLat = depPlace?.location?.latLng?.lat || depPlace?.location?.lat || depPlace?.lat;
      const depLng = depPlace?.location?.latLng?.lng || depPlace?.location?.lng || depPlace?.lng;
      const arrLat = arrPlace?.location?.latLng?.lat || arrPlace?.location?.lat || arrPlace?.lat;
      const arrLng = arrPlace?.location?.latLng?.lng || arrPlace?.location?.lng || arrPlace?.lng;
      
      if (depLat && depLng && arrLat && arrLng) {
        // Calculate route's initial bearing
        const routeBearing = this.calculateBearing(depLat, depLng, arrLat, arrLng);
        
        // Compare with car's current direction
        // If route goes backwards (opposite direction), ferry has been passed
        let diff = Math.abs(this.currentDirection - routeBearing);
        if (diff > 180) {
          diff = 360 - diff;
        }
        
        // If route is going backwards (more than 135 degrees from car direction), ferry is passed
        // This allows for some tolerance in routing but catches obvious backwards routes
        if (diff > 135) {
          return true; // Ferry is behind, has been passed
        }
      }

      // If route exists and goes forward, ferry hasn't been passed
      return false;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.warn('HERE Routing API timeout, using fallback');
      } else {
        console.error('Error checking if ferry passed:', error);
      }
      return this.hasPassedFerryFallback(carLat, carLng, ferryLat, ferryLng);
    }
  }

  /**
   * Fallback method: Check if ferry is passed based on bearing
   */
  hasPassedFerryFallback(carLat, carLng, ferryLat, ferryLng) {
    if (!this.currentDirection) {
      return false;
    }

    const bearingToFerry = this.calculateBearing(carLat, carLng, ferryLat, ferryLng);
    let diff = Math.abs(this.currentDirection - bearingToFerry);
    
    if (diff > 180) {
      diff = 360 - diff;
    }

    // If ferry is more than 120 degrees from car's direction, it's likely passed
    return diff > 120;
  }

  /**
   * Get current direction
   * @returns {number|null} Current direction in degrees or null if not available
   */
  getCurrentDirection() {
    return this.currentDirection;
  }

  /**
   * Convert degrees to cardinal direction (N, S, E, W, NE, etc.)
   * @param {number} degrees - Direction in degrees (0-360)
   * @returns {string} Cardinal direction
   */
  degreesToCardinal(degrees) {
    if (degrees === null || degrees === undefined) {
      return null;
    }

    // Normalize to 0-360
    const normalized = ((degrees % 360) + 360) % 360;

    // Define cardinal directions (N, NE, E, SE, S, SW, W, NW)
    const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    
    // Each direction covers 45 degrees (360 / 8 = 45)
    // Add 22.5 to center the directions (so N is 0-45, NE is 45-90, etc.)
    const index = Math.round((normalized + 22.5) / 45) % 8;
    
    return directions[index];
  }

  /**
   * Get current cardinal direction
   * @returns {string|null} Current cardinal direction or null if not available
   */
  getCurrentCardinalDirection() {
    if (this.currentDirection === null) {
      return null;
    }
    return this.degreesToCardinal(this.currentDirection);
  }

  /**
   * Reset position history and direction
   */
  reset() {
    this.positionHistory = [];
    this.currentDirection = null;
  }
}

// Export singleton instance
export const carModeService = new CarModeService();
export default carModeService;
