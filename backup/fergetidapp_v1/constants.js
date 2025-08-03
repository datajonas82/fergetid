// API Configuration
export const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';

// Geolocation settings
export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 60000
};

// Search parameters
export const NEARBY_SEARCH_CONFIG = {
  maximumDistance: 50000, // meters
  maximumResults: 80,
  timeRange: 7200, // seconds (2 hours)
  numberOfDepartures: 6
};

// Transport modes
export const TRANSPORT_MODES = {
  WATER: 'water',
  LOCAL_CAR_FERRY: 'localCarFerry'
};

// Excluded transport submodes
export const EXCLUDED_SUBMODES = [
  'nationalCarFerry',
  'regionalPassengerFerry', 
  'localPassengerFerry',
  'nationalPassengerFerry',
  'sightSeeingService',
  'highSpeedPassengerService'
];

// UI Constants
export const APP_NAME = 'FERGETID';

// Distance formatting
export const DISTANCE_UNITS = {
  KILOMETERS: 'KM',
  METERS: 'M'
};

// Time formatting
export const TIME_FORMAT_OPTIONS = {
  hour: '2-digit',
  minute: '2-digit'
}; 