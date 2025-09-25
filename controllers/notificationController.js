require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const admin = require('../middleware/firebase');



exports.storeToken = async (req, res) => {
    try {
        const { accountId } = req.params; // Get accountId from URL
        const { fcm_token, lang } = req.body;

        if (!accountId || !fcm_token) {
            return res.status(400).json({
                success: false,
                message: 'Missing accountId or fcm_token'
            });
        }

        // Build content object dynamically
        const contentToUpdate = {
            fcm_token: fcm_token
        };

        if (lang) {
            contentToUpdate.lang = lang;
        }

        // Update the account directly (no need to fetch first)
        await swell.put(`/accounts/${accountId}`, {
            content: contentToUpdate
        });

        return res.status(200).json({
            success: true,
            message: 'FCM token and language stored successfully'
        });

    } catch (err) {
        console.error('Error storing FCM token/lang:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to store token/lang',
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
