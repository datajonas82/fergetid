// TEMPORARY diagnostic endpoint — remove after debugging the Vipps go-live.
// GET /api/vipps/debug?reference=<ref>
// Returns the full Vipps payment object + its event log, so we can see why a
// payment session errors at the Vipps gateway. No secrets are exposed; only
// Vipps' own status/event data for one reference.

const { baseUrl, getAccessToken, paymentHeaders, safeJson, handleError } = require('../../lib/vipps');

module.exports = async (req, res) => {
  try {
    const reference = (req.query && req.query.reference) || '';
    if (!reference) return res.status(400).json({ error: 'missing_reference' });

    const token = await getAccessToken();
    const headers = paymentHeaders(token);
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
