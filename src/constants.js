import { config } from './config.js';

// API Configuration
export const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';

// Geolocation settings - use config-based options
export const GEOLOCATION_OPTIONS = config.GEOLOCATION_CONFIG.getOptions();



// Transport modes
export const TRANSPORT_MODES = {
  WATER: 'water',
  LOCAL_CAR_FERRY: 'localCarFerry'
};

// Excluded transport submodes
// Exclude only passenger/sightseeing submodes. Always include car ferries (local/national/vehicle).
export const EXCLUDED_SUBMODES = [
  'regionalPassengerFerry',
  'localPassengerFerry',
  'nationalPassengerFerry',
  'sightSeeingService',
  'highSpeedPassengerService'
];

// UI Constants
export const APP_NAME = 'FergeTid';

// Distance formatting
export const DISTANCE_UNITS = {
  KILOMETERS: 'km',
  METERS: 'M'
};

// Time formatting
export const TIME_FORMAT_OPTIONS = {
  hour: '2-digit',
  minute: '2-digit'
}; 