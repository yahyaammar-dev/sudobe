const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

router.post('/send-notification', webhookController.sendNotifications);
router.post('/create-order-estimate-arrival-time', webhookController.createOrderEstimateArrivalTime);
router.post('/check-container-tracking', webhookController.checkContainerTracking);

// Swell webhook: product.updated
// Configure in Swell dashboard → Settings → Webhooks → product.updated → POST /webhook/product-price-updated
router.post('/product-price-updated', async (req, res) => {
  try {
    // Swell wraps the payload: { type: 'product.updated', data: { ...product } }
    const product = req.body?.data || req.body;

    // Validate we have a product with an id and price
    if (!product || !product.id || product.price === undefined) {
      console.error('Invalid webhook payload:', JSON.stringify(req.body));
      return res.status(400).json({ success: false, message: 'Invalid payload' });
    }

    const newPrice = parseFloat(product.price) || 0;
    const lastKnownPrice = parseFloat(product.content?.last_known_price);

    // If last_known_price is not set yet, initialise it and stamp price_last_updated now
    if (isNaN(lastKnownPrice)) {
      await swell.put(`/products/${product.id}`, {
        content: {
          ...(product.content || {}),
          last_known_price: newPrice,
          price_last_updated: new Date().toISOString()
        }
      });
      return res.json({ success: true, action: 'initialised' });
    }

    // Compare rounded to 4 decimal places to handle 4.50 === 4.5 etc.
    if (Math.round(newPrice * 10000) !== Math.round(lastKnownPrice * 10000)) {
      await swell.put(`/products/${product.id}`, {
        content: {
          ...(product.content || {}),
          price_last_updated: new Date().toISOString(),
          last_known_price: newPrice
        }
      });
      return res.json({ success: true, action: 'price_updated', old: lastKnownPrice, new: newPrice });
    }

    // Price unchanged — nothing to do
    res.json({ success: true, action: 'no_change' });
  } catch (error) {
    console.error('Error handling product-price-updated webhook:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router;

