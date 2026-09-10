// POST /api/vipps/create
// Starter et Vipps ePayment på 49 kr og returnerer { reference, redirectUrl }.
// Frontend sender brukeren til redirectUrl; Vipps sender dem tilbake til
// PUBLIC_BASE_URL/?vippspay=<reference> når betalingen er gjort.

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
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    // Unik referanse (Vipps krever 8–50 tegn, a-z A-Z 0-9 - _).
    const reference = `fergetid-pro-${crypto.randomUUID()}`;

    const origin = process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`;
    const returnUrl = `${origin}/?vippspay=${encodeURIComponent(reference)}`;

    const token = await getAccessToken();

    const r = await fetch(`${baseUrl()}/epayment/v1/payments`, {
      method: 'POST',
      headers: { ...paymentHeaders(token), 'Idempotency-Key': reference },
      body: JSON.stringify({
        amount: { currency: CURRENCY, value: AMOUNT_MINOR },
        paymentMethod: { type: 'WALLET' },
        reference,
        userFlow: 'WEB_REDIRECT',
        returnUrl,
        paymentDescription: 'Fergetid Pro — GPS og kjøretid',
      }),
    });

    const data = await safeJson(r);
    if (!r.ok) {
      return res.status(502).json({ error: 'vipps_create_failed', status: r.status, detail: data });
    }

    return res.status(200).json({ reference, redirectUrl: data.redirectUrl });
  } catch (e) {
    return handleError(res, e);
  }
};
