// RevenueCat/IAP fjernet. Eksporter stubs for kompatibilitet.

export async function initPurchases() {
  return true;
}

export async function getCustomerInfo() {
  return {};
}

export async function isPremiumActive() {
  // Premium-funksjoner (GPS/kjøretid) er tilgjengelig for alle
  return true;
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
