const admin = require('firebase-admin');
const serviceAccount = require('../sodu-fb06f-firebase-adminsdk-fbsvc-33cc3bdbba.json'); // adjust path

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

/**
 * Swell webhook handler that sends WhatsApp message via Twilio
 */
exports.sendNotifications = async (req, res) => {
  try {
    console.log("🔔 Webhook called");
    console.log("📝 Body:", JSON.stringify(req.body, null, 2));

    const { data } = req.body;
    const orderStatus = data?.content?.order_status;

    if (!orderStatus) {
      return res.status(400).json({
        success: false,
        message: 'Missing order_status in webhook data',
      });
    }

    // Define the recipient (replace with actual logic or mapping)
    const toPhoneNumber = 'whatsapp:+923274509327'; // ✅ Replace with dynamic logic if needed

    // Send WhatsApp message
    const message = await client.messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to: toPhoneNumber,
      body: `Order status updated: ${orderStatus}`,
    });

    console.log("✅ WhatsApp message sent:", message.sid);



    // send notificaitons on mobile 

    // await admin.messaging().sendToDevice(fcmToken, {
    //   notification: {
    //     title: "Order Update",
    //     body: "Your order status is: payment_required"
    //   }, 
    //   data: {
    //     orderId: "abc123"
    //   }
    // });




    return res.status(201).json({
      success: true,
      message: 'Webhook handled and WhatsApp message sent',
      sid: message.sid,
    });

  } catch (err) {
    console.error('❌ Error handling webhook:', err.message);
    return res.status(500).json({
      success: false,
      message: 'Internal Server Error'
    });
  }
};
