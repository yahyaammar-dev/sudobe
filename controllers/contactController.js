require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);


/**
 * Stores a user's complaint message in their account content.complain array
 * @param {string} accountId - Swell account ID
 * @param {string} message - The complaint message
 */
exports.submitContactMessage = async (req, res) => {
    try {
        const { accountId } = req.params;
        const { message } = req.body;

        if (!message || message.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Message is required',
            });
        }

        // Fetch the customer account by ID
        const account = await swell.get(`/accounts/${accountId}`);

        if (!account) {
            return res.status(404).json({
                success: false,
                message: 'User not found',
            });
        }

        // Append message to content.complain array
        const existingComplaints = account.content?.complain || [];
        const updatedComplaints = [
            ...existingComplaints,
            {
                message,
                date: new Date().toISOString(),
            },
        ];

        // Update the content field
        await swell.put(`/accounts/${accountId}`, {
            content: {
                ...account.content,
                complain: message,
            },
        });

        return res.status(200).json({
            success: true,
            message: 'Your complaint has been submitted successfully',
        });

    } catch (err) {
        console.error('Failed to submit complaint:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
        });
    }
};
