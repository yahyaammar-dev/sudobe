const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const ActivityLogger = require('../services/activityLogger');

// Serve the shipping rates HTML page
function serveShippingRatesPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'shipping-rates.html'));
}

// API Routes for shipping rates management
// Get all shipping rates
router.get('/api', async (req, res) => {
  try {
    const rates = await swell.get('/content/shipping-rates', {
      limit: 1000
    });
    res.json({
      success: true,
      data: rates.results || []
    });
  } catch (error) {
    console.error('Error fetching shipping rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shipping rates'
    });
  }
});

// Get a single shipping rate
router.get('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rate = await swell.get(`/content/shipping-rates/${id}`);
    res.json({
      success: true,
      data: rate
    });
  } catch (error) {
    console.error('Error fetching shipping rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shipping rate'
    });
  }
});

// Create a new shipping rate
router.post('/api', async (req, res) => {
  try {
    const { country_name, min_rate, max_rate, shipping_rates } = req.body;
    
    const rateData = {
      active: true,
      content: {
        country_name: country_name || '',
        min_rate: min_rate || '',
        max_rate: max_rate || ''
      }
    };
    
    // Add shipping_rates object if provided
    if (shipping_rates && (shipping_rates.min_days !== undefined || shipping_rates.max_days !== undefined)) {
      rateData.content.shipping_rates = {};
      if (shipping_rates.min_days !== undefined && shipping_rates.min_days !== null && shipping_rates.min_days !== '') {
        rateData.content.shipping_rates.min_days = parseInt(shipping_rates.min_days);
      }
      if (shipping_rates.max_days !== undefined && shipping_rates.max_days !== null && shipping_rates.max_days !== '') {
        rateData.content.shipping_rates.max_days = parseInt(shipping_rates.max_days);
      }
    }

    const created = await swell.post('/content/shipping-rates', rateData);
    
    // Log the activity
    ActivityLogger.logShippingRateCreated(
      req.user?.id,
      req.user?.email,
      created.id,
      created,
      req
    );
    
    res.json({
      success: true,
      message: 'Shipping rate created successfully',
      data: created
    });
  } catch (error) {
    console.error('Error creating shipping rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create shipping rate'
    });
  }
});

// Update a shipping rate
router.put('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { country_name, min_rate, max_rate, shipping_rates } = req.body;
    
    const updateData = {
      active: true,
      content: {
        country_name: country_name || '',
        min_rate: min_rate || '',
        max_rate: max_rate || ''
      }
    };
    
    // Handle shipping_rates
    if (shipping_rates !== undefined) {
      // If shipping_rates is explicitly provided (even if empty object), process it
      updateData.content.shipping_rates = {};
      
      if (shipping_rates.min_days !== undefined && shipping_rates.min_days !== null && shipping_rates.min_days !== '') {
        updateData.content.shipping_rates.min_days = parseInt(shipping_rates.min_days);
      }
      if (shipping_rates.max_days !== undefined && shipping_rates.max_days !== null && shipping_rates.max_days !== '') {
        updateData.content.shipping_rates.max_days = parseInt(shipping_rates.max_days);
      }
      
      // If shipping_rates object is empty after processing, remove it
      if (Object.keys(updateData.content.shipping_rates).length === 0) {
        delete updateData.content.shipping_rates;
      }
    } else {
      // If shipping_rates is not provided, preserve existing one
      try {
        const existingRate = await swell.get(`/content/shipping-rates/${id}`);
        if (existingRate?.content?.shipping_rates) {
          updateData.content.shipping_rates = { ...existingRate.content.shipping_rates };
        }
      } catch (error) {
        // If we can't fetch existing rate, just continue without preserving shipping_rates
        console.warn('Could not fetch existing rate to preserve shipping_rates:', error.message);
      }
    }

    const updated = await swell.put(`/content/shipping-rates/${id}`, updateData);
    
    // Log the activity
    ActivityLogger.logShippingRateUpdated(
      req.user?.id,
      req.user?.email,
      id,
      { country_name, min_rate, max_rate, shipping_rates },
      req
    );
    
    res.json({
      success: true,
      message: 'Shipping rate updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating shipping rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update shipping rate'
    });
  }
});

// Delete a shipping rate
router.delete('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`/content/shipping-rates/${id}`);
    
    // Log the activity
    ActivityLogger.logShippingRateDeleted(
      req.user?.id,
      req.user?.email,
      id,
      req
    );
    
    res.json({
      success: true,
      message: 'Shipping rate deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting shipping rate:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete shipping rate'
    });
  }
});

// Public API: Get all shipping rates (no authentication required)
async function getPublicShippingRates(req, res) {
  try {
    const rates = await swell.get('/content/shipping-rates', {
      limit: 1000
    });
    res.json({
      success: true,
      data: rates.results || []
    });
  } catch (error) {
    console.error('Error fetching shipping rates:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch shipping rates'
    });
  }
}

// Export both the page handler and the router
module.exports = serveShippingRatesPage;
module.exports.router = router;
module.exports.getPublicShippingRates = getPublicShippingRates;

