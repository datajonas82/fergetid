import { Capacitor } from '@capacitor/core';
import { Purchases as NativePurchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import * as PurchasesWeb from '@revenuecat/purchases-js';
import { config } from '../config/config';

let webPurchases = PurchasesWeb;

async function getSDKAndKey(appUserID) {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') {
    const apiKey = platform === 'ios'
      ? config.REVENUECAT_CONFIG.getIOSKey()
      : config.REVENUECAT_CONFIG.getAndroidKey();
    return { sdk: NativePurchases, apiKey, appUserID };
  }
  return { sdk: webPurchases, apiKey: config.REVENUECAT_CONFIG.getWebKey(), appUserID };
}

export async function initPurchases(appUserID = null) {
  const { sdk, apiKey, appUserID: id } = await getSDKAndKey(appUserID);
  if (!apiKey) return false;
  try {
    const level = (LOG_LEVEL?.WARN ?? 'WARN');
    const platform = Capacitor.getPlatform();
    if (platform === 'web') {
      await sdk.setLogLevel?.(level);
    } else {
      await sdk.setLogLevel?.({ level });
    }
  } catch {}
  // Web SDK bruker plain argumenter; native bruker objekt
  const platform = Capacitor.getPlatform();
  if (platform === 'web') {
    await sdk.configure(apiKey, { appUserID: id || undefined });
  } else {
    await sdk.configure({ apiKey, appUserID: id || undefined });
  }
  return true;
}

export async function getCustomerInfo() {
  const { sdk } = await getSDKAndKey();
  const res = await sdk.getCustomerInfo();
  return res?.customerInfo || res;
}

export async function isPremiumActive() {
  const entitlement = config.REVENUECAT_CONFIG.getEntitlementId();
  try {
    const info = await getCustomerInfo();
    return !!info?.entitlements?.active?.[entitlement];
  } catch {
    return false;
  }
}

export async function getOfferings() {
  const { sdk } = await getSDKAndKey();
  return await sdk.getOfferings();
}

export async function canMakePayments() {
  const { sdk } = await getSDKAndKey();
  try {
    if (sdk.canMakePayments) {
      return await sdk.canMakePayments();
    }
  } catch (_) {}
  // If not supported, assume true and let purchase path reveal issues
  return { canMakePayments: true };
}

export async function purchasePackageById(pkgIdOrType = '$rc_monthly') {
  const { sdk } = await getSDKAndKey();
  const offeringId = config.REVENUECAT_CONFIG.getOfferingId();
  const offerings = await getOfferings();
  const current = offerings?.current || offerings?.offerings?.current;
  const offering =
    (offerings?.all && offeringId && offerings.all[offeringId]) ||
    current || offerings;

  // Normaliser pakkeliste: availablePackages eller dedikerte nøkler (monthly/annual/lifetime)
  let available = Array.isArray(offering?.availablePackages) ? offering.availablePackages.slice() : [];
  const maybePush = (p) => { if (p && !available.includes(p)) available.push(p); };
  if (!available.length) {
    maybePush(offering?.monthly);
    maybePush(offering?.annual);
    maybePush(offering?.lifetime);
    // Noen SDK-er eksponerer packages som 'packages'
    if (Array.isArray(offering?.packages)) available = offering.packages;
  }

  const pkg = available?.find(
    (p) => p?.identifier === pkgIdOrType || p?.packageType === pkgIdOrType
  ) || available?.find((p) => (
    (pkgIdOrType === '$rc_monthly' && (p?.identifier === '$rc_monthly' || p?.packageType === 'MONTHLY')) ||
    (pkgIdOrType === '$rc_annual' && (p?.identifier === '$rc_annual' || p?.packageType === 'ANNUAL'))
  )) || available?.[0];

  if (!pkg) {
    // Riktigere feilmelding med snapshot av offering for debugging
    throw new Error('Fant ikke pakke i offering. Tilgjengelige nøkler: ' + JSON.stringify({
      identifiers: available?.map(p => p?.identifier),
      types: available?.map(p => p?.packageType),
      offeringId
    }));
  }

  // Capacitor SDK forventer { aPackage }, Web SDK forventer direkte pakken
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' || platform === 'android') {
    // Ryddet bort ekstra verbose debuglogging
    try {
      return await sdk.purchasePackage({ aPackage: pkg });
    } catch (e) {
      // Fallback: noen SDK-versjoner støtter purchaseStoreProduct
      try {
        if (sdk.purchaseStoreProduct && pkg?.product?.identifier) {
          return await sdk.purchaseStoreProduct({ storeProduct: { identifier: pkg.product.identifier } });
        }
      } catch (e2) {
        throw e2;
      }
      throw e;
    }
  }
  // Web (Stripe via RevenueCat Web SDK)
  return await sdk.purchasePackage(pkg);
}

export async function restorePurchases() {
  const { sdk } = await getSDKAndKey();
  if (sdk.restorePurchases) return await sdk.restorePurchases();
  return await getCustomerInfo();
}


// iOS-spesifikk restore (for å kalles fra iOS UI der Apple krever egen knapp)
export async function restorePurchasesIOS() {
  const platform = Capacitor.getPlatform();
  const { sdk } = await getSDKAndKey();
  if (platform === 'ios' && sdk.restorePurchases) {
    return await sdk.restorePurchases();
  }
  // På andre plattformer returnerer vi bare customerInfo
  return await getCustomerInfo();
}


