// Tema-konfigurasjon for FergeTid appen
export const THEMES = {
  'og-fergetid': {
    id: 'og-fergetid',
    name: 'OG Fergetid',
    description: 'Det originale FergeTid-designet',
    colors: {
      primary: '#d95cff',
      secondary: '#c026d3',
      tertiary: '#a855f7',
      background: 'linear-gradient(135deg, #d95cff 0%, #c026d3 50%, #a855f7 100%)',
      cardBackground: 'rgba(255, 255, 255, 0.9)',
      textPrimary: '#1a202c',
      textSecondary: '#4a5568',
      textWhite: '#ffffff',
      border: 'rgba(255, 255, 255, 0.2)',
      shadow: 'rgba(0, 0, 0, 0.1)',
      distanceBadge: '#3b82f6',
      departureTime: {
        now: '#ef4444',
        soon: '#f59e0b',
        later: '#10b981'
      }
    },
    fonts: {
      primary: 'Manrope',
      weight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900
      }
    },
    layout: {
      hasHeaderBar: false,
      hasLocationBar: false,
      cardStyle: 'og'
    }
  },
  'minima': {
    id: 'minima',
    name: 'minima',
    description: 'Minimalistisk design med høy kontrast',
    colors: {
      primary: '#1A1A1A',
      secondary: '#FFD700',
      tertiary: '#F8F7F0',
      background: '#F8F7F0',
      headerBackground: '#1A1A1A',
      cardBackground: '#ffffff',
      textPrimary: '#000000',
      textSecondary: '#333333',
      textWhite: '#ffffff',
      border: '#CCCCCC',
      shadow: 'rgba(0, 0, 0, 0.1)',
      distanceBadge: '#000000',
      locationBar: '#FFD700',
      departureTime: {
        now: '#FF0000',
        soon: '#FF0000',
        later: '#008000'
      }
    },
    fonts: {
      primary: 'system-ui, -apple-system, sans-serif',
      weight: {
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900
      }
    },
    layout: {
      hasHeaderBar: true,
      hasLocationBar: true,
      cardStyle: 'minima'
    }
  }
};

// Standard tema
export const DEFAULT_THEME = 'og-fergetid';

// Hjelpefunksjon for å hente tema
export const getTheme = (themeId) => {
  return THEMES[themeId] || THEMES[DEFAULT_THEME];
};

// Hjelpefunksjon for å lagre valgt tema
export const saveTheme = (themeId) => {
  try {
    localStorage.setItem('fergetid-theme', themeId);
  } catch (error) {
    console.error('Kunne ikke lagre tema:', error);
  }
};

// Hjelpefunksjon for å hente lagret tema
export const loadTheme = () => {
  try {
    const savedTheme = localStorage.getItem('fergetid-theme');
    return savedTheme && THEMES[savedTheme] ? savedTheme : DEFAULT_THEME;
  } catch (error) {
    console.error('Kunne ikke laste tema:', error);
    return DEFAULT_THEME;
  }
};
