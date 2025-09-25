const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
const { transformProducts } = require('../helpers/functions');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

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
            'order_shipped',
            'order_cancelled',
            'order_returned'
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
                transfer_id: transfer_id,
                order_status: "pending_payment"
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



exports.getOrderDetails = async (req, res) => {
    const { orderId } = req.query;

    if (!orderId) {
        return res.status(400).json({
            success: false,
            message: 'Missing order ID',
        });
    }

    try {
        // Step 1: Fetch order with product details
        const order = await swell.get(`/orders/${orderId}`, {
            expand: ['items.product', 'content.shipping_company_name'],
        });

        // Step 2: Extract unique factory_ids (customer IDs)
        const factoryIds = [
            ...new Set(
                order.items
                    .map(item => item.product?.content?.factory_id)
                    .filter(Boolean)
            ),
        ];

        // Step 3: Fetch all related customers (factories)
        const factories = {};

        for (const factoryId of factoryIds) {
            try {
                const factory = await swell.get(`/accounts/${factoryId}`);
                factories[factoryId] = factory;
            } catch (err) {
                console.warn(`Failed to fetch factory with ID ${factoryId}`, err.message);
            }
        }

        // Step 4: Inject factory info into each item
        const itemsWithFactory = order.items.map(item => {
            const factoryId = item.product?.content?.factory_id;
            const updatedProduct = transformProducts(item.product)
            return {
                ...item,
                product: updatedProduct,
                // factory: factories[factoryId] || null,
            };
        });

        const firstFactoryId = factoryIds[0];
        const firstFactory = factories[firstFactoryId] || null;
        // Final response with factories included
        if (order?.content?.shipping_company_name?.first_name || order?.content?.shipping_company_name?.last_name) {
            const firstName = order.content.shipping_company_name.first_name || '';
            const lastName = order.content.shipping_company_name.last_name || '';
            order.shipping.company_name = `${firstName} ${lastName}`.trim();
        }

        if (order?.content?.shipping_company_name?.content?.store_front_cover_photo?.file?.url) {
            order.shipping.company_logo = order.content.shipping_company_name.content.store_front_cover_photo.file.url;
        }

        if (order?.content?.date_of_shipping) {
            order.shipping.shipping_date = order.content.date_of_shipping;
        }

        if (order?.content?.delivery_date && order?.content?.date_of_shipping) {
            const diff = new Date(order.content.delivery_date) - new Date(order.content.date_of_shipping);
            const durationDays = Math.ceil(diff / 86400000);
            order.shipping.duration = `${durationDays} days`;
        }

        if (order?.content?.price) {
            order.shipping.price = order.content.price
        }

        order.shipping.currency = 'USD'; // This can always be set if it's fixed

        if (order?.content?.order_status) {
            order.status = order.content.order_status
        } else {
            order.status = 'order_placed'
        }

        // Handle other_documents field (ensure it's always an array)
        if (order.content && order.content.other_documents) {
            if (!Array.isArray(order.content.other_documents)) {
                order.content.other_documents = [order.content.other_documents];
            }

            // Keep only url and originalFilename
            order.content.other_documents = order.content.other_documents.map(doc => ({
                url: doc.url,
                originalFilename: doc.originalFilename
            }));
        } else {
            order.content.other_documents = [];
        }
        
        return res.status(200).json({
            success: true,
            message: 'Order retrieved successfully',
            order: {
                ...order,
                items: itemsWithFactory,
                factory: firstFactory
            },
        });
    } catch (err) {
        console.error('Error retrieving order:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to retrieve order',
        });
    }
};


exports.updateOrderDocuments = async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        return res.status(400).json({
            success: false,
            message: 'Missing order ID',
        });
    }

    try {
        // Get the existing order
        const order = await swell.get(`/orders/${orderId}`);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }

        const previousDocs = order.content || {};
        const updatedDocs = { ...previousDocs };

        const fileFields = [
            'shipping_qutation',
            'invoice_by_factory',
            'dhl_invoice',
            'inspection_report',
            'shipping_policy',
            'other_documents'
        ];

        // Handle single file fields
        for (const field of fileFields) {
            const file = req.files?.[field]?.[0];
            if (!file?.buffer) continue;

            try {
                const uploaded = await swell.post('/:files', {
                    filename: file.originalname,
                    content_type: file.mimetype,
                    data: {
                        $base64: file.buffer.toString('base64'),
                    },
                });

                const ext = file.originalname.split('.').pop();

                updatedDocs[field] = {
                    ...uploaded,
                    originalFilename: file.originalname,
                    extension: ext,
                    mimeType: file.mimetype,
                };
            } catch (err) {
                console.error(`Error uploading ${field}:`, err.message);
            }
        }

        // Handle other_documents (multiple files)
        const otherDocumentsFiles = req.files?.['other_documents'] || [];
        if (otherDocumentsFiles.length > 0) {
            // Initialize other_documents as array if it doesn't exist
            if (!Array.isArray(updatedDocs.other_documents)) {
                updatedDocs.other_documents = [];
            }

            for (const file of otherDocumentsFiles) {
                if (!file?.buffer) continue;

                try {
                    const uploaded = await swell.post('/:files', {
                        filename: file.originalname,
                        content_type: file.mimetype,
                        data: {
                            $base64: file.buffer.toString('base64'),
                        },
                    });

                    const ext = file.originalname.split('.').pop();

                    updatedDocs.other_documents.push({
                        ...uploaded,
                        originalFilename: file.originalname,
                        extension: ext,
                        mimeType: file.mimetype,
                        uploadedAt: new Date().toISOString(),
                    });
                } catch (err) {
                    console.error('Error uploading other_document:', err.message);
                }
            }
        }

        const updatedOrder = await swell.put(`/orders/${orderId}`, {
            content: updatedDocs,
        });

        return res.status(200).json({
            success: true,
            message: 'Order documents uploaded and updated successfully',
            order: updatedOrder,
        });
    } catch (err) {
        console.error('Error updating order documents:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Internal server error',
        });
    }
};
