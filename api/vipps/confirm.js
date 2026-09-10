// POST /api/vipps/confirm  { reference }
// Verifiserer betalingen hos Vipps og fanger (capture) beløpet. Ved suksess
// returneres et signert opplåsings-token som frontend lagrer. Låser ALDRI opp
// uten å ha bekreftet mot Vipps (redirect tilbake er ikke bevis nok).

const {
  baseUrl,
  getAccessToken,
  paymentHeaders,
  safeJson,
  signToken,
  PRODUCT_ID,
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
    const reference = req.body && req.body.reference;
    if (!reference) return res.status(400).json({ error: 'missing_reference' });

    const token = await getAccessToken();
    const headers = paymentHeaders(token);
    const ref = encodeURIComponent(reference);

    // 1. Hent betalingsstatus
    const sres = await fetch(`${baseUrl()}/epayment/v1/payments/${ref}`, { headers });
    const payment = await safeJson(sres);
    if (!sres.ok) {
      return res.status(502).json({ error: 'vipps_status_failed', status: sres.status, detail: payment });
    }

    const agg = payment.aggregate || {};
    const authorized = (agg.authorizedAmount && agg.authorizedAmount.value) || 0;
    const captured = (agg.capturedAmount && agg.capturedAmount.value) || 0;

    const issueToken = () =>
      signToken({ product: PRODUCT_ID, reference, iat: Date.now(), v: 1 });

    // Allerede fanget (f.eks. brukeren laster confirm på nytt) → gi token
    if (captured >= AMOUNT_MINOR) {
      return res.status(200).json({ paid: true, token: issueToken() });
    }

    // Autorisert men ikke fanget → fang beløpet nå
    if (authorized >= AMOUNT_MINOR) {
      const cres = await fetch(`${baseUrl()}/epayment/v1/payments/${ref}/capture`, {
        method: 'POST',
        headers: { ...headers, 'Idempotency-Key': `capture-${reference}` },
        body: JSON.stringify({ modificationAmount: { currency: CURRENCY, value: AMOUNT_MINOR } }),
      });
      const cdata = await safeJson(cres);
      if (!cres.ok) {
        return res.status(502).json({ error: 'vipps_capture_failed', status: cres.status, detail: cdata });
      }
      return res.status(200).json({ paid: true, token: issueToken() });
    }

    // Ikke betalt (avbrutt, utløpt, eller fortsatt underveis)
    return res.status(200).json({ paid: false, state: payment.state || 'UNKNOWN' });
  } catch (e) {
    return handleError(res, e);
  }
};
