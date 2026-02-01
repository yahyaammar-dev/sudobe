const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const ActivityLogger = require('../services/activityLogger');

/**
 * Validate phone number format
 * - Must be numeric only (no + sign, no spaces, no dashes)
 * - Must be at least 10 digits (minimum for country code + phone)
 * - Maximum 15 digits (international standard)
 * @param {string} phone - Phone number to validate
 * @returns {object} - { valid: boolean, error: string }
 */
function validatePhoneNumber(phone) {
  if (!phone || phone.trim() === '') {
    return { valid: true, error: null }; // Phone is optional
  }

  // Remove any whitespace
  const cleanedPhone = phone.trim();

  // Check if contains + sign
  if (cleanedPhone.includes('+')) {
    return {
      valid: false,
      error: 'Phone number cannot contain "+" sign. Enter phone number with country code (no + sign). Example: 201234567890 (Egypt: 20 + phone number)'
    };
  }

  // Check if contains only digits
  if (!/^\d+$/.test(cleanedPhone)) {
    return {
      valid: false,
      error: 'Phone number must contain only digits (no spaces, dashes, or special characters). Example: 201234567890'
    };
  }

  // Check minimum length (at least 10 digits for country code + phone)
  if (cleanedPhone.length < 10) {
    return {
      valid: false,
      error: 'Phone number must be at least 10 digits long (including country code). Example: 201234567890 (Egypt: 20 + phone number)'
    };
  }

  // Check maximum length (international standard is 15 digits)
  if (cleanedPhone.length > 15) {
    return {
      valid: false,
      error: 'Phone number cannot exceed 15 digits'
    };
  }

  return { valid: true, error: null };
}


exports.getOrdersByUserId = async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({
            success: false,
            message: 'Missing user ID',
        });
    }

    try {
        const orders = await swell.get('/orders', {
            where: { account_id: userId },
            limit: 100,
            page: 1,
            expand: ['items.product']
        });

        console.log(orders)

        const updatedOrders = await Promise.all(orders.results.map(async (order) => {
            if (!Array.isArray(order.items) || order.items.length === 0) {
                return {
                    ...order,
                    expected_delivery: null
                };
            }


            if (order?.content?.order_status) {
                order.status = order.content.order_status
            } else {
                order.status = 'order_placed'
            }




            let totalItems = 0;

            const firstItem = order.items[0];
            const product = firstItem?.product;
            let leadTimeDays = 0;

            // Sum up item quantities for this order
            order.items.forEach(item => {
                totalItems += item.quantity || 0;
            });

            const productLeadTime = product?.content?.lead_time;
            const factory = await swell.get(`/accounts/${product?.content?.factory_id}`);
            if (Array.isArray(productLeadTime) && productLeadTime.length > 0) {
                leadTimeDays = productLeadTime[0].max_days || 0;
            } else if (factory) {
                try {
                    const factoryLeadTime = factory?.content?.lead_time;
                    if (Array.isArray(factoryLeadTime) && factoryLeadTime.length > 0) {
                        leadTimeDays = factoryLeadTime[0].max_days || 0;
                    }
                } catch (factoryErr) {
                    console.warn(`Failed to fetch factory for product ${product.id}:`, factoryErr.message);
                }
            }

            const createdDate = new Date(order.date_created);
            const expectedDeliveryDate = new Date(createdDate);
            expectedDeliveryDate.setDate(createdDate.getDate() + leadTimeDays);

            return {
                ...order,
                expected_delivery: expectedDeliveryDate.toISOString(),
                totalItems: totalItems,
                factory
            };
        }));

        return res.status(200).json({
            success: true,
            message: 'Orders fetched successfully',
            orders: updatedOrders,
            count: orders.count,
            page: orders.page,
            pages: orders.pages,
        });
    } catch (err) {
        console.error('Error fetching orders:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch orders',
        });
    }
};


exports.getOrderById = async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        return res.status(400).json({
            success: false,
            message: 'Missing order ID',
        });
    }

    try {
        const order = await swell.get(`/orders/${orderId}`);

        if (!order || order.id !== orderId) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Order fetched successfully',
            order,
        });
    } catch (err) {
        console.error('Error fetching order:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch order',
        });
    }
};





exports.deleteAccount = async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
        return res.status(400).json({
            success: false,
            message: 'Missing account ID',
        });
    }

    try {
        const result = await swell.delete(`/accounts/${accountId}`, {
            $force_delete: true,
        });

        return res.status(200).json({
            success: true,
            message: 'Account deleted successfully',
            result,
        });
    } catch (err) {
        console.error('Error deleting account:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete account',
        });
    }
};




exports.getAddressesByAccountId = async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
        return res.status(400).json({
            success: false,
            message: 'Missing account ID',
        });
    }

    try {
        const response = await swell.get('/accounts:addresses', {
            where: {
                parent_id: accountId
            },
            limit: 100, // Adjust limit as needed
            page: 1
        });

        return res.status(200).json({
            success: true,
            message: 'Addresses fetched successfully',
            addresses: response.results || [],
            count: response.count,
            page: response.page,
            pages: response.pages
        });
    } catch (err) {
        console.error('Error fetching addresses:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch addresses',
        });
    }
};



exports.updateAddress = async (req, res) => {
    const { addressId } = req.params;
    const {
        parent_id,
        address1,
        address2,
        city,
        company,
        country,
        first_name,
        last_name,
        name,
        phone,
        state,
        zip,
        active
    } = req.body;

    if (!addressId || !parent_id || !address1) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: addressId, parent_id, or address1',
        });
    }

    // Validate phone number if provided
    let cleanedPhone = phone;
    if (phone !== undefined && phone !== null && phone !== '') {
        const phoneValidation = validatePhoneNumber(phone);
        if (!phoneValidation.valid) {
            return res.status(400).json({
                success: false,
                message: phoneValidation.error
            });
        }
        cleanedPhone = phone.trim();
    }

    try {
        const updatedAddress = await swell.put(`/accounts:addresses/${addressId}`, {
            parent_id,
            address1,
            address2,
            city,
            company,
            country,
            first_name,
            last_name,
            name,
            phone: cleanedPhone,
            state,
            zip,
            active
        });

        // Log the activity
        ActivityLogger.log({
            userId: req.user?.id,
            userEmail: req.user?.email,
            action: 'edit_customer_address',
            resourceType: 'address',
            resourceId: addressId,
            description: `Updated address ${addressId} for customer ${parent_id}`,
            metadata: { parent_id, addressId, address1, city, country },
            req
        });

        return res.status(200).json({
            success: true,
            message: 'Address updated successfully',
            address: updatedAddress
        });
    } catch (err) {
        console.error('Error updating address:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to update address',
        });
    }
};




exports.deleteAddress = async (req, res) => {
    const { addressId } = req.params;

    if (!addressId) {
        return res.status(400).json({
            success: false,
            message: 'Missing address ID',
        });
    }

    try {
        const deleted = await swell.delete(`/accounts:addresses/${addressId}`);

        // Log the activity
        ActivityLogger.log({
            userId: req.user?.id,
            userEmail: req.user?.email,
            action: 'delete_customer_address',
            resourceType: 'address',
            resourceId: addressId,
            description: `Deleted address ${addressId}`,
            metadata: { addressId },
            req
        });

        return res.status(200).json({
            success: true,
            message: 'Address deleted successfully',
            result: deleted
        });
    } catch (err) {
        console.error('Error deleting address:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to delete address',
        });
    }
};




exports.createAddress = async (req, res) => {
    const {
        parent_id,
        address1,
        address2,
        city,
        company,
        country,
        first_name,
        last_name,
        name,
        phone,
        state,
        zip,
        active
    } = req.body;

    if (!parent_id || !address1) {
        return res.status(400).json({
            success: false,
            message: 'Missing required fields: parent_id and address1',
        });
    }

    // Validate phone number if provided
    let cleanedPhone = phone;
    if (phone !== undefined && phone !== null && phone !== '') {
        const phoneValidation = validatePhoneNumber(phone);
        if (!phoneValidation.valid) {
            return res.status(400).json({
                success: false,
                message: phoneValidation.error
            });
        }
        cleanedPhone = phone.trim();
    }

    try {
        const newAddress = await swell.post('/accounts:addresses', {
            parent_id,
            address1,
            address2,
            city,
            company,
            country,
            first_name,
            last_name,
            name,
            phone: cleanedPhone,
            state,
            zip,
            active: true
        });

        // Log the activity
        ActivityLogger.log({
            userId: req.user?.id,
            userEmail: req.user?.email,
            action: 'create_customer_address',
            resourceType: 'address',
            resourceId: newAddress.id,
            description: `Created address for customer ${parent_id}`,
            metadata: { parent_id, address1, city, country },
            req
        });

        return res.status(201).json({
            success: true,
            message: 'Address created successfully',
            address: newAddress
        });
    } catch (err) {
        console.error('Error creating address:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to create address',
        });
    }
};




// controllers/accountsController.js

exports.updateFavorites = async (req, res) => {
    const { accountId } = req.params;
    const { productId, action } = req.body;

    if (!accountId || !productId || !['add', 'remove'].includes(action)) {
        return res.status(400).json({ success: false, message: 'Invalid input' });
    }

    try {
        const account = await swell.get(`/accounts/${accountId}`);
        const favorites = account.metadata?.favorites || [];

        let updatedFavorites;
        if (action === 'add') {
            updatedFavorites = [...new Set([...favorites, productId])];
        } else {
            updatedFavorites = favorites.filter(id => id !== productId);
        }

        const updatedAccount = await swell.put(`/accounts/${accountId}`, {
            $set: {
                metadata: {
                    favorites: updatedFavorites,
                },
            },
        });

        res.status(200).json({
            success: true,
            message: `Product ${action}ed successfully`,
            favorites: updatedFavorites,
        });
    } catch (err) {
        console.error('Error updating favorites:', err.message);
        res.status(500).json({ success: false, message: 'Error updating favorites' });
    }
};





// controllers/accountsController.js

exports.getCustomerDetails = async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
        return res.status(400).json({
            success: false,
            message: 'Missing account ID',
        });
    }

    try {
        const customer = await swell.get(`/accounts/${accountId}`);

        if (!customer || customer.id !== accountId) {
            return res.status(404).json({
                success: false,
                message: 'Customer not found',
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Customer details fetched successfully',
            customer,
        });
    } catch (err) {
        console.error('Error fetching customer details:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to fetch customer details',
        });
    }
};

exports.getFavoriteProducts = async (req, res) => {
    const { accountId } = req.params;

    if (!accountId) {
        return res.status(400).json({ success: false, message: 'Missing account ID' });
    }

    try {
        const account = await swell.get(`/accounts/${accountId}`);
        const favorites = account.metadata?.favorites || [];

        if (!favorites.length) {
            return res.status(200).json({ success: true, products: [] });
        }

        const products = await swell.get('/products', {
            where: { id: { $in: favorites } },
            limit: 100,
        });

        res.status(200).json({ success: true, products: products.results || [] });
    } catch (err) {
        console.error('Error fetching favorite products:', err.message);
        res.status(500).json({ success: false, message: 'Error fetching products' });
    }
};
