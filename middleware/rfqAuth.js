require('dotenv').config();

const RFQ_SECRET_KEY = process.env.RFQ_SECRET_KEY;

function rfqAuth(req, res, next) {
  const apiKey = req.headers['x-rfq-api-key'];

  if (!RFQ_SECRET_KEY) {
    console.error('[RFQ AUTH] RFQ_SECRET_KEY is not set in environment variables');
    return res.status(500).json({
      success: false,
      message: 'RFQ integration is not configured on the server'
    });
  }

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      message: 'Missing X-RFQ-Api-Key header'
    });
  }

  if (apiKey !== RFQ_SECRET_KEY) {
    return res.status(403).json({
      success: false,
      message: 'Invalid RFQ API key'
    });
  }

  next();
}

module.exports = rfqAuth;
