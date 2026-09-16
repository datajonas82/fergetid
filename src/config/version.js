/* global __APP_VERSION__, __APP_BUILD__ */
// Versjon og iOS-byggnummer injiseres ved byggetid (se config/vite.config.js).
// Samlet i én modul så de injiserte globalene bare refereres ett sted.

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
export const APP_BUILD = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : '';

// «3.8.4 (18)» på iOS der byggnummeret finnes, ellers bare «3.8.4».
export const APP_VERSION_LABEL = APP_BUILD ? `${APP_VERSION} (${APP_BUILD})` : APP_VERSION;
