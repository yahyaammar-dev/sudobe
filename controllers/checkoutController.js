const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

exports.updateOrderStatus = async (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!orderId || !status) {
        return res.status(400).json({
            success: false,
            message: 'Missing order ID or status',
        });
    }

    try {
        // Optional: Validate that the status is one of the allowed values
        const validStatuses = [
            'order_placed',
            'payment_required',
            'pending_payment',
            'payment_received',
            'order_inspected',
            'order_shipped'
        ];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid order status',
            });
        }


        const updatedOrder = await swell.put(`/orders/${orderId}`, {
            content: {
                order_status: status
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Order status updated successfully',
            order: updatedOrder,
        });
    } catch (err) {
        console.error('Error updating order status:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to update order status',
        });
    }
};






exports.updateTransferId = async (req, res) => {
    const { orderId } = req.params;
    const { transfer_id } = req.body;

    if (!orderId || !transfer_id) {
        return res.status(400).json({
            success: false,
            message: 'Missing order ID or transfer id',
        });
    }

    try {
        const updatedOrder = await swell.put(`/orders/${orderId}`, {
            content: {
                transfer_id: transfer_id
            }
        });

        return res.status(200).json({
            success: true,
            message: 'Transfer Id updated successfully',
            order: updatedOrder,
        });
    } catch (err) {
        console.error('Error updating order status:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to update order status',
        });
    }
};
