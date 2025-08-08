import { config } from './config.js';

// API Configuration
export const ENTUR_ENDPOINT = 'https://api.entur.io/journey-planner/v3/graphql';

// Geolocation settings
export const GEOLOCATION_OPTIONS = {
  enableHighAccuracy: false, // Less aggressive for simulator
  timeout: 10000, // 10 seconds
  maximumAge: 300000 // 5 minutes
};

// Search parameters
export const NEARBY_SEARCH_CONFIG = {
  maximumDistance: 60000, // meters (60km)
  maximumResults: 200,
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
  'highSpeedPassengerService',
  'highSpeedVehicleService',
  'highSpeedCarFerry'
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