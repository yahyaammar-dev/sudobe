const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
const { transformProducts } = require('../helpers/functions');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');

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
            'payment_pending',
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
            // Add null check before calling transformProducts
            const updatedProduct = item.product ? transformProducts(item.product) : null;
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

exports.calculateLoad = async (req, res) => {
    try {
        const { cartId } = req.body;

        if (!cartId) {
            return res.status(400).json({
                success: false,
                message: 'Cart ID is required'
            });
        }

        // Step 1: Fetch cart with items and product details
        const cart = await swell.get(`/carts/${cartId}`, {
            expand: ['items.product', 'items.variant']
        });

        if (!cart || !cart.items || cart.items.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found or empty'
            });
        }

        console.log('Cart fetched:', cart);

        // Step 2: Process cart items and build the Load Calculator request
        const items = [];
        let itemIndex = 1;

        for (const cartItem of cart.items) {
            const quantity = cartItem.quantity;
            
            // Fetch full product details
            const productId = cartItem.product_id;
            const variantId = cartItem.variant_id;
            
            console.log(`Fetching product details for: ${productId}`);
            
            let product;
            let variant;
            
            try {
                // Fetch the complete product with all details
                product = await swell.get(`/products/${productId}`);
                console.log('Full product data:', JSON.stringify(product, null, 2));
                
                // If there's a variant, fetch it separately
                if (variantId && product.variants) {
                    variant = product.variants.results?.find(v => v.id === variantId);
                    console.log('Variant data:', JSON.stringify(variant, null, 2));
                }
            } catch (error) {
                console.error(`Failed to fetch product ${productId}:`, error.message);
                continue;
            }

            // Get dimensions and weight from variant or product
            let length = 0, width = 0, height = 0, weight = 0;

            if (variant) {
                // Get from variant
                const dimensions = variant.carton_dimensions_cm_?.split(' x ').map(d => parseFloat(d.trim()));
                if (dimensions && dimensions.length === 3) {
                    length = dimensions[0] * 10; // Convert cm to mm
                    width = dimensions[1] * 10;
                    height = dimensions[2] * 10;
                }
                weight = variant.shipment_weight || 0;
            } else if (product) {
                // Get from product content
                const dimensionsArray = product.content?.dimensions;
                if (dimensionsArray && dimensionsArray.length > 0) {
                    const dim = dimensionsArray[0];
                    length = (dim.depth || 0) * 10; // Convert cm to mm
                    width = (dim.width || 0) * 10;
                    height = (dim.height || 0) * 10;
                }
                
                const weightArray = product.content?.weight;
                if (weightArray && weightArray.length > 0) {
                    weight = weightArray[0].value || 0;
                }
            }

            // Skip items without dimensions
            if (length === 0 || width === 0 || height === 0) {
                console.warn(`Skipping item ${productId} - missing dimensions`);
                continue;
            }

            items.push({
                color: "#23b753",
                index: itemIndex++,
                name: cartItem.product_name || "Product",
                qty: quantity.toString(),
                type: "box",
                uid: cartItem.product_id,
                weight: weight,
                size: {
                    length: Math.round(length),
                    width: Math.round(width),
                    height: Math.round(height),
                    radius: null
                },
                stacking: {
                    tiltX: true,
                    tiltY: false,
                    layers: null,
                    topWeight: null,
                    height: null,
                    fill: null,
                    rollPlacement: null
                }
            });
        }

        if (items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid items with dimensions found in cart'
            });
        }

        // Step 3: Build Load Calculator API request
        const loadCalculatorRequest = {
            options: {
                lengthUnits: "mm",
                weightUnits: "kg",
                lengthAccuracy: 5,
                remainsNear: true
            },
            groups: [
                {
                    name: "Cart Items",
                    uid: 111,
                    color: "#000",
                    items: items
                }
            ],
            containers: [],
            autoContainers: [
                {
                    attr: {
                        type: "20st"
                    },
                    spaces: [
                        {
                            length: 5890,
                            width: 2350,
                            height: 2390,
                            maxWeight: 28230
                        }
                    ]
                }
            ],
            auth: {
                demo: false,
                user: false
            },
            errorProducts: [],
            palletCheckLoader: false
        };

        console.log('Load Calculator Request:', JSON.stringify(loadCalculatorRequest, null, 2));

        // Step 4: Call SeaRates Load Calculator API
        const apiKey = 'K-6BC266A9-006C-4F86-A839-2336C25DC3BA';
        const response = await axios.post(
            'https://www.searates.com/stuffing/api',
            loadCalculatorRequest,
            {
                params: {
                    key: apiKey
                },
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Load Calculator Response:', response.data);

        // Step 5: Process and format the response
        const results = response.data.result || [];
        const formattedResults = results.map(container => ({
            containerType: container.attr.type,
            quantity: container.qty,
            totalItemsLoaded: container.general.itemQty,
            totalWeight: container.general.cargoWeight,
            totalVolume: container.general.cargoVolume,
            volumeUtilization: (container.general.volumeRatio * 100).toFixed(2) + '%',
            weightUtilization: (container.general.weightRatio * 100).toFixed(2) + '%',
            containerVolume: container.attr.volume,
            containerMaxWeight: container.attr.maxWeight,
            itemBreakdown: container.general.items
        }));

        return res.status(200).json({
            success: true,
            message: 'Load calculation completed successfully',
            data: {
                cartId: cartId,
                totalItems: items.reduce((sum, item) => sum + parseInt(item.qty), 0),
                containers: formattedResults,
                totalContainers: formattedResults.reduce((sum, c) => sum + c.quantity, 0),
                // rawResponse: response.data // Include full response for debugging
            }
        });

    } catch (error) {
        console.error('Calculate load error:', error);
        console.error('Error message:', error.message);
        console.error('Error response:', error.response?.data);
        
        res.status(500).json({ 
            success: false, 
            message: 'Failed to calculate load',
            error: error.message,
            details: error.response?.data || error
        });
    }
};