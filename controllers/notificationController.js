require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

const admin = require('firebase-admin');
const serviceAccount = require('./path/to/your-firebase-adminsdk.json'); // path to your service account file


admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});



exports.storeToken = async (req, res) => {
    try {
        const { accountId } = req.params; // Get accountId from URL
        const { fcm_token } = req.body;

        if (!accountId || !fcm_token) {
            return res.status(400).json({
                success: false,
                message: 'Missing accountId or fcm_token'
            });
        }

        // Update the account directly (no need to fetch first)
        await swell.put(`/accounts/${accountId}`, {
            fcm_token: fcm_token // Update FCM token directly
        });

        return res.status(200).json({
            success: true,
            message: 'FCM token stored successfully'
        });

    } catch (err) {
        console.error('Error storing FCM token:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to store token',
            error: err.message
        });
    }
};




exports.sendNotification = async (req, res) => {
    try {
        const { fcm_token, title, body } = req.body;

        if (!fcm_token || !title || !body) {
            return res.status(400).json({ success: false, message: 'Missing fields' });
        }

        const message = {
            token: fcm_token,
            notification: {
                title: title,
                body: body
            },
            android: {
                priority: "high"
            },
            apns: {
                headers: {
                    "apns-priority": "10"
                },
                payload: {
                    aps: {
                        sound: "default"
                    }
                }
            }
        };

        const response = await admin.messaging().send(message);

        return res.status(200).json({
            success: true,
            message: 'Notification sent',
            response
        });

    } catch (error) {
        console.error('Error sending notification:', error.message);
        return res.status(500).json({ success: false, message: 'Failed to send notification' });
    }
};
