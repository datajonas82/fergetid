// RevenueCat/IAP fjernet. Eksporter stubs for kompatibilitet.

export async function initPurchases() {
  return true;
}

export async function getCustomerInfo() {
  return {};
}

export async function isPremiumActive() {
  // Premium-funksjoner (GPS/kjøretid) er tilgjengelig for alle
  // TODO: Implementer faktisk premium-sjekk via in-app purchase for live-modus
  // For nå returnerer vi true for bakoverkompatibilitet
  return true;
}

/**
 * Check if user has access to live mode (premium feature)
 * Live mode requires premium subscription via in-app purchase
 */
export async function hasLiveModeAccess() {
  // Live-modus er en premium-funksjon som krever in-app purchase
  // TODO: Implementer faktisk premium-sjekk via in-app purchase
  // For nå returnerer vi true for bakoverkompatibilitet
  return await isPremiumActive();
}

export async function getOfferings() {
  return null;
}

export async function canMakePayments() {
  return { canMakePayments: true };
}

export async function purchasePackageById() {
  return { disabled: true };
}

export async function restorePurchases() {
  return {};
}

export async function restorePurchasesIOS() {
  return {};
}
