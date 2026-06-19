// GPS simulation service for development/testing
// Activated via ?sim=1 in the URL (only works in DEV mode)

// Route: Grodås → Volda → Ørsta → Festøya ferjekai
// Waypoints are spaced so each step looks like ~4 seconds of driving at ~60 km/h
export const SIM_ROUTE = [
  { lat: 62.2180, lng: 6.3780, label: 'Grodås' },
  { lat: 62.2060, lng: 6.3100, label: 'Mot Volda' },
  { lat: 62.1870, lng: 6.2300, label: 'Mot Volda' },
  { lat: 62.1680, lng: 6.1560, label: 'Nærmer Volda' },
  { lat: 62.1490, lng: 6.0730, label: 'Volda sentrum' },
  { lat: 62.1620, lng: 6.0860, label: 'Volda → Ørsta' },
  { lat: 62.1820, lng: 6.1050, label: 'Mot Ørsta' },
  { lat: 62.2010, lng: 6.1310, label: 'Ørsta sentrum' },
  { lat: 62.2200, lng: 6.0900, label: 'Vest for Ørsta' },
  { lat: 62.2600, lng: 6.0400, label: 'Mot Festøya' },
  { lat: 62.3100, lng: 5.9900, label: 'Mot Festøya' },
  { lat: 62.3450, lng: 5.9600, label: 'Nærmer Festøya' },
  { lat: 62.3580, lng: 5.9470, label: 'Festøya ferjekai' },
];

export const isSimulationMode = () =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('sim');
