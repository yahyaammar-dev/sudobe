const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const ActivityLogger = require('../services/activityLogger');

/**
 * Validate phone number format
 * - Must be numeric only (no + sign, no spaces, no dashes)
 * - Must be at least 10 digits (minimum for country code + phone)
 * - Maximum 15 digits (international standard)
 * @param {string} phone - Phone number to validate
 * @returns {object} - { valid: boolean, error: string }
 */
function validatePhoneNumber(phone) {
  if (!phone || phone.trim() === '') {
    return { valid: true, error: null }; // Phone is optional
  }

  // Remove any whitespace
  const cleanedPhone = phone.trim();

  // Check if contains + sign
  if (cleanedPhone.includes('+')) {
    return {
      valid: false,
      error: 'Phone number cannot contain "+" sign. Enter phone number with country code (no + sign). Example: 201234567890 (Egypt: 20 + phone number)'
    };
  }

  // Check if contains only digits
  if (!/^\d+$/.test(cleanedPhone)) {
    return {
      valid: false,
      error: 'Phone number must contain only digits (no spaces, dashes, or special characters). Example: 201234567890'
    };
  }

  // Check minimum length (at least 10 digits for country code + phone)
  if (cleanedPhone.length < 10) {
    return {
      valid: false,
      error: 'Phone number must be at least 10 digits long (including country code). Example: 201234567890 (Egypt: 20 + phone number)'
    };
  }

  // Check maximum length (international standard is 15 digits)
  if (cleanedPhone.length > 15) {
    return {
      valid: false,
      error: 'Phone number cannot exceed 15 digits'
    };
  }

  return { valid: true, error: null };
}

// Serve the customers HTML page
function serveCustomersPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'customers.html'));
}

// API Routes for customers management
// Get all customers
router.get('/api', async (req, res) => {
  try {
    const customers = await swell.get('/accounts', {
      where: {
        'content.factory_name': null
      },
      limit: 1000
    });

    const baseCustomers = customers.results || [];

    // For each customer, fetch their most recent order to determine last_order_at
    const customersWithLastOrder = await Promise.all(
      baseCustomers.map(async (customer) => {
        try {
          const orders = await swell.get('/orders', {
            where: { account_id: customer.id },
            limit: 1,
            page: 1
            // Rely on Swell's default ordering (typically newest first)
          });

          const lastOrder = orders.results && orders.results.length > 0
            ? orders.results[0]
            : null;

          return {
            ...customer,
            last_order_at: lastOrder ? lastOrder.date_created : null
          };
        } catch (orderError) {
          console.error(`Error fetching last order for customer ${customer.id}:`, orderError.message);
          return {
            ...customer,
            last_order_at: null
          };
        }
      })
    );

    res.json({
      success: true,
      data: customersWithLastOrder
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customers'
    });
  }
});

// Get a single customer
router.get('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await swell.get(`/accounts/${id}`);
    res.json({
      success: true,
      data: customer
    });
  } catch (error) {
    console.error('Error fetching customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch customer'
    });
  }
});

// Create a new customer
router.post('/api', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, password, verified, vetted } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Validate phone number if provided
    if (phone) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.error
        });
      }
      // Clean phone number (remove any whitespace)
      var cleanedPhone = phone.trim();
    }

    const customerData = {
      email: email,
      first_name: first_name || '',
      last_name: last_name || '',
      phone: cleanedPhone || '',
      password: password || ''
    };

    // Handle content fields (verified and vetted)
    if (verified !== undefined || vetted !== undefined) {
      customerData.content = {};
      if (verified !== undefined) {
        customerData.content.verified = verified === true || verified === 'true';
      }
      if (vetted !== undefined) {
        customerData.content.vetted = vetted === true || vetted === 'true';
      }
    }

    const created = await swell.post('/accounts', customerData);
    
    // Log the activity
    ActivityLogger.logCustomerCreated(
      req.user?.id,
      req.user?.email,
      created.id,
      created,
      req
    );
    
    res.json({
      success: true,
      message: 'Customer created successfully',
      data: created
    });
  } catch (error) {
    console.error('Error creating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: error.message
    });
  }
});

// Update a customer
router.put('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { first_name, last_name, email, phone, password, verified, vetted } = req.body;
    
    const updateData = {};
    if (email !== undefined) updateData.email = email;
    if (first_name !== undefined) updateData.first_name = first_name;
    if (last_name !== undefined) updateData.last_name = last_name;
    
    // Validate phone number if provided
    if (phone !== undefined) {
      const phoneValidation = validatePhoneNumber(phone);
      if (!phoneValidation.valid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.error
        });
      }
      // Clean phone number (remove any whitespace)
      updateData.phone = phone.trim();
    }
    
    if (password !== undefined && password !== '') updateData.password = password;

    // Handle content fields (verified and vetted)
    if (verified !== undefined || vetted !== undefined) {
      // Get existing customer to preserve other content fields
      const existingCustomer = await swell.get(`/accounts/${id}`);
      updateData.content = {
        ...(existingCustomer?.content || {}),
      };
      
      if (verified !== undefined) {
        updateData.content.verified = verified === true || verified === 'true';
      }
      if (vetted !== undefined) {
        updateData.content.vetted = vetted === true || vetted === 'true';
      }
    }

    const updated = await swell.put(`/accounts/${id}`, updateData);
    
    // Log the activity
    ActivityLogger.logCustomerUpdated(
      req.user?.id,
      req.user?.email,
      id,
      { first_name, last_name, email, phone, verified, vetted },
      req
    );
    
    res.json({
      success: true,
      message: 'Customer updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update customer',
      error: error.message
    });
  }
});

// Delete a customer
router.delete('/api/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`/accounts/${id}`);
    
    // Log the activity
    ActivityLogger.logCustomerDeleted(
      req.user?.id,
      req.user?.email,
      id,
      req
    );
    
    res.json({
      success: true,
      message: 'Customer deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting customer:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete customer',
      error: error.message
    });
  }
});

// Address management routes
const accountsController = require('../controllers/accountsController');

// Get addresses for a customer (accountId parameter maps to customer id)
router.get('/api/:accountId/addresses', accountsController.getAddressesByAccountId);

// Create address for a customer
router.post('/api/addresses', accountsController.createAddress);

// Update address
router.put('/api/addresses/:addressId', accountsController.updateAddress);

// Delete address
router.delete('/api/addresses/:addressId', accountsController.deleteAddress);

// Export both the page handler and the router
module.exports = serveCustomersPage;
module.exports.router = router;

