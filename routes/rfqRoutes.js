/**
 * RFQ Module Integration Routes
 *
 * These endpoints are called by the Replit RFQ module only.
 * All routes require the X-RFQ-Api-Key header (set RFQ_SECRET_KEY in .env).
 *
 * The RFQ module is read-only for customers/factories/categories.
 * The only write operation is POST /api/rfq/orders/from-rfq which creates
 * a real Swell order from an approved RFQ client offer.
 *
 * Sensitive fields (margins, internal notes, payment details) are stripped
 * before returning any data.
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const rfqAuth = require('../middleware/rfqAuth');
const ActivityLogger = require('../services/activityLogger');

// Apply RFQ API key auth to all routes in this file
router.use(rfqAuth);

// ─── Helpers ────────────────────────────────────────────────────────────────

// Strip any fields the RFQ module should never see
function stripSensitiveCustomerFields(account) {
  if (!account) return null;
  const { content = {}, ...rest } = account;
  const {
    otp,
    otpExpiry,
    otpVerified,
    quotes,
    // internal notes or margin fields can be added here
    ...safeContent
  } = content;
  return { ...rest, content: safeContent };
}

function stripSensitiveFactoryFields(account) {
  if (!account) return null;
  const { content = {}, ...rest } = account;
  const {
    otp,
    otpExpiry,
    otpVerified,
    personal_id,       // private KYC document
    price_sidenote,    // internal margin notes
    certifications,    // internal compliance docs
    ...safeContent
  } = content;
  return { ...rest, content: safeContent };
}

// ─── GET /api/rfq/me ────────────────────────────────────────────────────────
// Validate API key and confirm connectivity (no user context for machine tokens)
router.get('/me', (req, res) => {
  res.json({
    success: true,
    message: 'RFQ API key is valid',
    system: 'Sodu Backend',
    version: '1.0'
  });
});

// ─── GET /api/rfq/customers ─────────────────────────────────────────────────
// Returns list of customers (accounts where factory_name is null)
router.get('/customers', async (req, res) => {
  try {
    const { search, limit = 500 } = req.query;

    const queryParams = {
      where: { 'content.factory_name': null },
      limit: parseInt(limit),
      fields: 'id,email,first_name,last_name,phone,content,date_created'
    };

    if (search) {
      queryParams.search = search;
    }

    const result = await swell.get('/accounts', queryParams);
    const customers = (result.results || []).map(stripSensitiveCustomerFields);

    res.json({
      success: true,
      data: customers,
      count: customers.length
    });
  } catch (error) {
    console.error('[RFQ] Error fetching customers:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customers' });
  }
});

// ─── GET /api/rfq/customers/:id ─────────────────────────────────────────────
router.get('/customers/:id', async (req, res) => {
  try {
    const customer = await swell.get(`/accounts/${req.params.id}`);
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }
    res.json({ success: true, data: stripSensitiveCustomerFields(customer) });
  } catch (error) {
    console.error('[RFQ] Error fetching customer:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch customer' });
  }
});

// ─── GET /api/rfq/factories ─────────────────────────────────────────────────
// Returns list of factories (accounts where factory_name is not null)
// Sensitive docs (personal_id, certifications) are stripped
router.get('/factories', async (req, res) => {
  try {
    const result = await swell.get('/accounts', {
      where: { 'content.factory_name': { $ne: null } },
      limit: 500,
      fields: 'id,email,first_name,name,content,date_created'
    });

    const factories = (result.results || []).map(stripSensitiveFactoryFields);

    res.json({
      success: true,
      data: factories,
      count: factories.length
    });
  } catch (error) {
    console.error('[RFQ] Error fetching factories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch factories' });
  }
});

// ─── GET /api/rfq/factories/:id ─────────────────────────────────────────────
router.get('/factories/:id', async (req, res) => {
  try {
    const factory = await swell.get(`/accounts/${req.params.id}`);
    if (!factory) {
      return res.status(404).json({ success: false, message: 'Factory not found' });
    }
    res.json({ success: true, data: stripSensitiveFactoryFields(factory) });
  } catch (error) {
    console.error('[RFQ] Error fetching factory:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch factory' });
  }
});

// ─── POST /api/rfq/customers ────────────────────────────────────────────────
// Create a new customer account.
// Required: email, first_name, last_name
// Optional: phone, content.company_name, content.country
router.post('/customers', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, content = {} } = req.body;

    const missing = [];
    if (!email)      missing.push('email');
    if (!first_name) missing.push('first_name');
    if (!last_name)  missing.push('last_name');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    // Prevent accidentally creating a factory via this endpoint
    if (content.factory_name) {
      return res.status(400).json({
        success: false,
        message: 'Use POST /api/rfq/factories to create factory accounts'
      });
    }

    const accountData = {
      email,
      first_name,
      last_name,
      ...(phone && { phone }),
      content: {
        company_name: content.company_name || null,
        country:      content.country      || null,
        factory_name: null
      }
    };

    const created = await swell.post('/accounts', accountData);

    if (!created || !created.id) {
      return res.status(500).json({
        success: false,
        message: 'Swell returned no account ID — customer may not have been created'
      });
    }

    await ActivityLogger.log({
      userId: 'rfq_module',
      userEmail: 'rfq@system',
      action: 'create_customer',
      resourceType: 'account',
      resourceId: created.id,
      description: `Customer ${email} created via RFQ module`,
      metadata: { email, first_name, last_name }
    });

    return res.status(201).json({
      success: true,
      data: stripSensitiveCustomerFields(created)
    });
  } catch (error) {
    console.error('[RFQ] Error creating customer:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create customer',
      error: error.message
    });
  }
});

// ─── POST /api/rfq/factories ─────────────────────────────────────────────────
// Create a new factory account.
// Required: name, email, content.factory_name
// Optional: phone, content.country, content.city, content.minimum_quantity,
//           content.lead_time, content.product_categories, content.payment_terms,
//           content.currency, content.website
router.post('/factories', async (req, res) => {
  try {
    const { name, email, phone, content = {} } = req.body;

    const missing = [];
    if (!email)                missing.push('email');
    if (!name)                 missing.push('name');
    if (!content.factory_name) missing.push('content.factory_name');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    const accountData = {
      name,
      email,
      ...(phone && { phone }),
      content: {
        factory_name:        content.factory_name,
        country:             content.country             || null,
        city:                content.city                || null,
        minimum_quantity:    content.minimum_quantity    || null,
        lead_time:           content.lead_time           || null,
        product_categories:  content.product_categories  || null,
        payment_terms:       content.payment_terms       || null,
        currency:            content.currency            || null,
        website:             content.website             || null
      }
    };

    const created = await swell.post('/accounts', accountData);

    if (!created || !created.id) {
      return res.status(500).json({
        success: false,
        message: 'Swell returned no account ID — factory may not have been created'
      });
    }

    await ActivityLogger.log({
      userId: 'rfq_module',
      userEmail: 'rfq@system',
      action: 'create_factory',
      resourceType: 'account',
      resourceId: created.id,
      description: `Factory "${content.factory_name}" (${email}) created via RFQ module`,
      metadata: { email, factory_name: content.factory_name, country: content.country || null }
    });

    return res.status(201).json({
      success: true,
      data: stripSensitiveFactoryFields(created)
    });
  } catch (error) {
    console.error('[RFQ] Error creating factory:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create factory',
      error: error.message
    });
  }
});

// ─── GET /api/rfq/categories ────────────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const result = await swell.get('/categories', {
      limit: 500,
      fields: 'id,name,slug,parent_id,top_id,description,image'
    });
    res.json({
      success: true,
      data: result.results || [],
      count: (result.results || []).length
    });
  } catch (error) {
    console.error('[RFQ] Error fetching categories:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
});

// ─── POST /api/rfq/upload ───────────────────────────────────────────────────
// Upload a file and return its Swell URL (for RFQ attachments)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided' });
    }

    const uploadedFile = await swell.post('/:files', {
      filename: req.file.originalname,
      content_type: req.file.mimetype,
      data: { $base64: req.file.buffer.toString('base64') }
    });

    res.json({
      success: true,
      file: {
        id: uploadedFile.id,
        url: uploadedFile.url,
        filename: uploadedFile.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype
      }
    });
  } catch (error) {
    console.error('[RFQ] Error uploading file:', error);
    res.status(500).json({ success: false, message: 'Failed to upload file' });
  }
});

// ─── POST /api/rfq/orders/from-rfq ──────────────────────────────────────────
// Convert an approved RFQ client offer into a real Swell order.
//
// Required body fields:
//   customerId, rfqId, approvedQuoteId, productName, quantity, unitPrice
//
// Optional but recommended:
//   categoryId, destinationCountry, destinationPort, selectedFactoryId,
//   currency, incoterm, leadTimeDays, paymentTerms, qcRequired,
//   shippingRequired, attachments, notes, productId
//
// The created order records rfqId + approvedQuoteId in content for audit trail.
router.post('/orders/from-rfq', async (req, res) => {
  try {
    const {
      customerId,
      rfqId,
      approvedQuoteId,
      productName,
      categoryId,
      quantity,
      unit,
      destinationCountry,
      destinationPort,
      selectedFactoryId,
      unitPrice,
      currency = 'USD',
      incoterm,
      leadTimeDays,
      paymentTerms,
      qcRequired = false,
      shippingRequired = false,
      attachments = [],
      notes,
      productId // optional: Swell product_id if a catalog product is known
    } = req.body;

    // ── Validation ────────────────────────────────────────────────────────
    const missing = [];
    if (!customerId) missing.push('customerId');
    if (!rfqId) missing.push('rfqId');
    if (!approvedQuoteId) missing.push('approvedQuoteId');
    if (!productName) missing.push('productName');
    if (!quantity) missing.push('quantity');
    if (!unitPrice) missing.push('unitPrice');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`
      });
    }

    // ── Verify customer exists ────────────────────────────────────────────
    const customer = await swell.get(`/accounts/${customerId}`);
    if (!customer || !customer.id) {
      return res.status(404).json({
        success: false,
        message: `Customer with id "${customerId}" not found in Sodu system`
      });
    }

    // Make sure this is a customer and not a factory account
    if (customer.content?.factory_name) {
      return res.status(400).json({
        success: false,
        message: `Account "${customerId}" is a factory, not a customer`
      });
    }

    // ── Optionally verify factory ─────────────────────────────────────────
    if (selectedFactoryId) {
      const factory = await swell.get(`/accounts/${selectedFactoryId}`);
      if (!factory || !factory.content?.factory_name) {
        return res.status(404).json({
          success: false,
          message: `Factory with id "${selectedFactoryId}" not found in Sodu system`
        });
      }
    }

    // ── Resolve product_id ────────────────────────────────────────────────
    // If no productId is provided, try to find a matching product by name.
    // The RFQ order still records all custom details in content regardless.
    let resolvedProductId = productId || null;

    if (!resolvedProductId) {
      try {
        const productSearch = await swell.get('/products', {
          where: { name: productName },
          limit: 1,
          fields: 'id,name'
        });
        if (productSearch.results && productSearch.results.length > 0) {
          resolvedProductId = productSearch.results[0].id;
          console.log(`[RFQ] Matched product by name "${productName}" → id: ${resolvedProductId}`);
        }
      } catch (searchErr) {
        console.warn('[RFQ] Product name search failed (non-fatal):', searchErr.message);
      }
    }

    // ── Build order data ──────────────────────────────────────────────────
    const totalPrice = parseFloat(unitPrice) * parseInt(quantity);

    const orderData = {
      account_id: customerId,
      content: {
        // RFQ audit fields — always present
        rfq_id: rfqId,
        approved_quote_id: approvedQuoteId,
        source: 'rfq_module',

        // Order details from the approved quote
        order_status: 'order_placed',
        product_name: productName,
        category_id: categoryId || null,
        quantity: parseInt(quantity),
        unit: unit || null,
        unit_price: parseFloat(unitPrice),
        total_price: totalPrice,
        currency: currency,
        incoterm: incoterm || null,
        lead_time_days: leadTimeDays ? parseInt(leadTimeDays) : null,
        payment_terms: paymentTerms || null,
        destination_country: destinationCountry || null,
        destination_port: destinationPort || null,
        selected_factory_id: selectedFactoryId || null,
        qc_required: qcRequired,
        shipping_required: shippingRequired,
        notes: notes || null,
        rfq_attachments: Array.isArray(attachments) ? attachments : [],
        rfq_created_at: new Date().toISOString()
      }
    };

    // Attach items array only if we have a product reference
    if (resolvedProductId) {
      orderData.items = [
        {
          product_id: resolvedProductId,
          quantity: parseInt(quantity)
        }
      ];
    }

    // ── Create order in Swell ─────────────────────────────────────────────
    const createdOrder = await swell.post('/orders', orderData);

    if (!createdOrder || !createdOrder.id) {
      return res.status(500).json({
        success: false,
        message: 'Swell returned no order ID — order may not have been created'
      });
    }

    // ── Audit log ─────────────────────────────────────────────────────────
    await ActivityLogger.log({
      userId: 'rfq_module',
      userEmail: 'rfq@system',
      action: 'create_order_from_rfq',
      resourceType: 'order',
      resourceId: createdOrder.id,
      description: `Order created from RFQ ${rfqId} (quote ${approvedQuoteId}) for customer ${customerId}`,
      metadata: {
        rfq_id: rfqId,
        approved_quote_id: approvedQuoteId,
        customer_id: customerId,
        selected_factory_id: selectedFactoryId || null,
        product_name: productName,
        quantity,
        unit_price: unitPrice,
        total_price: totalPrice,
        currency
      }
    });

    // ── Respond ───────────────────────────────────────────────────────────
    const APP_BASE_URL = process.env.APP_BASE_URL || 'https://app.gosodu.com';

    return res.status(201).json({
      success: true,
      orderId: createdOrder.id,
      orderNumber: createdOrder.number || createdOrder.id,
      status: 'Created',
      trackingUrl: `${APP_BASE_URL}/orders`,
      rfqId,
      approvedQuoteId,
      customerId,
      warnings: !resolvedProductId
        ? ['No matching Swell product found for this product name. Order was created without a product item — please attach the product manually from the admin panel.']
        : []
    });
  } catch (error) {
    console.error('[RFQ] Error creating order from RFQ:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create order from RFQ',
      error: error.message
    });
  }
});

// ─── GET /api/rfq/orders/:id ────────────────────────────────────────────────
// Fetch an order by ID (for the RFQ module to confirm order was created)
router.get('/orders/:id', async (req, res) => {
  try {
    const order = await swell.get(`/orders/${req.params.id}`, {
      expand: ['account', 'items.product']
    });

    if (!order || !order.id) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const APP_BASE_URL = process.env.APP_BASE_URL || 'https://app.gosodu.com';

    // Only return fields the RFQ module needs — no pricing margins or internal ops
    res.json({
      success: true,
      data: {
        id: order.id,
        number: order.number,
        status: order.content?.order_status || order.status || 'order_placed',
        rfq_id: order.content?.rfq_id,
        approved_quote_id: order.content?.approved_quote_id,
        customer_id: order.account_id,
        product_name: order.content?.product_name,
        quantity: order.content?.quantity,
        currency: order.content?.currency,
        destination_country: order.content?.destination_country,
        date_created: order.date_created,
        trackingUrl: `${APP_BASE_URL}/orders`
      }
    });
  } catch (error) {
    console.error('[RFQ] Error fetching order:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch order' });
  }
});

module.exports = router;
