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
  { lat: 62.1560, lng: 6.0870, label: '2 km forbi Volda' },
  { lat: 62.1680, lng: 6.1080, label: '5 km forbi Volda mot Ørsta' },
];

export const isSimulationMode = () =>
  import.meta.env.DEV && new URLSearchParams(window.location.search).has('sim');
