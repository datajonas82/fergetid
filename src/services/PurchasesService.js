// Pro-tilgang for Fergetid: engangskjøp (Apple IAP via RevenueCat) med 14 dagers
// gratis prøveperiode. Prøveperioden håndteres app-side fordi et non-consumable
// engangskjøp ikke har innebygd prøvetid i StoreKit (kun abonnement har det).
//
// Tilgang = kjøpt ELLER innenfor 14-dagers prøve (fra første oppstart).
// Fergetider (Entur) er alltid gratis; GPS + kjøretid er det som gates.

import { Capacitor } from '@capacitor/core';
import { config } from '../config/config';

const TRIAL_DAYS = 14;
const FIRST_LAUNCH_KEY = 'fergetid_first_launch';
const DAY_MS = 24 * 60 * 60 * 1000;

const entitlementId = () => config.REVENUECAT_CONFIG.getEntitlementId(); // 'premium' som standard
const PRODUCT_ID = 'com.fergetid.app.pro'; // engangskjøpet (non-consumable)

// Velg riktig pakke fra offeringen: match på produkt-ID slik at gamle
// (utilgjengelige) abonnementspakker i samme offering aldri velges ved en feil.
const pickProPackage = (offerings) => {
  const offeringId = (config.REVENUECAT_CONFIG.getOfferingId && config.REVENUECAT_CONFIG.getOfferingId()) || 'Premium';
  // Robusthet: se både på default-offeringen (.current) og den navngitte, i
  // tilfelle default ikke er satt. Prioriter eksakt match på produkt-ID slik at
  // gamle (utilgjengelige) abonnementspakker aldri velges ved en feil.
  const pools = [
    offerings?.current?.availablePackages,
    offerings?.all?.[offeringId]?.availablePackages,
  ].filter(Boolean);
  for (const pkgs of pools) {
    const hit = pkgs.find(p => p?.product?.identifier === PRODUCT_ID);
    if (hit) return hit;
  }
  for (const pkgs of pools) { if (pkgs[0]) return pkgs[0]; }
  return null;
};

// Diagnose-hjelper: sørger for at et kall ikke kan henge i det uendelige.
const withTimeout = (promise, ms, label) => Promise.race([
  Promise.resolve(promise),
  new Promise((_, reject) => setTimeout(() => {
    const err = new Error(`timeout:${label} (${ms}ms)`);
    err.rcTimeout = label;
    reject(err);
  }, ms)),
]);

let _rcConfigured = false;
let _purchased = false;
let _priceString = null;
let _initialized = false;
let _Purchases = null;
let _webPurchased = false; // web: gyldig Vipps-opplåsings-token verifisert
const WEB_TOKEN_KEY = 'fergetid_vipps_token';

// ─── Endringsvarsling til React ───────────────────────────────────────────────
const listeners = new Set();
const notify = () => {
  const state = getAccessState();
  listeners.forEach(cb => { try { cb(state); } catch (_) {} });
};
export const subscribeAccess = (cb) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};

// ─── Plattform ────────────────────────────────────────────────────────────────
const isNativeIOS = () => {
  try { return Capacitor.getPlatform() === 'ios'; } catch { return false; }
};

// Dev-hjelp: åpne betalingsmuren i nettleser med ?forcePaywall=1
const forcePaywallDev = () => {
  try {
    return import.meta.env.DEV && new URLSearchParams(window.location.search).has('forcePaywall');
  } catch { return false; }
};

// Web-betalingsmuren slås på med VITE_WEB_PAYWALL_ENABLED=true. Holdes AV til
// Vipps er konfigurert i prod, ellers låses eksisterende web-brukere ute uten
// mulighet til å betale når prøven utløper.
const webPaywallEnabled = () => {
  try { return String(import.meta.env.VITE_WEB_PAYWALL_ENABLED) === 'true'; } catch { return false; }
};

// ─── Prøveperiode ─────────────────────────────────────────────────────────────
const getFirstLaunch = () => {
  try {
    let v = localStorage.getItem(FIRST_LAUNCH_KEY);
    if (!v) {
      v = String(Date.now());
      localStorage.setItem(FIRST_LAUNCH_KEY, v);
    }
    return parseInt(v, 10);
  } catch {
    return Date.now();
  }
};

export const getTrialStatus = () => {
  const startedAt = getFirstLaunch();
  const expiresAt = startedAt + TRIAL_DAYS * DAY_MS;
  const msLeft = expiresAt - Date.now();
  return {
    active: msLeft > 0,
    daysLeft: Math.max(0, Math.ceil(msLeft / DAY_MS)),
    startedAt,
    expiresAt,
    totalDays: TRIAL_DAYS,
  };
};

// ─── Web-kjøp (Vipps, Fase 2) ─────────────────────────────────────────────────
const getWebToken = () => {
  try { return localStorage.getItem(WEB_TOKEN_KEY); } catch { return null; }
};
const setWebToken = (t) => {
  try { localStorage.setItem(WEB_TOKEN_KEY, t); } catch (_) {}
};
const clearWebToken = () => {
  try { localStorage.removeItem(WEB_TOKEN_KEY); } catch (_) {}
};

const postJson = async (url, body) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
};

// Kalles ved oppstart på web: håndter retur fra Vipps, ellers valider lagret token.
const _initWebAccess = async () => {
  // 1. Kom vi tilbake fra Vipps? (…/?vippspay=<reference>)
  let ref = null;
  try { ref = new URLSearchParams(window.location.search).get('vippspay'); } catch (_) {}
  if (ref) {
    try {
      const { ok, data } = await postJson('/api/vipps/confirm', { reference: ref });
      if (ok && data.paid && data.token) {
        setWebToken(data.token);
        _webPurchased = true;
      }
    } catch (_) { /* nettverksfeil — brukeren kan prøve igjen */ }
    // Fjern query-paramet så en refresh ikke re-bekrefter
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('vippspay');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    } catch (_) {}
    notify();
    return;
  }

  // 2. Lagret token fra før? Valider signaturen mot backend (kan ikke forfalskes lokalt).
  const token = getWebToken();
  if (token) {
    try {
      const { ok, data } = await postJson('/api/vipps/verify', { token });
      if (ok && data.valid) _webPurchased = true;
      else if (ok && !data.valid) clearWebToken(); // definitivt ugyldig → fjern
      // Ellers (endepunkt nede/nettverk): behold token, prøv igjen senere (fail closed)
    } catch (_) { /* behold token, prøv igjen senere */ }
    notify();
  }
};

// Start Vipps-betaling: lag payment og send brukeren til Vipps.
export const startVippsPurchase = async () => {
  if (isNativeIOS()) return { success: false, reason: 'not_web' };
  try {
    const { ok, status, data } = await postJson('/api/vipps/create', {});
    if (ok && data.redirectUrl) {
      window.location.href = data.redirectUrl; // navigerer bort; retur håndteres ved neste last
      return { success: true };
    }
    if (status === 503) return { success: false, reason: 'not_configured' };
    return { success: false, reason: 'error', detail: data };
  } catch (e) {
    return { success: false, reason: 'network', detail: String((e && e.message) || e) };
  }
};

// ─── Tilgangsstatus (én kilde til sannhet) ────────────────────────────────────
// unlocked : har brukeren tilgang til GPS/kjøretid nå?
// source   : 'purchase' | 'trial' | 'web' | 'locked'
// canPurchase: skal "Kjøp"-knappen vises? (kun iOS i Fase 1)
export const getAccessState = () => {
  const trial = getTrialStatus();
  const trialActive = trial.active && !forcePaywallDev(); // ?forcePaywall=1 tvinger locked i dev
  const base = { trial, priceString: _priceString };

  if (isNativeIOS()) {
    if (_purchased) return { ...base, unlocked: true, source: 'purchase', canPurchase: false, native: true };
    if (trialActive) return { ...base, unlocked: true, source: 'trial', canPurchase: true, native: true };
    return { ...base, unlocked: false, source: 'locked', canPurchase: true, native: true };
  }

  // Web/PWA: gating er av som standard (VITE_WEB_PAYWALL_ENABLED) til Vipps er live,
  // så eksisterende web-brukere ikke låses ute. forcePaywall tvinger den på i dev.
  const webGated = webPaywallEnabled() || forcePaywallDev();
  if (!webGated) return { ...base, unlocked: true, source: 'web', canPurchase: false, native: false };
  if (_webPurchased) return { ...base, unlocked: true, source: 'purchase', canPurchase: false, native: false };
  if (trialActive) return { ...base, unlocked: true, source: 'trial', canPurchase: true, native: false };
  return { ...base, unlocked: false, source: 'locked', canPurchase: true, native: false };
};

// ─── RevenueCat (lastes kun på native iOS) ────────────────────────────────────
let _RCMod = null;
let _rcInitError = null; // siste årsak til at RevenueCat ikke ble konfigurert (diagnose)
const loadRC = async () => {
  if (_Purchases) return _Purchases;
  const mod = await import('@revenuecat/purchases-capacitor');
  _RCMod = mod;
  _Purchases = mod.Purchases;
  return _Purchases;
};

export const initPurchases = async () => {
  if (_initialized) return true;
  _initialized = true;
  getFirstLaunch(); // stemple prøvestart ved aller første oppstart

  if (!isNativeIOS()) {
    await _initWebAccess();
    return true;
  }

  try {
    const apiKey = config.REVENUECAT_CONFIG.getIOSKey();
    if (!apiKey) {
      _rcInitError = 'API-nøkkel mangler i bygget (VITE_REVENUECAT_IOS_API_KEY)';
      console.warn('RevenueCat: ' + _rcInitError);
      return false;
    }
    const Purchases = await loadRC();
    // configure er den kritiske stien — kjør den FØRST, med timeout så en
    // eventuell henging ikke etterlater appen ukonfigurert uten grunn.
    await withTimeout(Purchases.configure({ apiKey }), 15000, 'configure');
    _rcConfigured = true;
    _rcInitError = null;
    // Verbose logg til enhets-konsollen (Console.app): fire-and-forget ETTER
    // configure, så den aldri kan blokkere konfigureringen.
    try { Purchases.setLogLevel?.({ level: _RCMod?.LOG_LEVEL?.DEBUG ?? 'DEBUG' }); } catch (_) { /* ignore */ }
    // Best-effort og IKKE ventet på: henting av rettighet og pris er ikke
    // nødvendig for å kjøpe, og må aldri kunne blokkere kjøpet. (Dette var
    // årsaken til evig «Behandler…» uten feilmelding i bygg 17.)
    refreshEntitlement().catch(() => {});
    loadPrice().catch(() => {});
    notify();
    return true;
  } catch (e) {
    _rcInitError = e?.rcTimeout
      ? 'configure svarte ikke (tidsavbrudd) — native RevenueCat-kall hang'
      : ('configure feilet: ' + (e?.code ? e.code + ' — ' : '') + (e?.message || String(e)));
    console.warn('initPurchases feilet:', e);
    return false;
  }
};

export const refreshEntitlement = async () => {
  if (!_rcConfigured) return _purchased;
  try {
    const Purchases = await loadRC();
    const { customerInfo } = await withTimeout(Purchases.getCustomerInfo(), 12000, 'getCustomerInfo');
    _purchased = !!customerInfo?.entitlements?.active?.[entitlementId()];
    notify();
    return _purchased;
  } catch (e) {
    console.warn('refreshEntitlement feilet:', e);
    return _purchased;
  }
};

const loadPrice = async () => {
  if (!_rcConfigured) return;
  try {
    const Purchases = await loadRC();
    const offerings = await withTimeout(Purchases.getOfferings(), 12000, 'getOfferings(pris)');
    const pkg = pickProPackage(offerings);
    _priceString = pkg?.product?.priceString || null;
  } catch (_) { /* pris hentes best-effort */ }
};

export const purchasePro = async () => {
  if (!isNativeIOS()) return { success: false, reason: 'not_native' };
  try {
    if (!_rcConfigured) {
      _initialized = false; // tving et nytt konfigurasjonsforsøk ved selve kjøpet
      await initPurchases();
    }
    if (!_rcConfigured) {
      return { success: false, reason: 'not_configured', detail: _rcInitError || 'RevenueCat ble ikke konfigurert (ukjent årsak)' };
    }
    const Purchases = await loadRC();

    // 1) Hent produkter (kan henge hvis StoreKit ikke svarer → timeout).
    let offerings;
    try {
      offerings = await withTimeout(Purchases.getOfferings(), 12000, 'getOfferings');
    } catch (e) {
      return {
        success: false, reason: 'error',
        detail: e?.rcTimeout ? 'Tidsavbrudd ved henting av produkter (getOfferings svarte ikke)' : ('getOfferings: ' + (e?.message || e)),
      };
    }

    // 2) Finn Pro-pakken. Ved feil, ta med diagnose om hva offeringen inneholdt.
    const pkg = pickProPackage(offerings);
    if (!pkg) {
      const cur = offerings?.current;
      const allKeys = Object.keys(offerings?.all || {});
      const curPkgs = (cur?.availablePackages || []).map(p => p?.product?.identifier);
      return {
        success: false, reason: 'no_offering',
        detail: `Fant ingen pakke. current=${cur?.identifier || 'null'}, offerings=[${allKeys.join(',')}], pakker=[${curPkgs.join(',') || 'ingen'}]`,
      };
    }

    // 3) Kjøp (åpner Apple-betalingsruten). Timeout fanger «henger uten popup».
    let customerInfo;
    try {
      ({ customerInfo } = await withTimeout(Purchases.purchasePackage({ aPackage: pkg }), 60000, 'purchasePackage'));
    } catch (e) {
      if (e?.code === 'PURCHASE_CANCELLED' || e?.userCancelled) {
        return { success: false, reason: 'cancelled' };
      }
      return {
        success: false, reason: 'error',
        detail: e?.rcTimeout
          ? 'Betalingsvinduet åpnet seg aldri (tidsavbrudd i purchasePackage) — StoreKit svarte ikke'
          : ('Kjøp feilet: ' + (e?.code ? e.code + ' — ' : '') + (e?.message || e)),
      };
    }

    _purchased = !!customerInfo?.entitlements?.active?.[entitlementId()];
    notify();
    return { success: _purchased };
  } catch (e) {
    console.warn('purchasePro feilet:', e);
    return { success: false, reason: 'error', detail: e?.message || String(e) };
  }
};

export const restorePro = async () => {
  if (!isNativeIOS()) return { success: false, reason: 'not_native' };
  try {
    if (!_rcConfigured) await initPurchases();
    const Purchases = await loadRC();
    const { customerInfo } = await withTimeout(Purchases.restorePurchases(), 30000, 'restorePurchases');
    _purchased = !!customerInfo?.entitlements?.active?.[entitlementId()];
    notify();
    return { success: _purchased };
  } catch (e) {
    console.warn('restorePro feilet:', e);
    return {
      success: false, reason: 'error',
      detail: e?.rcTimeout ? 'Tidsavbrudd i restorePurchases — RevenueCat svarte ikke' : (e?.message || String(e)),
    };
  }
};

// ─── Konto-identitet (Fase 3) ─────────────────────────────────────────────────
// Kobler en innlogget bruker-ID til RevenueCat, så kjøp følger kontoen på tvers
// av enheter/plattformer. Anonym som standard (ingen innlogging kreves).
let _appUserId = null;

export const setAppUserId = async (userId) => {
  _appUserId = userId || null;
  if (!userId) return;
  if (isNativeIOS() && _rcConfigured) {
    try {
      const Purchases = await loadRC();
      await Purchases.logIn({ appUserID: userId });
      await refreshEntitlement();
    } catch (e) { console.warn('RevenueCat logIn feilet:', e); }
  }
  // Web: RevenueCat-identifisering + grant fra Vipps-kjøp kobles på i Fase 3 steg 3.
  notify();
};

export const clearAppUser = async () => {
  _appUserId = null;
  if (isNativeIOS() && _rcConfigured) {
    try {
      const Purchases = await loadRC();
      await Purchases.logOut();
      await refreshEntitlement();
    } catch (e) { console.warn('RevenueCat logOut feilet:', e); }
  }
  notify();
};

// ─── Bakoverkompatible eksporter (brukes av LiveMode/WebPaywall) ──────────────
export const isPremiumActive = async () => getAccessState().unlocked;
export const hasLiveModeAccess = async () => getAccessState().unlocked;
export const getCustomerInfo = async () => ({});
export const getOfferings = async () => null;
export const canMakePayments = async () => ({ canMakePayments: isNativeIOS() });
export const purchasePackageById = async () => purchasePro();
export const restorePurchases = async () => restorePro();
export const restorePurchasesIOS = async () => restorePro();
