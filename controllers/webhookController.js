const admin = require('../middleware/firebase')

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const { calculateShippingRatesAndArrivalDate, parseContainerTracking } = require('./checkoutController');
const ActivityLogger = require('../services/activityLogger');
const axios = require('axios');

function formatStatus(status) {
  if (!status) return '';
  return status
    .replace(/_/g, ' ')                  // replace underscores with spaces
    .toLowerCase()                       // ensure consistent casing
    .replace(/\b\w/g, char => char.toUpperCase()); // capitalize each word
}


/**
 * Swell webhook handler that sends WhatsApp message via Twilio
 */
exports.sendNotifications = async (req, res) => {
  try {
    console.log("🔔 Webhook called");

    const { data } = req.body;
    const orderStatus = data?.content?.order_status;
    const orderId = data?.id

    const order = await swell.get(`/orders/${orderId}`);
    console.log("Order is", order)
    console.log("Order is", order.accountId)

    const user = await swell.get(`/accounts/${order.account_id}`);
    console.log("user is", user)

    console.log("phone: ", user.phone)

    if (!orderStatus) {
      return res.status(400).json({
        success: false,
        message: 'Missing order_status in webhook data',
      });
    }
    const formattedStatus = formatStatus(orderStatus);
    const toPhoneNumber = `${user.phone}`;


    // send notificaitons on mobile 
    if (user?.content?.fcm_token) {
      async function sendPushNotification(expoPushToken) {
        const message = {
          to: expoPushToken,
          sound: 'default',
          title: 'Order Update 📦',
          body: `Your order status is: ${formattedStatus}`,
          data: { orderId: orderId.toString() },
        };

        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        });

        console.log('✅ Expo notification sent');
      }

      sendPushNotification(user.content.fcm_token);
    }


    // 2. Send WhatsApp message
    const waMessage = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: `whatsapp:${toPhoneNumber}`,
      contentSid: 'HX11b1bdffb45db6d99db97612ff6da6c7',
      contentVariables: JSON.stringify({ "1": user?.content?.factory_name, "2": orderId, "3": formattedStatus.toString()  }),
    });

    // 3. Wait for a few seconds and check status
    await new Promise(resolve => setTimeout(resolve, 4000)); // 4-second delay
    const statusCheck = await client.messages(waMessage.sid).fetch();

    // 4. If WhatsApp failed or undelivered, send SMS instead
    if (["failed", "undelivered"].includes(statusCheck.status)) {
      await client.messages.create({
        body: `${formattedStatus.toString()}. Order Status has been updated!`,
        from: '+17276155600',
        to: `+${toPhoneNumber}`
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Webhook handled and WhatsApp message sent'
    });

  } catch (err) {
    console.error('❌ Error handling webhook:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};

/**
 * Webhook handler for calculating and storing estimated arrival date when order is created
 * This webhook should be called by Swell when an order is created
 * Endpoint: /webhook/create-order-estimate-arrival-time
 */
exports.createOrderEstimateArrivalTime = async (req, res) => {
  try {
    console.log("🔔 Create Order Estimate Arrival Time Webhook called");
    
    const { data } = req.body;
    const orderId = data?.id;
    
    if (!orderId) {
      return res.status(400).json({
        success: false,
        message: 'Missing order ID in webhook data',
      });
    }
    
    // Fetch the order
    const order = await swell.get(`/orders/${orderId}`);
    
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }
    
    // Check if estimated_arrival_date is already set
    if (order.content?.estimated_arrival_date) {
      console.log(`Order ${orderId} already has estimated_arrival_date: ${order.content.estimated_arrival_date}`);
      return res.status(200).json({
        success: true,
        message: 'Order already has estimated arrival date',
        estimated_arrival_date: order.content.estimated_arrival_date
      });
    }
    
    // Calculate shipping rates and estimated arrival date
    const shippingData = await calculateShippingRatesAndArrivalDate(order, orderId, req);
    
    if (shippingData && shippingData.estimatedArrivalDate) {
      // Update the order with estimated_arrival_date in content
      const updatedOrder = await swell.put(`/orders/${orderId}`, {
        content: {
          ...order.content,
          estimated_arrival_date: shippingData.estimatedArrivalDate
        }
      });
      
      // Log the activity
      await ActivityLogger.log({
        userId: 'system',
        userEmail: 'system',
        action: 'calculate_estimated_arrival_date',
        resourceType: 'order',
        resourceId: orderId,
        description: `Calculated and stored estimated arrival date ${shippingData.estimatedArrivalDate} for order ${orderId}`,
        metadata: {
          estimated_arrival_date: shippingData.estimatedArrivalDate,
          countryCode: shippingData.countryCode,
          phoneNumber: shippingData.phoneNumber,
          minDays: shippingData.minDays,
          maxDays: shippingData.maxDays,
          averageDays: shippingData.averageDays
        },
        req
      });
      
      console.log(`✅ Estimated arrival date calculated and stored for order ${orderId}: ${shippingData.estimatedArrivalDate}`);
      
      // Initialize container tracking if container number is available
      const containerNumber = order.content?.container_number || order.content?.bl_number;
      if (containerNumber) {
        await exports.initializeContainerTracking(
          orderId,
          containerNumber,
          order.content?.sealine || 'auto',
          order.content?.container_type || null
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Estimated arrival date calculated and stored successfully',
        estimated_arrival_date: shippingData.estimatedArrivalDate,
        order: updatedOrder
      });
    } else {
      console.log(`⚠️ Could not calculate estimated arrival date for order ${orderId} - no shipping rates found`);
      
      // Still try to initialize container tracking if container number exists
      const containerNumber = order.content?.container_number || order.content?.bl_number;
      if (containerNumber) {
        await exports.initializeContainerTracking(
          orderId,
          containerNumber,
          order.content?.sealine || 'auto',
          order.content?.container_type || null
        );
      }
      
      return res.status(200).json({
        success: true,
        message: 'Could not calculate estimated arrival date - no shipping rates found for customer country',
        estimated_arrival_date: null
      });
    }
    
  } catch (err) {
    console.error('❌ Error handling create order estimate arrival time webhook:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: err.message
    });
  }
};

/**
 * Get container tracking data with caching to avoid rate limits
 * Cache expires after 6 hours
 */
async function getContainerTracking(containerNumber, sealine = 'auto', type = null) {
  try {
    const apiKey = 'K-6BC266A9-006C-4F86-A839-2336C25DC3BA';
    const trackingApiBaseUrl = 'https://tracking.searates.com';

    const queryParams = {
      api_key: apiKey,
      number: containerNumber,
      sealine: sealine,
      force_update: false, // Use cache when possible
      route: true,
      ais: true
    };

    if (type && ['CT', 'BL', 'BK'].includes(type.toUpperCase())) {
      queryParams.type = type.toUpperCase();
    }

    const trackingResponse = await axios.get(`${trackingApiBaseUrl}/tracking`, {
      params: queryParams,
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    if (!trackingResponse.data || trackingResponse.data.status !== 'success') {
      return null;
    }

    return parseContainerTracking(trackingResponse.data);
  } catch (error) {
    console.error(`[TRACKING] Error fetching tracking for ${containerNumber}:`, error.message);
    return null;
  }
}

/**
 * Send container tracking notification to user
 */
async function sendContainerTrackingNotification(user, orderId, trackingData) {
  try {
    const container = trackingData.containers?.[0];
    if (!container) return;

    const currentLocation = container.currentLocation?.name || 'Unknown Location';
    const country = container.currentLocation?.country || '';
    const daysUntilArrival = container.daysUntilArrival || 0;
    const estimatedArrival = container.estimatedArrival || 'TBD';
    const statusMessage = container.statusMessage || 'In transit';

    // Format message
    const message = `📦 Container Update for Order ${orderId}\n\n` +
      `📍 Current Location: ${currentLocation}, ${country}\n` +
      `🚢 Status: ${statusMessage}\n` +
      `📅 Estimated Arrival: ${estimatedArrival}\n` +
      `⏱️ Days Until Arrival: ${daysUntilArrival} days`;

    const toPhoneNumber = `${user.phone}`;

    // Send push notification
    if (user?.content?.fcm_token) {
      try {
        await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Accept-encoding': 'gzip, deflate',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            to: user.content.fcm_token,
            sound: 'default',
            title: 'Container Location Update 📦',
            body: `${currentLocation}, ${country} - ${daysUntilArrival} days until arrival`,
            data: { orderId: orderId.toString(), type: 'container_tracking' },
          }),
        });
        console.log('✅ Push notification sent for container tracking');
      } catch (err) {
        console.error('Error sending push notification:', err.message);
      }
    }

    // Send WhatsApp message
    try {
      const waMessage = await client.messages.create({
        from: process.env.TWILIO_WHATSAPP_FROM,
        to: `whatsapp:${toPhoneNumber}`,
        body: message
      });

      // Wait and check status
      await new Promise(resolve => setTimeout(resolve, 4000));
      const statusCheck = await client.messages(waMessage.sid).fetch();

      // If WhatsApp failed, send SMS
      if (["failed", "undelivered"].includes(statusCheck.status)) {
        await client.messages.create({
          body: message,
          from: '+17276155600',
          to: `+${toPhoneNumber}`
        });
      }

      console.log(`✅ Container tracking notification sent for order ${orderId}`);
    } catch (err) {
      console.error('Error sending WhatsApp/SMS:', err.message);
      // Fallback to SMS
      try {
        await client.messages.create({
          body: message,
          from: '+17276155600',
          to: `+${toPhoneNumber}`
        });
      } catch (smsErr) {
        console.error('Error sending SMS fallback:', smsErr.message);
      }
    }
  } catch (err) {
    console.error('Error sending container tracking notification:', err.message);
  }
}

/**
 * Check if container has reached destination
 */
function hasReachedDestination(trackingData) {
  if (!trackingData || !trackingData.containers?.[0]) return false;
  
  const container = trackingData.containers[0];
  const status = container.status?.toUpperCase();
  
  // Check if status indicates delivery
  if (status === 'DELIVERED' || status === 'ARRIVED' || status === 'COMPLETED') {
    return true;
  }
  
  // Check if current location matches destination
  const destination = trackingData.summary?.destination?.name;
  const currentLocation = container.currentLocation?.name;
  
  if (destination && currentLocation && 
      destination.toLowerCase() === currentLocation.toLowerCase()) {
    return true;
  }
  
  // Check if days until arrival is 0 or negative
  if (container.daysUntilArrival !== null && container.daysUntilArrival <= 0) {
    return true;
  }
  
  return false;
}

/**
 * Check and send container tracking notifications for an order
 * Returns true if notification was sent, false otherwise
 */
async function checkAndSendContainerTrackingNotification(orderId) {
  try {
    const order = await swell.get(`/orders/${orderId}`);
    
    if (!order) {
      console.log(`Order ${orderId} not found`);
      return false;
    }

    // Get container number from order
    const containerNumber = order.content?.container_number || order.content?.bl_number;
    if (!containerNumber) {
      console.log(`Order ${orderId} has no container number`);
      return false;
    }

    // Check if tracking notifications are enabled
    const trackingEnabled = order.content?.container_tracking_enabled !== false;
    if (!trackingEnabled) {
      return false;
    }

    // Check if order is already delivered/completed
    if (order.content?.container_delivered === true) {
      return false;
    }

    const now = new Date();
    const lastNotificationDate = order.content?.last_tracking_notification_date 
      ? new Date(order.content.last_tracking_notification_date) 
      : null;
    
    const lastTrackingUpdate = order.content?.last_tracking_update
      ? new Date(order.content.last_tracking_update)
      : null;

    // Check if we need to fetch new tracking data (cache expires after 6 hours)
    const cacheExpired = !lastTrackingUpdate || 
      (now - lastTrackingUpdate) > (6 * 60 * 60 * 1000); // 6 hours

    let trackingData = null;
    
    if (cacheExpired || !order.content?.cached_tracking_data) {
      // Fetch fresh tracking data
      console.log(`[TRACKING] Fetching fresh tracking data for order ${orderId}`);
      trackingData = await getContainerTracking(
        containerNumber,
        order.content?.sealine || 'auto',
        order.content?.container_type || null
      );

      if (trackingData) {
        // Cache the tracking data
        await swell.put(`/orders/${orderId}`, {
          content: {
            ...order.content,
            last_tracking_update: now.toISOString(),
            cached_tracking_data: JSON.stringify(trackingData)
          }
        });
      } else {
        // Use cached data if available
        if (order.content?.cached_tracking_data) {
          try {
            trackingData = JSON.parse(order.content.cached_tracking_data);
            console.log(`[TRACKING] Using cached tracking data for order ${orderId}`);
          } catch (err) {
            console.error(`[TRACKING] Error parsing cached data:`, err.message);
            return false;
          }
        } else {
          return false;
        }
      }
    } else {
      // Use cached data
      try {
        trackingData = JSON.parse(order.content.cached_tracking_data);
        console.log(`[TRACKING] Using cached tracking data for order ${orderId}`);
      } catch (err) {
        console.error(`[TRACKING] Error parsing cached data:`, err.message);
        return false;
      }
    }

    if (!trackingData) {
      return false;
    }

    // Check if container has reached destination
    if (hasReachedDestination(trackingData)) {
      // Mark as delivered and send final notification
      const user = await swell.get(`/accounts/${order.account_id}`);
      if (user) {
        await sendContainerTrackingNotification(user, orderId, trackingData);
        
        await swell.put(`/orders/${orderId}`, {
          content: {
            ...order.content,
            container_delivered: true,
            container_delivered_at: now.toISOString(),
            last_tracking_notification_date: now.toISOString()
          }
        });

        console.log(`✅ Container reached destination for order ${orderId}`);
        return true;
      }
      return false;
    }

    // Check if 5 days have passed since last notification
    const daysSinceLastNotification = lastNotificationDate
      ? Math.floor((now - lastNotificationDate) / (1000 * 60 * 60 * 24))
      : Infinity;

    if (daysSinceLastNotification >= 5) {
      // Send notification
      const user = await swell.get(`/accounts/${order.account_id}`);
      if (user) {
        await sendContainerTrackingNotification(user, orderId, trackingData);
        
        await swell.put(`/orders/${orderId}`, {
          content: {
            ...order.content,
            last_tracking_notification_date: now.toISOString()
          }
        });

        console.log(`✅ Container tracking notification sent for order ${orderId}`);
        return true;
      }
    }

    return false;
  } catch (err) {
    console.error(`[TRACKING] Error checking order ${orderId}:`, err.message);
    return false;
  }
}

/**
 * Scheduled job endpoint to check all orders for container tracking notifications
 * This should be called by a cron job every day
 * Endpoint: /webhook/check-container-tracking
 */
exports.checkContainerTracking = async (req, res) => {
  try {
    console.log("🔔 Container Tracking Check Job Started");

    // Get all orders that might need tracking
    // Only check orders created in the last 90 days and not yet delivered
    const orders = await swell.get('/orders', {
      limit: 1000,
      where: {
        date_created: { $gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString() }
      }
    });

    if (!orders.results || orders.results.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'No orders to check',
        checked: 0
      });
    }

    let notificationsSent = 0;
    let errors = 0;

    // Process orders in batches to avoid overwhelming the API
    for (const order of orders.results) {
      try {
        // Skip if no container number
        if (!order.content?.container_number && !order.content?.bl_number) {
          continue;
        }

        // Skip if already delivered
        if (order.content?.container_delivered === true) {
          continue;
        }

        const sent = await checkAndSendContainerTrackingNotification(order.id);
        if (sent) {
          notificationsSent++;
        }

        // Add small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second between orders
      } catch (err) {
        console.error(`Error processing order ${order.id}:`, err.message);
        errors++;
      }
    }

    console.log(`✅ Container tracking check completed. Notifications sent: ${notificationsSent}, Errors: ${errors}`);

    return res.status(200).json({
      success: true,
      message: 'Container tracking check completed',
      checked: orders.results.length,
      notificationsSent,
      errors
    });

  } catch (err) {
    console.error('❌ Error in container tracking check job:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error',
      error: err.message
    });
  }
};

/**
 * Initialize container tracking for an order when it's created
 * This should be called from the createOrderEstimateArrivalTime webhook
 */
exports.initializeContainerTracking = async (orderId, containerNumber, sealine = 'auto', type = null) => {
  try {
    const order = await swell.get(`/orders/${orderId}`);
    
    if (!order) {
      console.log(`Order ${orderId} not found`);
      return false;
    }

    // Store container tracking info
    await swell.put(`/orders/${orderId}`, {
      content: {
        ...order.content,
        container_number: containerNumber,
        container_tracking_enabled: true,
        sealine: sealine,
        container_type: type,
        container_tracking_initialized_at: new Date().toISOString()
      }
    });

    console.log(`✅ Container tracking initialized for order ${orderId}`);
    return true;
  } catch (err) {
    console.error(`Error initializing container tracking for order ${orderId}:`, err.message);
    return false;
  }
};
