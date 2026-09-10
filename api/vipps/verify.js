// POST /api/vipps/verify  { token }
// Verifiserer signaturen på et lagret opplåsings-token. Frontend kaller dette
// ved oppstart for å bekrefte at et token i localStorage er ekte (ikke forfalsket).

const { verifyToken, PRODUCT_ID, handleError } = require('../../lib/vipps');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  try {
    const token = req.body && req.body.token;
    const payload = token ? verifyToken(token) : null;
    if (payload && payload.product === PRODUCT_ID) {
      return res.status(200).json({ valid: true, product: payload.product });
    }
    return res.status(200).json({ valid: false });
  } catch (e) {
    return handleError(res, e);
  }
};
