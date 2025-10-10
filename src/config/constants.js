import { config } from './config.js';

// API Configuration
export const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';

// Geolocation settings - use config-based options
export const GEOLOCATION_OPTIONS = config.GEOLOCATION_CONFIG.getOptions();



// Transport modes
export const TRANSPORT_MODES = {
  WATER: 'water',
  LOCAL_CAR_FERRY: 'localCarFerry',
  LOCAL_PASSENGER_FERRY: 'localPassengerFerry'
};

// Excluded transport submodes
// Exclude only passenger/sightseeing submodes. Always include car ferries (local/national/vehicle).
export const EXCLUDED_SUBMODES = [
  'regionalPassengerFerry',
  'nationalPassengerFerry',
  'sightSeeingService'
];

// Passenger ferry submodes that we treat as "Hurtigbåt"
export const PASSENGER_FERRY_SUBMODES = [
  'localPassengerFerry',
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

// Universal UI colors (theme-agnostic)
export const UI_COLORS = {
  SUCCESS: '#16a34a', // match light green used in travel description
  DANGER: '#dc2626'  // red for missed
};

// GPS Search Radius Configuration
export const GPS_SEARCH_CONFIG = {
  // Main search radius in meters (70 km)
  SEARCH_RADIUS_METERS: 70000,
  
  // Driving time calculation radius in meters (70 km)
  DRIVING_RADIUS_METERS: 70000,
  
  // Maximum number of candidates to process
  MAX_CANDIDATES: 100,
  
  // Chunk size for processing candidates
  CHUNK_SIZE: 20,
  
  // Maximum number of results to return
  MAX_RESULTS: 8
}; 