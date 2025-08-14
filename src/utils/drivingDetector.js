/**
 * Driving detection utilities using Device Motion API
 * Detects if user is currently driving a vehicle based on motion patterns
 */

class DrivingDetector {
  constructor() {
    this.isDriving = false;
    this.motionData = [];
    this.maxDataPoints = 50; // Keep last 50 data points
    this.detectionThreshold = 0.3; // Threshold for driving detection
    this.isListening = false;
    this.onDrivingStateChange = null;
  }

  /**
   * Start listening for motion data
   * @param {Function} callback - Callback function when driving state changes
   */
  startDetection(callback = null) {
    if (this.isListening) {
      return;
    }

    this.onDrivingStateChange = callback;
    this.isListening = true;

    // Request permission for device motion (iOS)
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      DeviceMotionEvent.requestPermission()
        .then(permissionState => {
          if (permissionState === 'granted') {
            this.startMotionListener();
          } else {
            console.log('Device motion permission denied');
          }
        })
        .catch(error => {
          console.error('Error requesting device motion permission:', error);
        });
    } else {
      // For browsers that don't require permission
      this.startMotionListener();
    }
  }

  /**
   * Stop listening for motion data
   */
  stopDetection() {
    this.isListening = false;
    if (window.removeEventListener) {
      window.removeEventListener('devicemotion', this.handleMotion.bind(this));
    }
  }

  /**
   * Start the motion event listener
   */
  startMotionListener() {
    if (window.addEventListener) {
      window.addEventListener('devicemotion', this.handleMotion.bind(this), true);
    }
  }

  /**
   * Handle motion events and analyze for driving patterns
   * @param {DeviceMotionEvent} event - Motion event
   */
  handleMotion(event) {
    if (!this.isListening) return;

    const acceleration = event.acceleration;
    if (!acceleration) return;

    // Calculate total acceleration magnitude
    const magnitude = Math.sqrt(
      Math.pow(acceleration.x || 0, 2) +
      Math.pow(acceleration.y || 0, 2) +
      Math.pow(acceleration.z || 0, 2)
    );

    // Add to data array
    this.motionData.push({
      magnitude,
      timestamp: Date.now()
    });

    // Keep only recent data points
    if (this.motionData.length > this.maxDataPoints) {
      this.motionData.shift();
    }

    // Analyze motion pattern if we have enough data
    if (this.motionData.length >= 10) {
      this.analyzeMotionPattern();
    }
  }

  /**
   * Analyze motion pattern to determine if user is driving
   */
  analyzeMotionPattern() {
    if (this.motionData.length < 10) return;

    // Calculate average acceleration
    const avgMagnitude = this.motionData.reduce((sum, data) => sum + data.magnitude, 0) / this.motionData.length;

    // Calculate variance (how much the acceleration varies)
    const variance = this.motionData.reduce((sum, data) => {
      return sum + Math.pow(data.magnitude - avgMagnitude, 2);
    }, 0) / this.motionData.length;

    // Calculate frequency of significant movements
    const significantMovements = this.motionData.filter(data => 
      data.magnitude > avgMagnitude + Math.sqrt(variance)
    ).length;

    // Determine if driving based on patterns
    const isCurrentlyDriving = this.detectDrivingPattern(avgMagnitude, variance, significantMovements);

    // Only trigger callback if state changed
    if (isCurrentlyDriving !== this.isDriving) {
      this.isDriving = isCurrentlyDriving;
      if (this.onDrivingStateChange) {
        this.onDrivingStateChange(this.isDriving);
      }
    }
  }

  /**
   * Detect driving pattern based on motion characteristics
   * @param {number} avgMagnitude - Average acceleration magnitude
   * @param {number} variance - Variance in acceleration
   * @param {number} significantMovements - Number of significant movements
   * @returns {boolean} True if driving pattern detected
   */
  detectDrivingPattern(avgMagnitude, variance, significantMovements) {
    // Driving typically has:
    // - Moderate but consistent acceleration (not too high, not too low)
    // - Regular patterns of movement
    // - Some variance but not chaotic

    const isModerateAcceleration = avgMagnitude > 0.5 && avgMagnitude < 3.0;
    const hasRegularPattern = significantMovements > 3 && significantMovements < this.motionData.length * 0.7;
    const hasReasonableVariance = variance > 0.1 && variance < 2.0;

    return isModerateAcceleration && hasRegularPattern && hasReasonableVariance;
  }

  /**
   * Get current driving state
   * @returns {boolean} True if currently driving
   */
  getDrivingState() {
    return this.isDriving;
  }

  /**
   * Manually set driving state (for testing or manual override)
   * @param {boolean} driving - Whether user is driving
   */
  setDrivingState(driving) {
    if (this.isDriving !== driving) {
      this.isDriving = driving;
      if (this.onDrivingStateChange) {
        this.onDrivingStateChange(this.isDriving);
      }
    }
  }

  /**
   * Check if device motion is supported
   * @returns {boolean} True if device motion is supported
   */
  isSupported() {
    return typeof DeviceMotionEvent !== 'undefined';
  }

  /**
   * Check if device motion permission is granted
   * @returns {Promise<boolean>} True if permission is granted
   */
  async hasPermission() {
    if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
      try {
        const permissionState = await DeviceMotionEvent.requestPermission();
        return permissionState === 'granted';
      } catch (error) {
        console.error('Error checking device motion permission:', error);
        return false;
      }
    }
    return true; // No permission required
  }

  /**
   * Test function to simulate driving motion for testing purposes
   * @param {boolean} simulateDriving - Whether to simulate driving or stationary
   */
  testDrivingDetection(simulateDriving = true) {
    if (simulateDriving) {
      // Simulate driving motion data
      for (let i = 0; i < 20; i++) {
        this.motionData.push({
          magnitude: 1.5 + Math.random() * 0.5, // Moderate acceleration
          timestamp: Date.now() + i * 100
        });
      }
    } else {
      // Simulate stationary motion data
      for (let i = 0; i < 20; i++) {
        this.motionData.push({
          magnitude: 0.1 + Math.random() * 0.2, // Low acceleration
          timestamp: Date.now() + i * 100
        });
      }
    }

    // Analyze the simulated data
    this.analyzeMotionPattern();
  }
}

// Create singleton instance
const drivingDetector = new DrivingDetector();

/**
 * Start driving detection
 * @param {Function} callback - Callback function when driving state changes
 */
export function startDrivingDetection(callback = null) {
  drivingDetector.startDetection(callback);
}

/**
 * Stop driving detection
 */
export function stopDrivingDetection() {
  drivingDetector.stopDetection();
}

/**
 * Get current driving state
 * @returns {boolean} True if currently driving
 */
export function isCurrentlyDriving() {
  return drivingDetector.getDrivingState();
}

/**
 * Manually set driving state
 * @param {boolean} driving - Whether user is driving
 */
export function setDrivingState(driving) {
  drivingDetector.setDrivingState(driving);
}

/**
 * Check if device motion is supported
 * @returns {boolean} True if device motion is supported
 */
export function isDrivingDetectionSupported() {
  return drivingDetector.isSupported();
}

/**
 * Check if device motion permission is granted
 * @returns {Promise<boolean>} True if permission is granted
 */
export function hasDrivingDetectionPermission() {
  return drivingDetector.hasPermission();
}

/**
 * Test driving detection with simulated data
 * @param {boolean} simulateDriving - Whether to simulate driving or stationary
 */
export function testDrivingDetection(simulateDriving = true) {
  drivingDetector.testDrivingDetection(simulateDriving);
}

export default drivingDetector;
