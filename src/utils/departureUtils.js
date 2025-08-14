// Utility functions for departure time formatting, coloring, and rules
import { calculateTimeDiff } from './helpers';
import { isCurrentlyDriving } from './drivingDetector';

// Helper function to format distance
const formatDistance = (distance) => {
  if (distance < 1000) {
    return `${Math.round(distance)} m`;
  } else {
    return `${(distance / 1000).toFixed(1)} km`;
  }
};

// Helper function to format driving time
const formatDrivingTime = (minutes) => {
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

// Calculate wait time at ferry terminal after arriving there
const calculateWaitTimeForNextFerry = (allDepartures, timeToDeparture, drivingTime) => {
  if (!allDepartures || allDepartures.length === 0) {
    return 0; // No departures available
  }
  
  // Calculate when we will arrive at the ferry terminal
  const now = new Date();
  const arrivalTime = new Date(now.getTime() + (drivingTime * 60000)); // Add driving time to now
  
  // Find departures that are after our arrival time
  const futureDepartures = allDepartures.filter(departure => {
    const departureTime = departure.aimed || departure.aimedDepartureTime;
    if (!departureTime) return false;
    
    const departureDate = new Date(departureTime);
    return departureDate > arrivalTime; // Only departures after we arrive
  });
  
  if (futureDepartures.length === 0) {
    return 0; // No future departures found
  }
  
  // Sort by departure time and get the next one
  futureDepartures.sort((a, b) => {
    const timeA = new Date(a.aimed || a.aimedDepartureTime);
    const timeB = new Date(b.aimed || b.aimedDepartureTime);
    return timeA - timeB;
  });
  
  const nextDeparture = futureDepartures[0];
  const nextDepartureTime = new Date(nextDeparture.aimed || nextDeparture.aimedDepartureTime);
  
  // Calculate wait time: time from arrival to next departure
  const waitTimeMinutes = Math.max(0, Math.round((nextDepartureTime - arrivalTime) / 60000));
  
  return waitTimeMinutes;
};

// Helper function to format wait time at ferry terminal
const formatWaitTime = (waitMinutes, allDepartures = [], drivingTime = 0, isCurrentlyDriving = false) => {
  // Sjekk om det faktisk er flere avganger i dag
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  
  const hasMoreDeparturesToday = allDepartures.some(departure => {
    const departureTime = departure.aimed || departure.aimedDepartureTime;
    if (!departureTime) return false;
    const departureDate = new Date(departureTime);
    return departureDate > now && departureDate <= todayEnd;
  });
  
  if (!hasMoreDeparturesToday) {
    return '<span style="color: #dc2626; font-weight: bold;">Ingen flere avganger i dag</span>';
  } else if (waitMinutes === 0) {
    return '<span style="color: #16a34a; font-weight: bold;">Fergen går akkurat når du kommer frem</span>';
  } else if (waitMinutes < 5) {
    const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
    return `Du må vente i <span style="color: #16a34a; font-weight: bold;">${waitMinutes} ${minuteText}</span> til neste avgang`;
  } else if (waitMinutes < 15) {
    const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
    return `Du må vente i <span style="color: #f59e0b; font-weight: bold;">${waitMinutes} ${minuteText}</span> til neste avgang`;
  } else if (waitMinutes < 20) {
    const minuteText = waitMinutes === 1 ? 'minutt' : 'minutter';
    return `Du må vente i <span style="color: #f59e0b; font-weight: bold;">${waitMinutes} ${minuteText}</span> til neste avgang`;
  } else {
    // For ventetid over 20 minutter, foreslå når man bør starte å kjøre
    const suggestedDepartureTime = calculateSuggestedDepartureTime(allDepartures, drivingTime);
    
    const hours = Math.floor(waitMinutes / 60);
    const minutes = waitMinutes % 60;
    let waitTimeText;
    
    if (hours === 0) {
      const minuteText = minutes === 1 ? 'minutt' : 'minutter';
      waitTimeText = `${minutes} ${minuteText}`;
    } else if (minutes === 0) {
      const hourText = hours === 1 ? 'time' : 'timer';
      waitTimeText = `${hours} ${hourText}`;
    } else {
      const hourText = hours === 1 ? 'time' : 'timer';
      const minuteText = minutes === 1 ? 'minutt' : 'minutter';
      waitTimeText = `${hours} ${hourText} og ${minutes} ${minuteText}`;
    }
    
    if (suggestedDepartureTime && !isCurrentlyDriving) {
      return `Du må vente i <span style="color: #f59e0b; font-weight: bold;">${waitTimeText}</span> til neste avgang. <span style="color: #000000;">Start å kjør kl. <span style="font-weight: bold;">${suggestedDepartureTime}</span> for å rekke fergen med <span style="font-weight: bold;">5 minutter</span> margin.</span>`;
    } else {
      return `Du må vente i <span style="color: #f59e0b; font-weight: bold;">${waitTimeText}</span> til neste avgang`;
    }
  }
};

// Calculate suggested departure time to arrive 5 minutes before ferry departure
const calculateSuggestedDepartureTime = (allDepartures, drivingTime) => {
  if (!allDepartures || allDepartures.length === 0 || !drivingTime) {
    return null;
  }
  
  // Use the same logic as calculateWaitTimeForNextFerry to find the next departure
  const now = new Date();
  const arrivalTime = new Date(now.getTime() + (drivingTime * 60000)); // Add driving time to now
  
  // Find departures that are after our arrival time
  const futureDepartures = allDepartures.filter(departure => {
    const departureTime = departure.aimed || departure.aimedDepartureTime;
    if (!departureTime) return false;
    
    const departureDate = new Date(departureTime);
    return departureDate > arrivalTime; // Only departures after we arrive
  });
  
  if (futureDepartures.length === 0) {
    return null;
  }
  
  // Sort by departure time and get the next one
  futureDepartures.sort((a, b) => {
    const timeA = new Date(a.aimed || a.aimedDepartureTime);
    const timeB = new Date(b.aimed || b.aimedDepartureTime);
    return timeA - timeB;
  });
  
  const nextDeparture = futureDepartures[0];
  const nextDepartureTime = new Date(nextDeparture.aimed || nextDeparture.aimedDepartureTime);
  
  // Calculate when we should arrive (5 minutes before departure)
  const targetArrivalTime = new Date(nextDepartureTime.getTime() - (5 * 60000));
  
  // Calculate when we should start driving
  const suggestedDepartureTime = new Date(targetArrivalTime.getTime() - (drivingTime * 60000));
  
  // Only suggest if the suggested departure time is in the future
  if (suggestedDepartureTime <= now) {
    return null;
  }
  
  // Calculate how much time we can save by waiting
  const timeToSave = Math.max(0, Math.round((suggestedDepartureTime - now) / 60000));
  
  // Only suggest if we can save more than 10 minutes by waiting
  if (timeToSave < 10) {
    return null;
  }
  
  // Format as HH:MM
  return suggestedDepartureTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

/**
 * Generate natural language description of travel time and ferry timing
 * @param {number} distance - Distance in meters
 * @param {number} drivingTime - Driving time in minutes
 * @param {number} timeToDeparture - Minutes until next departure
 * @param {Array} allDepartures - All available departures
 * @param {boolean} isCurrentlyDriving - Whether user is currently driving
 * @returns {string} HTML formatted description
 */
export const generateTravelDescription = (distance, drivingTime, timeToDeparture, allDepartures = [], isCurrentlyDriving = false) => {
  const distanceText = formatDistance(distance);
  const drivingTimeText = formatDrivingTime(drivingTime);
  
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
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer</span>.`;
      } else {
        const minuteText = marginMinutes === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du rekker fergen med <span style="color: #16a34a; font-weight: bold;">${marginHours} timer og ${marginMinutes} ${minuteText}</span>.`;
      }
    }
  } else {
    const missedBy = drivingTime - timeToDeparture;
    
    // Calculate wait time for next ferry (after arriving at terminal)
    const waitTimeForNextFerry = calculateWaitTimeForNextFerry(allDepartures, timeToDeparture, drivingTime);
    const waitTimeText = formatWaitTime(waitTimeForNextFerry, allDepartures, drivingTime, isCurrentlyDriving);
    
    // Only show missed time if wait time is significant (more than 15 minutes)
    if (waitTimeForNextFerry > 15) {
      if (missedBy < 60) {
        const minuteText = missedBy === 1 ? 'minutt' : 'minutter';
        return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer <span style="color: #dc2626; font-weight: bold;">${missedBy} ${minuteText}</span> for sent. ${waitTimeText}`;
      } else {
        const missedHours = Math.floor(missedBy / 60);
        const missedMinutes = missedBy % 60;
        if (missedMinutes === 0) {
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer <span style="color: #dc2626; font-weight: bold;">${missedHours} timer</span> for sent. ${waitTimeText}`;
        } else {
          const minuteText = missedMinutes === 1 ? 'minutt' : 'minutter';
          return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. Du kommer <span style="color: #dc2626; font-weight: bold;">${missedHours} timer og ${missedMinutes} ${minuteText}</span> for sent. ${waitTimeText}`;
        }
      }
    } else {
      // Don't show missed time when wait time is short
      return `Du er <span style="color: #2563eb; font-weight: bold;">${distanceText}</span> unna og det tar ca <span style="color: #2563eb; font-weight: bold;">${drivingTimeText}</span> å kjøre. ${waitTimeText}`;
    }
  }
};

/**
 * Get CSS color class for departure time based on driving time and mode
 * @param {string} departureTime - ISO string of departure time
 * @param {number} drivingTime - Driving time in minutes
 * @param {boolean} showDrivingTimes - Whether driving times are enabled
 * @param {string} mode - Current app mode ('search' or 'gps')
 * @returns {string} Tailwind CSS color class
 */
export function getDepartureTimeColor(departureTime, drivingTime, showDrivingTimes, mode) {
  // Default green when driving times are disabled or not in GPS mode
  if (!showDrivingTimes || !drivingTime || mode !== 'gps') {
    return 'text-green-600';
  }
  
  const timeToDeparture = calculateTimeDiff(departureTime);
  const canMakeIt = timeToDeparture > drivingTime;
  
  if (!canMakeIt) {
    return 'text-red-600'; // Can't make it
  }
  
  return 'text-green-600'; // Can make it
}

/**
 * Check if a departure is missed (can't be reached in time)
 * @param {string} departureTime - ISO string of departure time
 * @param {number} drivingTime - Driving time in minutes
 * @param {boolean} showDrivingTimes - Whether driving times are enabled
 * @param {string} mode - Current app mode ('search' or 'gps')
 * @returns {boolean} True if departure is missed
 */
export function isDepartureMissed(departureTime, drivingTime, showDrivingTimes, mode) {
  if (!showDrivingTimes || !drivingTime || mode !== 'gps') {
    return false;
  }
  
  const timeToDeparture = calculateTimeDiff(departureTime);
  return timeToDeparture <= drivingTime;
}

/**
 * Get optimal font size based on text length and max width
 * @param {string} text - Text to measure
 * @param {number} maxWidth - Maximum width in pixels (default: 320)
 * @returns {string} CSS font size
 */
export function getOptimalFontSize(text, maxWidth = 320) {
  if (!text) return '1.5rem'; // Standard size
  
  // For destination texts (small fields)
  if (maxWidth === 96) {
    const baseSize = 14; // Standard size for destinations
    const maxLength = 10; // Characters before reducing size
    
    if (text.length <= maxLength) {
      return '0.875rem'; // Keep standard size (14px)
    }
    
    // Calculate reduced size based on text length
    const reduction = Math.min((text.length - maxLength) * 0.5, 4);
    const newSize = Math.max(baseSize - reduction, 10); // Minimum 10px
    
    return newSize + 'px';
  }
  
  // For ferry quay card names (large fields)
  const baseSize = 24; // 1.5rem = 24px
  const maxLength = 25; // Characters before reducing size
  
  if (text.length <= maxLength) {
    return '1.5rem'; // Keep standard size
  }
  
  // Calculate reduced size based on text length
  const reduction = Math.min((text.length - maxLength) * 0.8, 8); // Max 8px reduction
  const newSize = Math.max(baseSize - reduction, 16); // Minimum 16px (1rem)
  
  return newSize + 'px';
}

/**
 * Clean destination text by removing E39 references and extra spaces
 * @param {string} text - Text to clean
 * @returns {string} Cleaned text
 */
export function cleanDestinationText(text) {
  if (!text) return '';
  return text.replace(/E39/gi, '').replace(/\s+/g, ' ').trim();
}

/**
 * Format departure time for display
 * @param {string|Date} departureTime - Departure time
 * @returns {string} Formatted time string (HH:MM)
 */
export function formatDepartureTime(departureTime) {
  const date = new Date(departureTime);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Sort departures by time (earliest first)
 * @param {Array} departures - Array of departure objects
 * @returns {Array} Sorted departures
 */
export function sortDeparturesByTime(departures) {
  return departures.sort((a, b) => {
    const timeA = new Date(a.aimedDepartureTime || a.aimed);
    const timeB = new Date(b.aimedDepartureTime || b.aimed);
    return timeA - timeB;
  });
}

/**
 * Filter departures to only show future departures
 * @param {Array} departures - Array of departure objects
 * @returns {Array} Future departures only
 */
export function filterFutureDepartures(departures) {
  const now = new Date();
  return departures.filter(departure => {
    const departureTime = new Date(departure.aimedDepartureTime || departure.aimed);
    return departureTime > now;
  });
}

/**
 * Get next departure from a list of departures
 * @param {Array} departures - Array of departure objects
 * @returns {Object|null} Next departure or null
 */
export function getNextDeparture(departures) {
  const futureDepartures = filterFutureDepartures(departures);
  return futureDepartures.length > 0 ? futureDepartures[0] : null;
}

/**
 * Get later departures (excluding the next one)
 * @param {Array} departures - Array of departure objects
 * @param {number} count - Number of later departures to return (default: 4)
 * @returns {Array} Later departures
 */
export function getLaterDepartures(departures, count = 4) {
  const futureDepartures = filterFutureDepartures(departures);
  return futureDepartures.slice(1, count + 1);
}
