const { swell } = require('swell-node');
require('dotenv').config();
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

/**
 * Activity Logger Service
 * Logs all user actions for audit trail
 */

/**
 * Create an activity log entry
 * @param {Object} logData - Log data
 * @param {string} logData.userId - User ID who performed the action
 * @param {string} logData.userEmail - User email
 * @param {string} logData.action - Action performed (e.g., 'create_order')
 * @param {string} logData.resourceType - Type of resource (e.g., 'order', 'customer')
 * @param {string} logData.resourceId - ID of the resource
 * @param {string} logData.description - Human-readable description
 * @param {Object} logData.metadata - Additional metadata
 * @param {Object} logData.req - Express request object (for IP and user agent)
 */
async function logActivity(logData) {
  try {
    const {
      userId,
      userEmail,
      action,
      resourceType,
      resourceId,
      description,
      metadata = {},
      req
    } = logData;

    if (!userId || !action || !resourceType) {
      console.error('Missing required log fields:', { userId, action, resourceType });
      return;
    }

    // Extract IP address and user agent from request if provided
    const ipAddress = req?.ip || req?.connection?.remoteAddress || req?.headers?.['x-forwarded-for']?.split(',')[0] || 'unknown';
    const userAgent = req?.headers?.['user-agent'] || 'unknown';

    const logEntry = {
      active: true,
      content: {
        user_id: userId,
        user_email: userEmail || '',
        action: action,
        resource_type: resourceType,
        resource_id: resourceId || '',
        description: description || '',
        metadata: metadata,
        ip_address: ipAddress,
        user_agent: userAgent,
        date_created: new Date().toISOString()
      }
    };
    
    console.log('[ACTIVITY LOGGER] Storing log entry in Swell:', JSON.stringify(logEntry, null, 2));
    
    // Store log in Swell content model using specific endpoint format
    // Try the specific endpoint first (preferred method, matches pattern used elsewhere)
    try {
      const created = await swell.post('/content/activity-logs', logEntry);
      console.log('[ACTIVITY LOGGER] ✓ Successfully stored log entry:', created?.id || 'no ID returned');
    } catch (endpointError) {
      console.log('[ACTIVITY LOGGER] /content/activity-logs endpoint failed, trying fallback method');
      console.log('[ACTIVITY LOGGER] Error details:', endpointError.message);
      if (endpointError.response) {
        console.log('[ACTIVITY LOGGER] Error response:', endpointError.response.data);
      }
      
      // Fallback: try using /content with type parameter
      try {
        const created = await swell.post('/content', {
          type: 'activity-logs',
          ...logEntry
        });
        console.log('[ACTIVITY LOGGER] ✓ Successfully stored log entry (fallback method):', created?.id || 'no ID returned');
      } catch (fallbackError) {
        // Both methods failed - throw to be caught by outer catch block
        console.error('[ACTIVITY LOGGER] Both storage methods failed');
        console.error('[ACTIVITY LOGGER] Endpoint error:', endpointError.message);
        console.error('[ACTIVITY LOGGER] Fallback error:', fallbackError.message);
        throw new Error(`Failed to store activity log. Endpoint error: ${endpointError.message}, Fallback error: ${fallbackError.message}`);
      }
    }
  } catch (error) {
    // Don't throw error - logging should never break the main flow
    console.error('Error logging activity:', error);
  }
}

/**
 * Helper function to log common actions
 */
const ActivityLogger = {
  // Order actions
  logOrderCreated: async (userId, userEmail, orderId, orderData, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'create_order',
      resourceType: 'order',
      resourceId: orderId,
      description: `Created order #${orderData.number || orderId}`,
      metadata: { orderData },
      req
    });
  },

  logOrderUpdated: async (userId, userEmail, orderId, changes, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'edit_order',
      resourceType: 'order',
      resourceId: orderId,
      description: `Updated order ${orderId}`,
      metadata: { changes },
      req
    });
  },

  logOrderDeleted: async (userId, userEmail, orderId, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'delete_order',
      resourceType: 'order',
      resourceId: orderId,
      description: `Deleted order ${orderId}`,
      req
    });
  },

  // Customer actions
  logCustomerCreated: async (userId, userEmail, customerId, customerData, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'create_customer',
      resourceType: 'customer',
      resourceId: customerId,
      description: `Created customer ${customerData.email || customerId}`,
      metadata: { customerData: { email: customerData.email, name: customerData.name } },
      req
    });
  },

  logCustomerUpdated: async (userId, userEmail, customerId, changes, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'edit_customer',
      resourceType: 'customer',
      resourceId: customerId,
      description: `Updated customer ${customerId}`,
      metadata: { changes },
      req
    });
  },

  logCustomerDeleted: async (userId, userEmail, customerId, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'delete_customer',
      resourceType: 'customer',
      resourceId: customerId,
      description: `Deleted customer ${customerId}`,
      req
    });
  },

  // Factory actions
  logFactoryCreated: async (userId, userEmail, factoryId, factoryData, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'create_factory',
      resourceType: 'factory',
      resourceId: factoryId,
      description: `Created factory ${factoryData.content?.factory_name || factoryId}`,
      metadata: { factoryData },
      req
    });
  },

  logFactoryUpdated: async (userId, userEmail, factoryId, changes, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'edit_factory',
      resourceType: 'factory',
      resourceId: factoryId,
      description: `Updated factory ${factoryId}`,
      metadata: { changes },
      req
    });
  },

  logFactoryDeleted: async (userId, userEmail, factoryId, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'delete_factory',
      resourceType: 'factory',
      resourceId: factoryId,
      description: `Deleted factory ${factoryId}`,
      req
    });
  },

  // Shipping rate actions
  logShippingRateCreated: async (userId, userEmail, rateId, rateData, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'create_shipping_rate',
      resourceType: 'shipping_rate',
      resourceId: rateId,
      description: `Created shipping rate for ${rateData.country_name || rateId}`,
      metadata: { rateData },
      req
    });
  },

  logShippingRateUpdated: async (userId, userEmail, rateId, changes, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'edit_shipping_rate',
      resourceType: 'shipping_rate',
      resourceId: rateId,
      description: `Updated shipping rate ${rateId}`,
      metadata: { changes },
      req
    });
  },

  logShippingRateDeleted: async (userId, userEmail, rateId, req) => {
    await logActivity({
      userId,
      userEmail,
      action: 'delete_shipping_rate',
      resourceType: 'shipping_rate',
      resourceId: rateId,
      description: `Deleted shipping rate ${rateId}`,
      req
    });
  },

  // Generic log function
  log: logActivity
};

module.exports = ActivityLogger;

