// Live Mode Service - Updates GPS position every 15 seconds and calculates travel times
import { Geolocation } from '@capacitor/geolocation';
import { calculateDrivingTime } from './GeoServices';
import { Capacitor } from '@capacitor/core';

class LiveModeService {
  constructor() {
    this.watchId = null;
    this.intervalId = null;
    this.callbacks = new Set();
    this.isActive = false;
    this.currentLocation = null;
    this.currentDrivingTimes = {};
    this.currentDistances = {};
  }

  /**
   * Start live mode tracking
   * @param {Object} ferryTerminal - Ferry terminal object with id, latitude, longitude
   * @param {Function} onUpdate - Callback called when location/driving time updates
   */
  async start(ferryTerminal, onUpdate) {
    if (this.isActive) {
      this.stop();
    }

    this.ferryTerminal = ferryTerminal;
    this.isActive = true;

    if (onUpdate) {
      this.callbacks.add(onUpdate);
    }

    // Get initial position immediately
    await this.updateLocation();

    // Set up interval to update every 15 seconds
    this.intervalId = setInterval(async () => {
      await this.updateLocation();
    }, 15000); // 15 seconds
  }

  /**
   * Update current location and calculate driving times
   */
  async updateLocation() {
    if (!this.isActive || !this.ferryTerminal) {
      return;
    }

    try {
      let position;

      if (Capacitor.getPlatform() === 'ios') {
        // Try Capacitor Geolocation first
        try {
          const permissionState = await Geolocation.checkPermissions();
          if (permissionState.location !== 'granted') {
            const requestResult = await Geolocation.requestPermissions();
            if (requestResult.location !== 'granted') {
              throw new Error('Location permission denied');
            }
          }

          position = await Geolocation.getCurrentPosition({
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 15000 // Use cached position if less than 15 seconds old
          });
        } catch (capacitorError) {
          // Fallback to browser geolocation
          position = await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
              reject(new Error('GPS timeout'));
            }, 5000);

            navigator.geolocation.getCurrentPosition(
              (pos) => {
                clearTimeout(timeoutId);
                resolve(pos);
              },
              (error) => {
                clearTimeout(timeoutId);
                reject(error);
              },
              { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 }
            );
          });
        }
      } else {
        // Use browser geolocation
        position = await new Promise((resolve, reject) => {
          const timeoutId = setTimeout(() => {
            reject(new Error('GPS timeout'));
          }, 5000);

          navigator.geolocation.getCurrentPosition(
            (pos) => {
              clearTimeout(timeoutId);
              resolve(pos);
            },
            (error) => {
              clearTimeout(timeoutId);
              reject(error);
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 15000 }
          );
        });
      }

      const { latitude, longitude } = position.coords;
      this.currentLocation = { latitude, longitude };

      // Calculate driving time to ferry terminal
      try {
        const result = await calculateDrivingTime(
          { lat: latitude, lng: longitude },
          { lat: this.ferryTerminal.latitude, lng: this.ferryTerminal.longitude },
          { roadOnly: true }
        );

        this.currentDrivingTimes[this.ferryTerminal.id] = result.time;
        this.currentDistances[this.ferryTerminal.id] = result.distance;

        // Notify all callbacks
        this.callbacks.forEach(callback => {
          callback({
            location: this.currentLocation,
            drivingTime: result.time,
            distance: result.distance,
            ferryTerminal: this.ferryTerminal
          });
        });
      } catch (error) {
        console.error('Error calculating driving time:', error);
        // Notify callbacks even if driving time calculation fails
        this.callbacks.forEach(callback => {
          callback({
            location: this.currentLocation,
            drivingTime: null,
            distance: null,
            ferryTerminal: this.ferryTerminal,
            error: error.message
          });
        });
      }
    } catch (error) {
      console.error('Error updating location in live mode:', error);
      // Notify callbacks of error
      this.callbacks.forEach(callback => {
        callback({
          location: this.currentLocation,
          drivingTime: null,
          distance: null,
          ferryTerminal: this.ferryTerminal,
          error: error.message
        });
      });
    }
  }

  /**
   * Stop live mode tracking
   */
  stop() {
    this.isActive = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    if (this.watchId !== null && navigator.geolocation) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }

    this.callbacks.clear();
    this.currentLocation = null;
    this.currentDrivingTimes = {};
    this.currentDistances = {};
    this.ferryTerminal = null;
  }

  /**
   * Register a callback for updates
   */
  onUpdate(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Get current location
   */
  getCurrentLocation() {
    return this.currentLocation;
  }

  /**
   * Get current driving time for ferry terminal
   */
  getCurrentDrivingTime(ferryTerminalId) {
    return this.currentDrivingTimes[ferryTerminalId] || null;
  }

  /**
   * Get current distance to ferry terminal
   */
  getCurrentDistance(ferryTerminalId) {
    return this.currentDistances[ferryTerminalId] || null;
  }
}

// Export singleton instance
export const liveModeService = new LiveModeService();
export default liveModeService;
