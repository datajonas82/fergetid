/**
 * Spesielle fergesamband som overstyrer normal returkort matching logikk
 * Når en av disse fergekaiene vises som resultat, vises alltid de tilknyttede fergekaiene på returkort
 * 
 * BRUK:
 * 1. Legg til nye fergesamband i FERRY_GROUPS arrayet
 * 2. Angi alle fergekaier som skal vises sammen i en array
 * 3. Systemet genererer automatisk alle koblingene
 * 
 * EKSEMPEL:
 * [
 *   'Fosen ferjekai',
 *   'Trondheim ferjekai', 
 *   'Vanvikan ferjekai'
 * ]
 */

// Normaliser tekst for sammenligning (fjern kai/ferjekai/fergekai og gjør til lowercase)
const normalizeFerryName = (name) => {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s*(kai|ferjekai|fergekai)\s*/gi, '')
    .trim();
};

// Definer fergesamband som grupper av fergekaier som alltid skal vises sammen
export const FERRY_GROUPS = [
  // Dragsvik, Hella og Vangsnes ferjekai
  [
    'Dragsvik ferjekai',
    'Hella ferjekai', 
    'Vangsnes ferjekai'
  ],
  // Klokkarvik, Hjellestad og Bjelkarøy ferjekai
  [
    'Klokkarvik ferjekai',
    'Hjellestad ferjekai', 
    'Bjelkarøy ferjekai'
  ],
 // Bodø, Moskenes og Værøy ferjekai
 [
  'Bodø ferjekai',
  'Moskenes ferjekai', 
  'Værøy ferjekai',
  'Røst ferjekai'
]

  
  // Eksempel på hvordan man kan legge til flere fergesamband:
  // [
  //   'Fosen ferjekai',
  //   'Trondheim ferjekai',
  //   'Vanvikan ferjekai'
  // ]
];

// Generer automatisk SPECIAL_FERRY_CONNECTIONS fra FERRY_GROUPS
export const SPECIAL_FERRY_CONNECTIONS = FERRY_GROUPS.reduce((acc, group) => {
  group.forEach(ferryName => {
    const normalizedName = normalizeFerryName(ferryName);
    // Alle andre fergekaier i gruppen blir tilknyttede fergekaier
    acc[normalizedName] = group.filter(name => name !== ferryName);
  });
  return acc;
}, {});

/**
 * Sjekker om en fergekai er en del av et spesielt fergesamband
 * @param {string} ferryName - Navnet på fergekaien
 * @returns {Array|null} - Array med tilknyttede fergekaier hvis det er et spesielt samband, null ellers
 */
export const getSpecialFerryConnections = (ferryName) => {
  if (!ferryName) return null;
  
  const normalizedName = normalizeFerryName(ferryName);
  return SPECIAL_FERRY_CONNECTIONS[normalizedName] || null;
};

/**
 * Hjelpefunksjon for å finne fergekaier basert på navn i en liste med fergekaier
 * @param {Array} allFerryQuays - Liste med alle fergekaier
 * @param {Array} targetNames - Array med navn på fergekaier å finne
 * @returns {Array} - Array med funnede fergekaier
 */
export const findFerryQuaysByName = (allFerryQuays, targetNames) => {
  if (!allFerryQuays || !Array.isArray(allFerryQuays) || !targetNames || !Array.isArray(targetNames)) {
    return [];
  }

  return allFerryQuays.filter(quay => {
    const quayName = quay.name || '';
    const stopPlaceName = quay.stopPlace?.name || '';
    
    return targetNames.some(targetName => {
      const normalizedQuayName = normalizeFerryName(quayName);
      const normalizedStopPlaceName = normalizeFerryName(stopPlaceName);
      const normalizedTargetName = normalizeFerryName(targetName);
      
      return normalizedQuayName === normalizedTargetName || 
             normalizedStopPlaceName === normalizedTargetName;
    });
  });
};

/**
 * Hovedfunksjon for å få tilknyttede fergekaier for et spesielt fergesamband
 * @param {string} ferryName - Navnet på fergekaien
 * @param {Array} allFerryQuays - Liste med alle fergekaier
 * @returns {Array} - Array med tilknyttede fergekaier
 */
export const getConnectedFerryQuays = (ferryName, allFerryQuays) => {
  const connectedNames = getSpecialFerryConnections(ferryName);
  if (!connectedNames) return [];
  
  return findFerryQuaysByName(allFerryQuays, connectedNames);
};
