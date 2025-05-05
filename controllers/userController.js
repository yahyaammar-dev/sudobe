const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const {swell} = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);



/**
 * Sends an OTP to a user's WhatsApp number
 * @param {string} toPhoneNumber - in the format 'whatsapp:+10234567890'
 */
exports.sendOtpViaWhatsApp = async (req, res) => {
    try {
        const { toPhoneNumber } = req.body;

        // Find customer account by phone number
        const result = await swell.get('/accounts', {
            where: { phone: toPhoneNumber }
        });

        if (result.count === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const customer = result.results[0];
        const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP

        // Send OTP via WhatsApp
        const message = await client.messages.create({
            from: process.env.TWILIO_WHATSAPP_FROM,
            to: `whatsapp:${toPhoneNumber}`,
            body: `Your OTP is: ${otp}`
        });

        // Store OTP in the customer's content
        await swell.put(`/accounts/${customer.id}`, {
            content: {
                ...customer.content,
                otp: otp
            }
        });

        return res.status(200).json({
            status: true,
            sid: message.sid
        });

    } catch (err) {
        console.error('Failed to send WhatsApp message:', err.message);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};





/**
 * Verifies the OTP entered by the user
 * @param {string} toPhoneNumber - phone number to verify (e.g. '+1234567890')
 * @param {string|number} otp - the 4-digit OTP user entered
 */
exports.verifyOtp = async (req, res) => {
    try {
        const { toPhoneNumber, otp } = req.body;

        // Get account by phone number
        const result = await swell.get('/accounts', {
            where: { phone: toPhoneNumber }
        });

        if (result.count === 0) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        const customer = result.results[0];
        const storedOtp = customer.content?.otp;

        if (!storedOtp) {
            return res.status(400).json({
                success: false,
                message: 'No OTP found. Please request a new one.'
            });
        }

        if (parseInt(otp) !== parseInt(storedOtp)) {
            return res.status(401).json({
                success: false,
                message: 'Invalid OTP'
            });
        }

        // Optionally clear OTP after successful verification
        await swell.put(`/accounts/${customer.id}`, {
            content: {
                ...customer.content,
                otp: null,
                verified: true
            }
        });

        return res.status(200).json({
            success: true,
            message: 'OTP verified successfully'
        });

    } catch (err) {
        console.error('OTP verification error:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error'
        });
    }
};
