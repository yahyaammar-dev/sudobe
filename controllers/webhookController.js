const admin = require('../middleware/firebase')

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

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


