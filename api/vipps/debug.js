// TEMPORARY diagnostic endpoint — remove after debugging the Vipps go-live.
//
// GET  /api/vipps/debug?reference=<ref>   → full payment object + event log
// POST /api/vipps/debug  { phoneNumber }  → create a PUSH_MESSAGE payment to that
//                                            number (bypasses the web landing page)
//
// No secrets are exposed; only Vipps' own status/event data for one reference.

const crypto = require('crypto');
const {
  baseUrl,
  getAccessToken,
  paymentHeaders,
  safeJson,
  AMOUNT_MINOR,
  CURRENCY,
  handleError,
} = require('../../lib/vipps');

module.exports = async (req, res) => {
  try {
    const token = await getAccessToken();
    const headers = paymentHeaders(token);

    // ── POST action=checkout: create a Vipps Checkout (Hurtigkasse) session ──
    if (req.method === 'POST' && req.body && req.body.action === 'checkout') {
      const reference = `fergetid-pro-${crypto.randomUUID()}`;
      // Checkout uses client_id/client_secret as headers directly (no bearer token).
      const coHeaders = {
        client_id: process.env.VIPPS_CLIENT_ID,
        client_secret: process.env.VIPPS_CLIENT_SECRET,
        'Ocp-Apim-Subscription-Key': process.env.VIPPS_SUBSCRIPTION_KEY,
        'Merchant-Serial-Number': process.env.VIPPS_MSN,
        'Content-Type': 'application/json',
        'Vipps-System-Name': 'fergetid',
        'Vipps-System-Version': '1.0.0',
        'Vipps-System-Plugin-Name': 'fergetid-web',
        'Vipps-System-Plugin-Version': '1.0.0',
      };
      const origin = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;
      const r = await fetch(`${baseUrl()}/checkout/v3/session`, {
        method: 'POST',
        headers: coHeaders,
        body: JSON.stringify({
          merchantInfo: {
            callbackUrl: `${origin}/api/vipps/callback`,
            returnUrl: `${origin}/?vippspay=${reference}`,
            callbackAuthorizationToken: crypto.randomUUID(),
          },
          transaction: {
            amount: { currency: CURRENCY, value: AMOUNT_MINOR },
            reference,
            paymentDescription: 'Fergetid Pro — GPS og kjøretid',
          },
        }),
      });
      const data = await safeJson(r);
      return res.status(200).json({ checkoutStatus: r.status, reference, data });
    }

    // ── POST: create a push payment to a phone number ────────────────────────
    if (req.method === 'POST') {
      let phone = (req.body && req.body.phoneNumber) || '';
      phone = String(phone).replace(/\D/g, ''); // digits only
      if (phone.length === 8) phone = `47${phone}`; // add NO country code if missing
      if (phone.length < 10) return res.status(400).json({ error: 'bad_phone', got: phone });

      const reference = `fergetid-pro-${crypto.randomUUID()}`;
      const r = await fetch(`${baseUrl()}/epayment/v1/payments`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': reference },
        body: JSON.stringify({
          amount: { currency: CURRENCY, value: AMOUNT_MINOR },
          paymentMethod: { type: 'WALLET' },
          customer: { phoneNumber: phone },
          reference,
          userFlow: 'PUSH_MESSAGE',
          paymentDescription: 'Fergetid Pro — testbetaling',
        }),
      });
      const data = await safeJson(r);
      return res.status(200).json({ createStatus: r.status, reference, data });
    }

    // ── GET: inspect a payment + its events ──────────────────────────────────
    const reference = (req.query && req.query.reference) || '';
    if (!reference) return res.status(400).json({ error: 'missing_reference' });
    const ref = encodeURIComponent(reference);

    const [pRes, eRes] = await Promise.all([
      fetch(`${baseUrl()}/epayment/v1/payments/${ref}`, { headers }),
      fetch(`${baseUrl()}/epayment/v1/payments/${ref}/events`, { headers }),
    ]);
    const payment = await safeJson(pRes);
    const events = await safeJson(eRes);

    return res.status(200).json({
      env: process.env.VIPPS_ENV || 'test',
      base: baseUrl(),
      msn: process.env.VIPPS_MSN || null,
      paymentStatus: pRes.status,
      eventsStatus: eRes.status,
      payment,
      events,
    });
  } catch (e) {
    return handleError(res, e);
  }
};
