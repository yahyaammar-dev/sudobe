const express = require('express');
const router = express.Router();
const path = require('path');
require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const { requirePermission, PERMISSIONS } = require('../middleware/permissions');
const ActivityLogger = require('../services/activityLogger');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

// Serve the orders HTML page
function serveOrdersPage(req, res) {
  res.sendFile(path.join(__dirname, '..', 'public', 'orders.html'));
}

// API Routes for orders management
// Get all orders
router.get('/api', requirePermission(PERMISSIONS.VIEW_ORDERS), async (req, res) => {
  try {
    const { page = 1, limit = 50, search, status } = req.query;
    
    const queryParams = {
      page: parseInt(page),
      limit: parseInt(limit),
      expand: ['account', 'items.product']
    };

    if (search) {
      queryParams.search = search;
    }

    if (status) {
      queryParams.where = { status };
    }

    const orders = await swell.get('/orders', queryParams);
    
    res.json({
      success: true,
      data: orders.results || [],
      pagination: {
        page: orders.page || parseInt(page),
        limit: parseInt(limit),
        count: orders.count || 0,
        pages: orders.pages || {}
      }
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch orders',
      error: error.message
    });
  }
});

// Get a single order
router.get('/api/:id', requirePermission(PERMISSIONS.VIEW_ORDERS), async (req, res) => {
  try {
    const { id } = req.params;
    const order = await swell.get(`/orders/${id}`, {
      expand: ['account', 'items.product']
    });
    res.json({
      success: true,
      data: order
    });
  } catch (error) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch order',
      error: error.message
    });
  }
});

// Create a new order
router.post('/api', upload.fields([
  { name: 'shipping_qutation', maxCount: 1 },
  { name: 'dhl_invoice', maxCount: 1 },
  { name: 'inspection_report', maxCount: 1 },
  { name: 'invoice_by_factory', maxCount: 1 },
  { name: 'shipping_policy', maxCount: 1 },
  { name: 'other_documents', maxCount: 20 }
]), requirePermission(PERMISSIONS.CREATE_ORDER), async (req, res) => {
  try {
    // Parse JSON strings from FormData
    const items = req.body.items ? (typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items) : null;
    const billing = req.body.billing ? (typeof req.body.billing === 'string' ? JSON.parse(req.body.billing) : req.body.billing) : null;
    const shipping = req.body.shipping ? (typeof req.body.shipping === 'string' ? JSON.parse(req.body.shipping) : req.body.shipping) : null;
    
    const { 
      account_id, 
      coupon_code,
      order_status,
      factory_dispatch,
      date_of_shipping,
      delivery_date,
      transfer_id,
      date_of_payment,
      production_duration,
      shipping_company_name
    } = req.body;
    
    if (!account_id) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one item is required'
      });
    }

    const orderData = {
      account_id,
      items: items.map(item => ({
        product_id: item.product_id,
        quantity: parseInt(item.quantity) || 1
      })),
      content: {}
    };

    if (billing && Object.keys(billing).length > 0) {
      orderData.billing = billing;
    }
    if (shipping && Object.keys(shipping).length > 0) {
      orderData.shipping = shipping;
    }
    // Only include coupon_code if it's provided and not empty
    if (coupon_code && coupon_code.trim() !== '') {
      orderData.coupon_code = coupon_code.trim();
    }
    
    // Handle content fields
    if (order_status !== undefined) orderData.content.order_status = order_status;
    if (factory_dispatch !== undefined) orderData.content.factory_dispatch = factory_dispatch;
    if (date_of_shipping !== undefined && date_of_shipping !== '') orderData.content.date_of_shipping = date_of_shipping;
    if (delivery_date !== undefined && delivery_date !== '') orderData.content.delivery_date = delivery_date;
    if (transfer_id !== undefined) orderData.content.transfer_id = transfer_id;
    if (date_of_payment !== undefined && date_of_payment !== '') orderData.content.date_of_payment = date_of_payment;
    if (production_duration !== undefined) orderData.content.production_duration = production_duration;
    if (shipping_company_name !== undefined && shipping_company_name !== '') orderData.content.shipping_company_name = shipping_company_name;
    
    // Handle file uploads
    const handleFileUpload = async (fileField, contentField) => {
      if (req.files && req.files[fileField] && req.files[fileField][0]) {
        const file = req.files[fileField][0];
        try {
          const uploadedFile = await swell.post('/:files', {
            filename: file.originalname,
            content_type: file.mimetype,
            data: {
              $base64: file.buffer.toString('base64')
            }
          });
          orderData.content[contentField] = {
            id: uploadedFile.id,
            filename: uploadedFile.filename,
            url: uploadedFile.url,
            originalFilename: file.originalname,
            extension: file.originalname.split('.').pop(),
            mimeType: file.mimetype,
            date_uploaded: new Date().toISOString()
          };
        } catch (uploadError) {
          console.error(`Error uploading ${fileField}:`, uploadError);
        }
      }
    };
    
    await handleFileUpload('shipping_qutation', 'shipping_qutation');
    await handleFileUpload('dhl_invoice', 'dhl_invoice');
    await handleFileUpload('inspection_report', 'inspection_report');
    await handleFileUpload('invoice_by_factory', 'invoice_by_factory');
    await handleFileUpload('shipping_policy', 'shipping_policy');
    
    // Handle other_documents (multiple files)
    if (req.files && req.files.other_documents && req.files.other_documents.length > 0) {
      const otherDocuments = [];
      for (const file of req.files.other_documents) {
        try {
          const uploadedFile = await swell.post('/:files', {
            filename: file.originalname,
            content_type: file.mimetype,
            data: {
              $base64: file.buffer.toString('base64')
            }
          });
          otherDocuments.push({
            id: uploadedFile.id,
            filename: uploadedFile.filename,
            url: uploadedFile.url,
            originalFilename: file.originalname,
            extension: file.originalname.split('.').pop(),
            mimeType: file.mimetype,
            date_uploaded: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Error uploading other_document ${file.originalname}:`, uploadError);
        }
      }
      if (otherDocuments.length > 0) {
        orderData.content.other_documents = otherDocuments;
      }
    }

    const created = await swell.post('/orders', orderData);
    
    // Log the activity
    ActivityLogger.logOrderCreated(
      req.user?.id,
      req.user?.email,
      created.id,
      created,
      req
    );
    
    // Check if Swell returned validation errors
    if (created.errors && Object.keys(created.errors).length > 0) {
      const errorMessages = Object.entries(created.errors)
        .map(([field, error]) => `${field}: ${error.message || error}`)
        .join(', ');
      
      return res.status(400).json({
        success: false,
        message: `Order created but with validation errors: ${errorMessages}`,
        data: created,
        errors: created.errors
      });
    }
    
    res.json({
      success: true,
      message: 'Order created successfully',
      data: created
    });
  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order',
      error: error.message
    });
  }
});

// Update an order
router.put('/api/:id', upload.fields([
  { name: 'shipping_qutation', maxCount: 1 },
  { name: 'dhl_invoice', maxCount: 1 },
  { name: 'inspection_report', maxCount: 1 },
  { name: 'invoice_by_factory', maxCount: 1 },
  { name: 'shipping_policy', maxCount: 1 },
  { name: 'other_documents', maxCount: 20 }
]), requirePermission(PERMISSIONS.EDIT_ORDER), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Parse JSON strings from FormData
    const items = req.body.items ? (typeof req.body.items === 'string' ? JSON.parse(req.body.items) : req.body.items) : undefined;
    const billing = req.body.billing ? (typeof req.body.billing === 'string' ? JSON.parse(req.body.billing) : req.body.billing) : undefined;
    const shipping = req.body.shipping ? (typeof req.body.shipping === 'string' ? JSON.parse(req.body.shipping) : req.body.shipping) : undefined;
    
    const { 
      account_id, 
      coupon_code, 
      status,
      order_status,
      factory_dispatch,
      date_of_shipping,
      delivery_date,
      transfer_id,
      date_of_payment,
      production_duration,
      shipping_company_name
    } = req.body;
    
    // Fetch existing order to preserve content
    const existingOrder = await swell.get(`/orders/${id}`);
    
    const updateData = {
      content: {
        ...(existingOrder?.content || {})
      }
    };
    
    if (account_id !== undefined) updateData.account_id = account_id;
    
    // For items: Since Swell treats existing order items as immutable,
    // we need to replace the entire items array.
    // We'll update items separately if they're being changed.
    // First, handle other fields that can be updated normally
    if (billing !== undefined && Object.keys(billing).length > 0) {
      updateData.billing = billing;
    }
    if (shipping !== undefined && Object.keys(shipping).length > 0) {
      updateData.shipping = shipping;
    }
    // Only include coupon_code if it's provided and not empty
    if (coupon_code !== undefined && coupon_code !== null && coupon_code.trim() !== '') {
      updateData.coupon_code = coupon_code.trim();
    } else if (coupon_code === '') {
      // If empty string is explicitly sent, remove the coupon
      updateData.coupon_code = null;
    }
    if (status !== undefined) updateData.status = status;
    
    // Handle content fields
    if (order_status !== undefined) updateData.content.order_status = order_status;
    if (factory_dispatch !== undefined) updateData.content.factory_dispatch = factory_dispatch;
    if (date_of_shipping !== undefined) updateData.content.date_of_shipping = date_of_shipping || null;
    if (delivery_date !== undefined) updateData.content.delivery_date = delivery_date || null;
    if (transfer_id !== undefined) updateData.content.transfer_id = transfer_id || null;
    if (date_of_payment !== undefined) updateData.content.date_of_payment = date_of_payment || null;
    if (production_duration !== undefined) updateData.content.production_duration = production_duration || null;
    if (shipping_company_name !== undefined) updateData.content.shipping_company_name = shipping_company_name || null;
    
    // Handle file uploads (replace existing if new file is uploaded)
    const handleFileUpload = async (fileField, contentField) => {
      if (req.files && req.files[fileField] && req.files[fileField][0]) {
        const file = req.files[fileField][0];
        try {
          const uploadedFile = await swell.post('/:files', {
            filename: file.originalname,
            content_type: file.mimetype,
            data: {
              $base64: file.buffer.toString('base64')
            }
          });
          updateData.content[contentField] = {
            id: uploadedFile.id,
            filename: uploadedFile.filename,
            url: uploadedFile.url,
            originalFilename: file.originalname,
            extension: file.originalname.split('.').pop(),
            mimeType: file.mimetype,
            date_uploaded: new Date().toISOString()
          };
        } catch (uploadError) {
          console.error(`Error uploading ${fileField}:`, uploadError);
        }
      }
    };
    
    await handleFileUpload('shipping_qutation', 'shipping_qutation');
    await handleFileUpload('dhl_invoice', 'dhl_invoice');
    await handleFileUpload('inspection_report', 'inspection_report');
    await handleFileUpload('invoice_by_factory', 'invoice_by_factory');
    await handleFileUpload('shipping_policy', 'shipping_policy');
    
    // Handle other_documents (multiple files - append to existing)
    if (req.files && req.files.other_documents && req.files.other_documents.length > 0) {
      const existingDocuments = existingOrder?.content?.other_documents || [];
      const newDocuments = [];
      for (const file of req.files.other_documents) {
        try {
          const uploadedFile = await swell.post('/:files', {
            filename: file.originalname,
            content_type: file.mimetype,
            data: {
              $base64: file.buffer.toString('base64')
            }
          });
          newDocuments.push({
            id: uploadedFile.id,
            filename: uploadedFile.filename,
            url: uploadedFile.url,
            originalFilename: file.originalname,
            extension: file.originalname.split('.').pop(),
            mimeType: file.mimetype,
            date_uploaded: new Date().toISOString()
          });
        } catch (uploadError) {
          console.error(`Error uploading other_document ${file.originalname}:`, uploadError);
        }
      }
      if (newDocuments.length > 0) {
        updateData.content.other_documents = [...existingDocuments, ...newDocuments];
      }
    }

    // If there are non-item updates, apply them first
    if (Object.keys(updateData).length > 0) {
      await swell.put(`/orders/${id}`, updateData);
    }

    // Now handle items replacement separately
    // Since items are immutable, we need to use $set to replace the entire array
    if (items !== undefined && Array.isArray(items)) {
      const newItems = items.map(item => ({
        product_id: item.product_id,
        quantity: parseInt(item.quantity) || 1
      }));
      
      // Use $set operator to explicitly replace the entire items array
      const itemsUpdate = {
        $set: {
          items: newItems
        }
      };
      
      await swell.put(`/orders/${id}`, itemsUpdate);
    }
    
    // Fetch the updated order to return
    const updated = await swell.get(`/orders/${id}`, {
      expand: ['account', 'items.product']
    });
    
    // Log the activity
    ActivityLogger.logOrderUpdated(
      req.user?.id,
      req.user?.email,
      id,
      { items, billing, shipping, coupon_code, status },
      req
    );
    
    // Check if Swell returned validation errors
    if (updated.errors && Object.keys(updated.errors).length > 0) {
      const errorMessages = Object.entries(updated.errors)
        .map(([field, error]) => `${field}: ${error.message || error}`)
        .join(', ');
      
      return res.status(400).json({
        success: false,
        message: `Order updated but with validation errors: ${errorMessages}`,
        data: updated,
        errors: updated.errors
      });
    }
    
    res.json({
      success: true,
      message: 'Order updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Error updating order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update order',
      error: error.message
    });
  }
});

// Delete an order
router.delete('/api/:id', requirePermission(PERMISSIONS.DELETE_ORDER), async (req, res) => {
  try {
    const { id } = req.params;
    await swell.delete(`/orders/${id}`);
    
    // Log the activity
    ActivityLogger.logOrderDeleted(
      req.user?.id,
      req.user?.email,
      id,
      req
    );
    
    res.json({
      success: true,
      message: 'Order deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete order',
      error: error.message
    });
  }
});

// Get all accounts for dropdown
router.get('/api/accounts/list', async (req, res) => {
  try {
    const accounts = await swell.get('/accounts', {
      limit: 1000
    });
    res.json({
      success: true,
      data: accounts.results || []
    });
  } catch (error) {
    console.error('Error fetching accounts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch accounts'
    });
  }
});

// Get all products for dropdown
router.get('/api/products/list', async (req, res) => {
  try {
    const productsResponse = await swell.get('/products', {
      limit: 1000
    });
    
    // Handle both array and object response formats from Swell
    let productsList = [];
    if (Array.isArray(productsResponse)) {
      productsList = productsResponse;
    } else if (productsResponse.results && Array.isArray(productsResponse.results)) {
      productsList = productsResponse.results;
    } else if (productsResponse.data && Array.isArray(productsResponse.data)) {
      productsList = productsResponse.data;
    }
    
    console.log(`Loaded ${productsList.length} products for orders dropdown`);
    
    res.json({
      success: true,
      data: productsList
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch products',
      error: error.message
    });
  }
});

// Export both the page handler and the router
module.exports = serveOrdersPage;
module.exports.router = router;
