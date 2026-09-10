// Delt hjelper for Vipps ePayment-integrasjonen (Fase 2 — betaling på web).
// Kalles fra serverless-funksjonene i /api/vipps/*. Ingen hemmeligheter her —
// alt leses fra miljøvariabler (settes i Vercel):
//   VIPPS_CLIENT_ID, VIPPS_CLIENT_SECRET, VIPPS_SUBSCRIPTION_KEY, VIPPS_MSN,
//   VIPPS_UNLOCK_SECRET (signering av opplåsings-token), VIPPS_ENV (test|prod),
//   PUBLIC_BASE_URL (valgfri, f.eks. https://fergetid.app — ellers utledes fra request).

const crypto = require('crypto');

const PRODUCT_ID = 'com.fergetid.app.pro';
const AMOUNT_MINOR = 4900; // 49,00 kr i øre (Vipps bruker minste enhet)
const CURRENCY = 'NOK';

class VippsError extends Error {
  constructor(kind, status, detail) {
    super(typeof detail === 'string' ? detail : `${kind} (${status})`);
    this.kind = kind;      // 'config' | 'accesstoken' | 'api'
    this.status = status;  // HTTP-status fra Vipps, eller 0 for config
    this.detail = detail;
  }
}

function need(name) {
  const v = process.env[name];
  if (!v) throw new VippsError('config', 0, `Mangler miljøvariabel: ${name}`);
  return v;
}

// Testmiljø som standard; prod bare når VIPPS_ENV=prod.
function baseUrl() {
  return process.env.VIPPS_ENV === 'prod'
    ? 'https://api.vipps.no'
    : 'https://apitest.vipps.no';
}

async function safeJson(res) {
  try { return await res.json(); } catch { return {}; }
}

// Hent OAuth-token som må ligge på alle ePayment-kall.
async function getAccessToken() {
  const res = await fetch(`${baseUrl()}/accesstoken/get`, {
    method: 'POST',
    headers: {
      client_id: need('VIPPS_CLIENT_ID'),
      client_secret: need('VIPPS_CLIENT_SECRET'),
      'Ocp-Apim-Subscription-Key': need('VIPPS_SUBSCRIPTION_KEY'),
    },
  });
  if (!res.ok) throw new VippsError('accesstoken', res.status, await safeJson(res));
  const data = await res.json();
  return data.access_token;
}

// Fellesheadere for ePayment-kall (Vipps krever system-headerne for sporing).
function paymentHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Ocp-Apim-Subscription-Key': need('VIPPS_SUBSCRIPTION_KEY'),
    'Merchant-Serial-Number': need('VIPPS_MSN'),
    'Content-Type': 'application/json',
    'Vipps-System-Name': 'fergetid',
    'Vipps-System-Version': '1.0.0',
    'Vipps-System-Plugin-Name': 'fergetid-web',
    'Vipps-System-Plugin-Version': '1.0.0',
  };
}

// ─── Opplåsings-token (stateless bevis på betaling, ingen database) ────────────
// Kompakt HMAC-signert token (JWT-lignende). Frontend lagrer det etter kjøp og
// lar backend verifisere signaturen (frontend har ikke hemmeligheten → kan ikke
// forfalske).

const b64url = (input) => Buffer.from(input).toString('base64url');

function signToken(payload) {
  const secret = need('VIPPS_UNLOCK_SECRET');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyToken(token) {
  try {
    const secret = need('VIPPS_UNLOCK_SECRET');
    const [header, body, sig] = String(token).split('.');
    if (!header || !body || !sig) return null;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${header}.${body}`)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Felles feilhåndtering for endepunktene.
function handleError(res, e) {
  if (e instanceof VippsError && e.kind === 'config') {
    // Miljøvariabler ikke satt ennå (f.eks. før Vipps-nøklene er lagt i Vercel).
    return res.status(503).json({ error: 'not_configured', message: e.message });
  }
  console.error('Vipps error:', e);
  return res.status(500).json({ error: 'server_error', message: String((e && e.message) || e) });
}

module.exports = {
  PRODUCT_ID,
  AMOUNT_MINOR,
  CURRENCY,
  VippsError,
  baseUrl,
  getAccessToken,
  paymentHeaders,
  safeJson,
  signToken,
  verifyToken,
  handleError,
};
