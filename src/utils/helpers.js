import { TIME_FORMAT_OPTIONS, DISTANCE_UNITS } from '../constants';

// Format minutes to human readable time
export function formatMinutes(mins) {
  if (mins < 1) return 'nå';
  if (mins < 60) return mins + ' min';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h} time${h > 1 ? 'r' : ''}${m > 0 ? ` ${m} min` : ''}`;
}

// Format distance in kilometers or meters
export function formatDistance(meters) {
  if (!meters) return '? ' + DISTANCE_UNITS.KILOMETERS;
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${Math.round(meters / 1000)} ${DISTANCE_UNITS.KILOMETERS}`;
}

// Get current time formatted
export function getCurrentTime() {
  return new Date().toLocaleTimeString([], TIME_FORMAT_OPTIONS);
}

// Calculate time difference in minutes
export function calculateTimeDiff(targetTime) {
  return Math.max(
    0,
    Math.round((new Date(targetTime) - new Date()) / 60000)
  );
}

// Clean destination text
export function cleanDestinationText(text) {
  if (!text) return '';
  return text.replace(/E39/gi, '').replace(/\s+/g, ' ').trim();
}

// Normalize text for search (remove diacritics)
export function normalizeText(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

// Convert Norwegian text to Bokmål
export function bokmaalify(text) {
  if (!text) return text;
  return text.replace(/ferjekai/gi, 'fergekai');
}

// Get location name from reverse geocoding data
export function extractLocationName(data) {
  return (
    data.address?.city ||
    data.address?.town ||
    data.address?.village ||
    data.address?.suburb ||
    data.address?.hamlet ||
    data.address?.municipality ||
    data.address?.county ||
    'Ukjent sted'
  );
} 