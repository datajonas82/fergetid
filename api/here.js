// HERE-proxy: holder HERE-nøkkelen server-side så den ikke ligger i frontend-bundelen.
// Frontend sender { op, params } — backend bygger selve HERE-URL-en med nøkkelen
// (klienten kan aldri sende en vilkårlig URL, kun de tre støttede operasjonene).
//
// Env (Vercel, IKKE VITE_-prefiks så den ikke havner i bundelen):
//   HERE_API_KEY
//
// Kalles fra web (same-origin), iOS (Capacitor, cross-origin → CORS) og lokal dev.

const HERE_ROUTING = 'https://router.hereapi.com/v8/routes';
const HERE_REVGEOCODE = 'https://revgeocode.search.hereapi.com/v1/revgeocode';
const HERE_MATCH = 'https://routematching.hereapi.com/v8/match/routelinks';

const setCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const num = (v) => typeof v === 'number' && Number.isFinite(v);

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const key = process.env.HERE_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured', message: 'HERE_API_KEY mangler' });

  const { op, params } = req.body || {};

  try {
    if (op === 'route') {
      const { fromLat, fromLng, toLat, toLng, roadOnly, returnGeometry } = params || {};
      if (![fromLat, fromLng, toLat, toLng].every(num)) return res.status(400).json({ error: 'bad_params' });
      const ret = returnGeometry ? 'summary,geometry' : 'summary';
      const avoid = roadOnly ? '&avoid[features]=ferry' : '';
      const url = `${HERE_ROUTING}?origin=${fromLat},${fromLng}&destination=${toLat},${toLng}`
        + `&transportMode=car&routingMode=fast&return=${ret}${avoid}&apiKey=${key}`;
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      return res.status(r.ok ? 200 : 502).json(data);
    }

    if (op === 'revgeocode') {
      const { lat, lng } = params || {};
      if (![lat, lng].every(num)) return res.status(400).json({ error: 'bad_params' });
      const url = `${HERE_REVGEOCODE}?at=${lat},${lng}&apikey=${key}&lang=no`;
      const r = await fetch(url);
      const data = await r.json().catch(() => ({}));
      return res.status(r.ok ? 200 : 502).json(data);
    }

    if (op === 'matchroute') {
      const csvTrace = params?.csvTrace;
      if (typeof csvTrace !== 'string' || !csvTrace.trim()) return res.status(400).json({ error: 'bad_params' });
      const url = `${HERE_MATCH}?routeMatch=1&mode=fastest;car;traffic:disabled&apikey=${key}&alignToGpsTime=0`;
      const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: csvTrace });
      if (r.status === 429) return res.status(429).json({ error: 'rate_limited' });
      const data = await r.json().catch(() => ({}));
      return res.status(r.ok ? 200 : 502).json(data);
    }

    return res.status(400).json({ error: 'unknown_op' });
  } catch (e) {
    console.error('HERE proxy error:', e);
    return res.status(500).json({ error: 'server_error' });
  }
};
