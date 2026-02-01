const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const { swell } = require('swell-node');
const { transformProducts } = require('../helpers/functions');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const axios = require('axios');
const ActivityLogger = require('../services/activityLogger');

/**
 * Maps phone country codes to ISO 2-letter country codes
 * Common phone country codes to ISO country codes mapping
 */
function getCountryCodeFromPhoneCode(phoneCountryCode) {
    const phoneToIsoMap = {
        '1': 'US', // US/Canada (defaulting to US, could be enhanced)
        '20': 'EG', // Egypt
        '27': 'ZA', // South Africa
        '30': 'GR', // Greece
        '31': 'NL', // Netherlands
        '32': 'BE', // Belgium
        '33': 'FR', // France
        '34': 'ES', // Spain
        '36': 'HU', // Hungary
        '39': 'IT', // Italy
        '40': 'RO', // Romania
        '41': 'CH', // Switzerland
        '43': 'AT', // Austria
        '44': 'GB', // United Kingdom
        '45': 'DK', // Denmark
        '46': 'SE', // Sweden
        '47': 'NO', // Norway
        '48': 'PL', // Poland
        '49': 'DE', // Germany
        '51': 'PE', // Peru
        '52': 'MX', // Mexico
        '53': 'CU', // Cuba
        '54': 'AR', // Argentina
        '55': 'BR', // Brazil
        '56': 'CL', // Chile
        '57': 'CO', // Colombia
        '58': 'VE', // Venezuela
        '60': 'MY', // Malaysia
        '61': 'AU', // Australia
        '62': 'ID', // Indonesia
        '63': 'PH', // Philippines
        '64': 'NZ', // New Zealand
        '65': 'SG', // Singapore
        '66': 'TH', // Thailand
        '81': 'JP', // Japan
        '82': 'KR', // South Korea
        '84': 'VN', // Vietnam
        '86': 'CN', // China
        '90': 'TR', // Turkey
        '91': 'IN', // India
        '92': 'PK', // Pakistan
        '93': 'AF', // Afghanistan
        '94': 'LK', // Sri Lanka
        '95': 'MM', // Myanmar
        '98': 'IR', // Iran
        '212': 'MA', // Morocco
        '213': 'DZ', // Algeria
        '216': 'TN', // Tunisia
        '218': 'LY', // Libya
        '220': 'GM', // Gambia
        '221': 'SN', // Senegal
        '222': 'MR', // Mauritania
        '223': 'ML', // Mali
        '224': 'GN', // Guinea
        '225': 'CI', // Côte d'Ivoire
        '226': 'BF', // Burkina Faso
        '227': 'NE', // Niger
        '228': 'TG', // Togo
        '229': 'BJ', // Benin
        '230': 'MU', // Mauritius
        '231': 'LR', // Liberia
        '232': 'SL', // Sierra Leone
        '233': 'GH', // Ghana
        '234': 'NG', // Nigeria
        '235': 'TD', // Chad
        '236': 'CF', // Central African Republic
        '237': 'CM', // Cameroon
        '238': 'CV', // Cape Verde
        '239': 'ST', // São Tomé and Príncipe
        '240': 'GQ', // Equatorial Guinea
        '241': 'GA', // Gabon
        '242': 'CG', // Republic of the Congo
        '243': 'CD', // Democratic Republic of the Congo
        '244': 'AO', // Angola
        '245': 'GW', // Guinea-Bissau
        '246': 'IO', // British Indian Ocean Territory
        '248': 'SC', // Seychelles
        '249': 'SD', // Sudan
        '250': 'RW', // Rwanda
        '251': 'ET', // Ethiopia
        '252': 'SO', // Somalia
        '253': 'DJ', // Djibouti
        '254': 'KE', // Kenya
        '255': 'TZ', // Tanzania
        '256': 'UG', // Uganda
        '257': 'BI', // Burundi
        '258': 'MZ', // Mozambique
        '260': 'ZM', // Zambia
        '261': 'MG', // Madagascar
        '262': 'RE', // Réunion
        '263': 'ZW', // Zimbabwe
        '264': 'NA', // Namibia
        '265': 'MW', // Malawi
        '266': 'LS', // Lesotho
        '267': 'BW', // Botswana
        '268': 'SZ', // Eswatini
        '269': 'KM', // Comoros
        '290': 'SH', // Saint Helena
        '291': 'ER', // Eritrea
        '297': 'AW', // Aruba
        '298': 'FO', // Faroe Islands
        '299': 'GL', // Greenland
        '350': 'GI', // Gibraltar
        '351': 'PT', // Portugal
        '352': 'LU', // Luxembourg
        '353': 'IE', // Ireland
        '354': 'IS', // Iceland
        '355': 'AL', // Albania
        '356': 'MT', // Malta
        '357': 'CY', // Cyprus
        '358': 'FI', // Finland
        '359': 'BG', // Bulgaria
        '370': 'LT', // Lithuania
        '371': 'LV', // Latvia
        '372': 'EE', // Estonia
        '373': 'MD', // Moldova
        '374': 'AM', // Armenia
        '375': 'BY', // Belarus
        '376': 'AD', // Andorra
        '377': 'MC', // Monaco
        '378': 'SM', // San Marino
        '380': 'UA', // Ukraine
        '381': 'RS', // Serbia
        '382': 'ME', // Montenegro
        '383': 'XK', // Kosovo
        '385': 'HR', // Croatia
        '386': 'SI', // Slovenia
        '387': 'BA', // Bosnia and Herzegovina
        '389': 'MK', // North Macedonia
        '420': 'CZ', // Czech Republic
        '421': 'SK', // Slovakia
        '423': 'LI', // Liechtenstein
        '500': 'FK', // Falkland Islands
        '501': 'BZ', // Belize
        '502': 'GT', // Guatemala
        '503': 'SV', // El Salvador
        '504': 'HN', // Honduras
        '505': 'NI', // Nicaragua
        '506': 'CR', // Costa Rica
        '507': 'PA', // Panama
        '508': 'PM', // Saint Pierre and Miquelon
        '509': 'HT', // Haiti
        '590': 'BL', // Saint Barthélemy
        '591': 'BO', // Bolivia
        '592': 'GY', // Guyana
        '593': 'EC', // Ecuador
        '594': 'GF', // French Guiana
        '595': 'PY', // Paraguay
        '596': 'MQ', // Martinique
        '597': 'SR', // Suriname
        '598': 'UY', // Uruguay
        '599': 'CW', // Curaçao
        '670': 'TL', // East Timor
        '672': 'NF', // Norfolk Island
        '673': 'BN', // Brunei
        '674': 'NR', // Nauru
        '675': 'PG', // Papua New Guinea
        '676': 'TO', // Tonga
        '677': 'SB', // Solomon Islands
        '678': 'VU', // Vanuatu
        '679': 'FJ', // Fiji
        '680': 'PW', // Palau
        '681': 'WF', // Wallis and Futuna
        '682': 'CK', // Cook Islands
        '683': 'NU', // Niue
        '684': 'AS', // American Samoa
        '685': 'WS', // Samoa
        '686': 'KI', // Kiribati
        '687': 'NC', // New Caledonia
        '688': 'TV', // Tuvalu
        '689': 'PF', // French Polynesia
        '850': 'KP', // North Korea
        '852': 'HK', // Hong Kong
        '853': 'MO', // Macau
        '855': 'KH', // Cambodia
        '856': 'LA', // Laos
        '880': 'BD', // Bangladesh
        '886': 'TW', // Taiwan
        '960': 'MV', // Maldives
        '961': 'LB', // Lebanon
        '962': 'JO', // Jordan
        '963': 'SY', // Syria
        '964': 'IQ', // Iraq
        '965': 'KW', // Kuwait
        '966': 'SA', // Saudi Arabia
        '967': 'YE', // Yemen
        '968': 'OM', // Oman
        '970': 'PS', // Palestine
        '971': 'AE', // United Arab Emirates
        '972': 'IL', // Israel
        '973': 'BH', // Bahrain
        '974': 'QA', // Qatar
        '975': 'BT', // Bhutan
        '976': 'MN', // Mongolia
        '977': 'NP', // Nepal
        '992': 'TJ', // Tajikistan
        '993': 'TM', // Turkmenistan
        '994': 'AZ', // Azerbaijan
        '995': 'GE', // Georgia
        '996': 'KG', // Kyrgyzstan
        '998': 'UZ', // Uzbekistan
    };
    
    return phoneToIsoMap[phoneCountryCode] || null;
}

/**
 * Extracts country code from phone number
 * @param {string} phoneNumber - Phone number (e.g., "254722404181", "+254722404181")
 * @returns {string|null} - ISO 2-letter country code or null
 */
function extractCountryCodeFromPhone(phoneNumber) {
    if (!phoneNumber) return null;
    
    // Remove all non-digit characters
    const digitsOnly = phoneNumber.replace(/\D/g, '');
    
    if (digitsOnly.length < 10) return null;
    
    // Try 3-digit country codes first (e.g., 254, 234)
    if (digitsOnly.length >= 12) {
        const threeDigit = digitsOnly.substring(0, 3);
        const isoCode = getCountryCodeFromPhoneCode(threeDigit);
        if (isoCode) return isoCode;
    }
    
    // Try 2-digit country codes (e.g., 44, 27)
    if (digitsOnly.length >= 11) {
        const twoDigit = digitsOnly.substring(0, 2);
        const isoCode = getCountryCodeFromPhoneCode(twoDigit);
        if (isoCode) return isoCode;
    }
    
    // Try 1-digit (US/Canada)
    if (digitsOnly.length >= 10) {
        const oneDigit = digitsOnly.substring(0, 1);
        if (oneDigit === '1') {
            return getCountryCodeFromPhoneCode('1');
        }
    }
    
    return null;
}

/**
 * Calculates estimated arrival date from shipping rates
 * @param {number|null} minDays - Minimum shipping days
 * @param {number|null} maxDays - Maximum shipping days
 * @returns {string|null} - Estimated arrival date in YYYY-MM-DD format or null
 */
function calculateEstimatedArrivalDate(minDays, maxDays) {
    let averageDays = null;
    
    // Calculate average days if both min and max are available
    if (minDays !== undefined && minDays !== null && 
        maxDays !== undefined && maxDays !== null) {
        averageDays = Math.round((minDays + maxDays) / 2);
    } else if (minDays !== undefined && minDays !== null) {
        // If only min_days is available, use it
        averageDays = minDays;
    } else if (maxDays !== undefined && maxDays !== null) {
        // If only max_days is available, use it
        averageDays = maxDays;
    }
    
    if (averageDays === null) {
        return null;
    }
    
    // Calculate estimated arrival date (today + average days)
    const today = new Date();
    const estimatedDate = new Date(today);
    estimatedDate.setDate(today.getDate() + averageDays);
    return estimatedDate.toISOString().split('T')[0]; // Format as YYYY-MM-DD
}

/**
 * Gets shipping rates and calculates estimated arrival date for an order
 * @param {Object} order - Order object
 * @param {string} orderId - Order ID
 * @param {Object} req - Express request object (for logging, optional)
 * @returns {Object|null} - Object with estimatedArrivalDate and shipping rates info, or null
 */
async function calculateShippingRatesAndArrivalDate(order, orderId, req = null) {
    try {
        let shippingRates = null;
        let countryCode = null;
        let phoneNumber = null;
        
        // Fetch customer account to get phone number
        if (order.account_id) {
            const customer = await swell.get(`/accounts/${order.account_id}`);
            phoneNumber = customer?.phone || order.shipping?.phone || order.billing?.phone;
            
            if (phoneNumber) {
                // Extract ISO country code from phone number
                countryCode = extractCountryCodeFromPhone(phoneNumber);
                
                // Fetch shipping rates for this country code
                if (countryCode) {
                    const ratesResponse = await swell.get('/content/shipping-rates', {
                        limit: 1000
                    });
                    
                    // Find matching shipping rate by country code
                    const matchingRate = ratesResponse?.results?.find(rate => 
                        rate.content?.country_name === countryCode
                    );
                    
                    if (matchingRate) {
                        shippingRates = matchingRate.content;
                        const shippingDays = shippingRates.shipping_rates || {};
                        
                        // Extract min_days and max_days
                        const minDays = shippingDays.min_days;
                        const maxDays = shippingDays.max_days;
                        
                        // Calculate estimated arrival date
                        const estimatedArrivalDate = calculateEstimatedArrivalDate(minDays, maxDays);
                        
                        // Calculate average days for logging
                        let averageDays = null;
                        if (minDays !== undefined && minDays !== null && 
                            maxDays !== undefined && maxDays !== null) {
                            averageDays = Math.round((minDays + maxDays) / 2);
                        } else if (minDays !== undefined && minDays !== null) {
                            averageDays = minDays;
                        } else if (maxDays !== undefined && maxDays !== null) {
                            averageDays = maxDays;
                        }
                        
                        // Log the activity if req is provided
                        if (req) {
                            await ActivityLogger.log({
                                userId: req.user?.id || 'system',
                                userEmail: req.user?.email || 'system',
                                action: 'fetch_shipping_rates',
                                resourceType: 'order',
                                resourceId: orderId,
                                description: `Fetched shipping rates for country ${countryCode} based on customer phone ${phoneNumber}`,
                                metadata: {
                                    phoneNumber,
                                    countryCode,
                                    shippingRates: {
                                        min_rate: shippingRates.min_rate,
                                        max_rate: shippingRates.max_rate,
                                        min_days: minDays,
                                        max_days: maxDays,
                                        average_days: averageDays,
                                        estimated_arrival_date: estimatedArrivalDate
                                    }
                                },
                                req
                            });
                        }
                        
                        return {
                            estimatedArrivalDate: estimatedArrivalDate,
                            countryCode: countryCode,
                            phoneNumber: phoneNumber,
                            shippingRates: shippingRates,
                            minDays: minDays,
                            maxDays: maxDays,
                            averageDays: averageDays
                        };
                    } else {
                        // Log that no shipping rates were found
                        console.log(`No shipping rates found for country code: ${countryCode}`);
                    }
                } else {
                    console.log(`Could not extract country code from phone number: ${phoneNumber}`);
                }
            }
        }
        
        return null;
    } catch (error) {
        console.warn('Error fetching shipping rates:', error.message);
        // Don't fail the entire request if shipping rates can't be fetched
        return null;
    }
}

// Export helper functions for use in webhook controller
exports.calculateShippingRatesAndArrivalDate = calculateShippingRatesAndArrivalDate;
exports.extractCountryCodeFromPhone = extractCountryCodeFromPhone;
exports.calculateEstimatedArrivalDate = calculateEstimatedArrivalDate;

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
                originalFilename: doc.filename
            }));
        } else {
            if (!order.content) {
                order.content = {};
            }
            order.content.other_documents = [];
        }

        // Step 5: Get estimated arrival date from order content (stored by webhook)
        // If not stored, calculate it (fallback for old orders)
        let estimatedArrivalDate = order?.content?.estimated_arrival_date || null;
        
        if (!estimatedArrivalDate) {
            // Fallback: calculate if not stored (for backward compatibility)
            const shippingRatesData = await calculateShippingRatesAndArrivalDate(order, orderId, req);
            estimatedArrivalDate = shippingRatesData?.estimatedArrivalDate || null;
        }
        
        return res.status(200).json({
            success: true,
            message: 'Order retrieved successfully',
            order: {
                ...order,
                items: itemsWithFactory,
                factory: firstFactory,
                estimated_arrival_date: estimatedArrivalDate
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

// Test endpoint: Try to add custom price object to cart
exports.testCustomPrice = async (req, res) => {
    try {
        const { cartId, userId } = req.params;

        if (!cartId) {
            return res.status(400).json({
                success: false,
                message: 'Cart ID is required'
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'User ID is required'
            });
        }

        console.log('[TEST CUSTOM PRICE] Testing custom price addition for cart:', cartId);
        console.log('[TEST CUSTOM PRICE] Testing custom price addition for user:', userId);

        // Step 1: Get existing cart
        const cart = await swell.get(`/carts/${cartId}`);
        
        if (!cart) {
            return res.status(404).json({
                success: false,
                message: 'Cart not found'
            });
        }

        // Step 1.5: Get user account and shipping rate based on user's country
        let user = null;
        let shippingRate = null;
        let midRangeShipping = 0;

        try {
            // Get user account
            user = await swell.get(`/accounts/${userId}`);
            if (!user) {
                console.warn('[TEST CUSTOM PRICE] User not found:', userId);
            } else {
                console.log('[TEST CUSTOM PRICE] User found:', {
                    id: user.id,
                    email: user.email,
                    phone: user.phone
                });

                // Get user's phone number
                const phone = user.phone;
                if (phone) {
                    try {
                        // Get country code from phone number using Twilio
                        const countryLookup = await client.lookups.v1.phoneNumbers(phone).fetch();
                        const countryCode = countryLookup.countryCode;
                        console.log('[TEST CUSTOM PRICE] User country code:', countryCode);

                        // Fetch shipping rate for this country
                        const ratesResponse = await swell.get('/content/shipping-rates', {
                            limit: 1000,
                            where: {
                                'content.country_name': countryCode
                            }
                        });

                        // Get the first matching shipping rate
                        if (ratesResponse.results && ratesResponse.results.length > 0) {
                            const rate = ratesResponse.results[0];
                            shippingRate = {
                                id: rate.id,
                                country_code: countryCode,
                                min_rate: parseFloat(rate.content?.min_rate) || 0,
                                max_rate: parseFloat(rate.content?.max_rate) || 0
                            };

                            // Calculate mid-range shipping rate
                            if (shippingRate.min_rate > 0 && shippingRate.max_rate > 0) {
                                midRangeShipping = (shippingRate.min_rate + shippingRate.max_rate) / 2;
                                midRangeShipping = Math.round(midRangeShipping * 100) / 100; // Round to 2 decimal places
                            } else if (shippingRate.min_rate > 0) {
                                midRangeShipping = shippingRate.min_rate;
                            } else if (shippingRate.max_rate > 0) {
                                midRangeShipping = shippingRate.max_rate;
                            }

                            console.log('[TEST CUSTOM PRICE] Shipping rate found:', {
                                country_code: countryCode,
                                min_rate: shippingRate.min_rate,
                                max_rate: shippingRate.max_rate,
                                mid_range: midRangeShipping
                            });
                        } else {
                            console.warn('[TEST CUSTOM PRICE] No shipping rate found for country:', countryCode);
                        }
                    } catch (phoneError) {
                        console.error('[TEST CUSTOM PRICE] Error getting country from phone number:', phoneError.message);
                    }
                } else {
                    console.warn('[TEST CUSTOM PRICE] User has no phone number');
                }
            }
        } catch (userError) {
            console.error('[TEST CUSTOM PRICE] Error fetching user:', userError.message);
            // Continue execution even if user fetch fails
        }

        // Step 2: Get existing items and separate platform fees from regular items FIRST
        // This is critical - we need to calculate subtotal WITHOUT platform fees
        const existingItems = cart.items || [];
        
        console.log('[TEST CUSTOM PRICE] Total existing items:', existingItems.length);
        console.log('[TEST CUSTOM PRICE] Existing items:', JSON.stringify(existingItems.map(item => ({
            id: item.id,
            description: item.description,
            name: item.name,
            type: item.type,
            price: item.price,
            price_total: item.price_total
        })), null, 2));
        
        // Explicitly identify ALL platform fee items first
        const platformFeeItems = [];
        const regularItems = [];
        
        existingItems.forEach(item => {
            const isPlatformFee = 
                (item.description === "Platform Fee (2.5%)" || 
                 item.name === "Platform Fee (2.5%)" ||
                 (item.type === "custom" && item.name && item.name.includes("Platform Fee")) ||
                 (item.type === "custom" && item.description && item.description.includes("Platform Fee")));
            
            if (isPlatformFee) {
                platformFeeItems.push(item);
                console.log('[TEST CUSTOM PRICE] Found platform fee item to remove:', {
                    id: item.id,
                    description: item.description,
                    name: item.name,
                    price: item.price,
                    price_total: item.price_total
                });
            } else {
                regularItems.push(item);
            }
        });
        
        console.log('[TEST CUSTOM PRICE] Platform fee items found:', platformFeeItems.length);
        console.log('[TEST CUSTOM PRICE] Regular items to keep:', regularItems.length);
        
        // Step 3: Calculate subtotal from REGULAR ITEMS ONLY (excluding platform fees)
        // Sum up price_total from all regular items
        const subtotal = regularItems.reduce((sum, item) => {
            const itemTotal = parseFloat(item.price_total || item.price || 0);
            return sum + (isNaN(itemTotal) ? 0 : itemTotal);
        }, 0);
        
        console.log('[TEST CUSTOM PRICE] Calculated subtotal from regular items only:', subtotal);
        
        // Step 3.5: Use mid-range shipping rate from user's country (calculated in Step 1.5)
        // If we couldn't get shipping rate from user's country, fall back to cart's shipping
        let shipping = midRangeShipping;
        
        if (shipping === 0) {
            // Fallback: Try to get shipping from cart if we couldn't get it from user's country
            let shippingValue = 0;
            if (cart.shipping?.price !== undefined && cart.shipping.price !== null) {
                shippingValue = parseFloat(cart.shipping.price);
            } else if (cart.shipping_price !== undefined && cart.shipping_price !== null) {
                shippingValue = parseFloat(cart.shipping_price);
            } else if (cart.shipping?.cost !== undefined && cart.shipping.cost !== null) {
                shippingValue = parseFloat(cart.shipping.cost);
            } else if (typeof cart.shipping === 'number') {
                shippingValue = parseFloat(cart.shipping);
            } else if (cart.shipping?.total !== undefined && cart.shipping.total !== null) {
                shippingValue = parseFloat(cart.shipping.total);
            }
            shipping = isNaN(shippingValue) ? 0 : shippingValue;
            console.log('[TEST CUSTOM PRICE] Using cart shipping (fallback):', shipping);
        } else {
            console.log('[TEST CUSTOM PRICE] Using mid-range shipping from user country:', shipping);
        }

        // Step 4: Calculate 2.5% platform fee on (subtotal + shipping)
        // Now subtotal excludes old platform fees, and shipping is mid-range from user's country
        const platformFee = (subtotal + shipping) * 0.025;
        const roundedPlatformFee = Math.round(platformFee * 100) / 100; // Round to 2 decimal places

        console.log('[TEST CUSTOM PRICE] Calculated platform fee (2.5% of subtotal + shipping):', roundedPlatformFee);
        
        // Step 5: Explicitly DELETE all existing platform fee items by their IDs
        // Swell keeps items with IDs when updating, so we must delete them first
        if (platformFeeItems.length > 0) {
            console.log('[TEST CUSTOM PRICE] Deleting existing platform fee items by ID...');
            for (const platformFeeItem of platformFeeItems) {
                if (platformFeeItem.id) {
                    try {
                        await swell.delete(`/carts/${cartId}/items/${platformFeeItem.id}`);
                        console.log('[TEST CUSTOM PRICE] Deleted platform fee item:', platformFeeItem.id);
                    } catch (deleteError) {
                        console.error('[TEST CUSTOM PRICE] Error deleting platform fee item:', platformFeeItem.id, deleteError.message);
                        // Continue even if one deletion fails
                    }
                }
            }
            console.log('[TEST CUSTOM PRICE] Finished deleting platform fee items');
        }

        // Step 6: Get the cart again after deletions to ensure we have the latest state
        const cartAfterDeletion = await swell.get(`/carts/${cartId}`);
        const currentItems = cartAfterDeletion.items || [];
        console.log('[TEST CUSTOM PRICE] Cart items after deletion:', currentItems.length);

        // Step 7: Try to add custom price object
        // Swell requires either product_id or description, so we use description for custom items
        const customPriceItem = {
            description: "Platform Fee (2.5%)",
            quantity: 1,
            price: roundedPlatformFee,
            name: "Platform Fee (2.5%)",
            type: "custom"
        };

        console.log('[TEST CUSTOM PRICE] Attempting to add custom price item:', customPriceItem);
        
        // Prepare final items array (current items after deletion + new platform fee)
        const finalItems = [
            ...currentItems,
            customPriceItem
        ];
        
        console.log('[TEST CUSTOM PRICE] Final items array to send to Swell:', finalItems.length, 'items');
        console.log('[TEST CUSTOM PRICE] Final items breakdown:', JSON.stringify(finalItems.map(item => ({
            id: item.id,
            description: item.description,
            name: item.name,
            type: item.type,
            price: item.price,
            product_id: item.product_id
        })), null, 2));

        try {
            const updatedCart = await swell.put(`/carts/${cartId}`, {
                items: finalItems
            });

            console.log('[TEST CUSTOM PRICE] Success! Custom price added to cart');
            console.log('[TEST CUSTOM PRICE] Updated cart items count:', updatedCart.items?.length || 0);
            console.log('[TEST CUSTOM PRICE] Updated cart items:', JSON.stringify(updatedCart.items?.map(item => ({
                id: item.id,
                description: item.description,
                name: item.name,
                type: item.type,
                price: item.price,
                product_id: item.product_id
            })) || [], null, 2));
            
            // Verify no duplicate platform fees exist
            const platformFeeCount = (updatedCart.items || []).filter(item => 
                item.description === "Platform Fee (2.5%)" || 
                item.name === "Platform Fee (2.5%)" ||
                (item.type === "custom" && item.name && item.name.includes("Platform Fee")) ||
                (item.type === "custom" && item.description && item.description.includes("Platform Fee"))
            ).length;
            
            console.log('[TEST CUSTOM PRICE] Platform fee items in updated cart:', platformFeeCount, '(should be 1)');
            
            if (platformFeeCount > 1) {
                console.warn('[TEST CUSTOM PRICE] WARNING: Multiple platform fee items detected in cart!');
            }
            return res.status(200).json({
                success: true,
                message: 'Custom price object successfully added to cart',
                calculation: {
                    subtotal: subtotal,
                    shipping: shipping,
                    platformFee: roundedPlatformFee,
                    platformFeePercentage: 2.5
                },
                shippingRate: shippingRate ? {
                    country_code: shippingRate.country_code,
                    min_rate: shippingRate.min_rate,
                    max_rate: shippingRate.max_rate,
                    mid_range: midRangeShipping
                } : null,
                cart: {
                    id: updatedCart.id,
                    items: updatedCart.items,
                    item_count: updatedCart.item_count,
                    total: updatedCart.total,
                    account_id: userId || null
                },
                customItem: customPriceItem
            });
        } catch (swellError) {
            console.error('[TEST CUSTOM PRICE] Swell API error:', swellError);
            console.error('[TEST CUSTOM PRICE] Error response:', swellError.response?.data);
            
            return res.status(400).json({
                success: false,
                message: 'Failed to add custom price object to cart',
                error: swellError.message,
                errorDetails: swellError.response?.data || swellError,
                attemptedItem: customPriceItem
            });
        }
    } catch (error) {
        console.error('[TEST CUSTOM PRICE] Error:', error);
        return res.status(500).json({
            success: false,
            message: 'Internal server error while testing custom price',
            error: error.message
        });
    }
};



/**
 * Parse container tracking API response and determine current location
 * 
 * HOW TO READ THE TRACKING API RESPONSE:
 * 
 * 1. CURRENT LOCATION:
 *    - Find the last event in containers[].events[] where actual === true
 *    - This event's location ID maps to locations[] array
 *    - If transport_type === "VESSEL", container is on a ship
 *    - If transport_type === "TRUCK", container is on land transport
 * 
 * 2. REAL-TIME POSITION:
 *    - If container is on a vessel, check route_data.ais.last_vessel_position
 *    - This gives GPS coordinates (lat/lng) updated in real-time
 * 
 * 3. STATUS:
 *    - metadata.status: Overall shipment status (IN_TRANSIT, DELIVERED, etc.)
 *    - containers[].status: Individual container status
 *    - events[].status: Specific event status codes (CPS, CGI, CLL, VDL, etc.)
 * 
 * 4. UPCOMING EVENTS:
 *    - Events with actual === false are predicted/future events
 *    - First predicted event shows next expected location/action
 * 
 * 5. ROUTE INFORMATION:
 *    - route.pol: Port of Loading (origin)
 *    - route.pod: Port of Discharge (destination)
 *    - route.pol.actual: true if POL date is actual, false if estimated
 *    - route.pod.actual: true if POD date is actual, false if estimated
 * 
 * @param {Object} trackingResponse - The raw tracking API response
 * @returns {Object} Parsed tracking data with current location and status
 */
function parseContainerTracking(trackingResponse) {
    if (!trackingResponse || !trackingResponse.data) {
        return null;
    }

    const { data } = trackingResponse;
    const { locations, containers, route_data, metadata } = data;

    // Create location lookup map
    const locationMap = {};
    locations.forEach(loc => {
        locationMap[loc.id] = loc;
    });

    // Create facility lookup map
    const facilityMap = {};
    if (data.facilities) {
        data.facilities.forEach(fac => {
            facilityMap[fac.id] = fac;
        });
    }

    // Process each container
    const containerTracking = containers.map(container => {
        const { number, status, events } = container;

        // Find the last actual event (current location)
        const actualEvents = events.filter(e => e.actual === true);
        const lastActualEvent = actualEvents.length > 0 
            ? actualEvents[actualEvents.length - 1] 
            : null;

        // Find the next predicted event
        const predictedEvents = events.filter(e => e.actual === false);
        const nextEvent = predictedEvents.length > 0 
            ? predictedEvents[0] 
            : null;

        // Get current location details
        let currentLocation = null;
        let currentFacility = null;
        let currentVessel = null;
        let currentStatus = 'UNKNOWN';

        if (lastActualEvent) {
            currentLocation = locationMap[lastActualEvent.location];
            if (lastActualEvent.facility) {
                currentFacility = facilityMap[lastActualEvent.facility];
            }
            if (lastActualEvent.vessel) {
                // Find vessel details
                const vessel = data.vessels?.find(v => v.id === lastActualEvent.vessel);
                currentVessel = vessel;
            }
            currentStatus = lastActualEvent.status;
        }

        // Get real-time vessel position if available
        let realTimePosition = null;
        if (route_data?.ais?.last_vessel_position && lastActualEvent?.transport_type === 'VESSEL') {
            realTimePosition = {
                lat: route_data.ais.last_vessel_position.lat,
                lng: route_data.ais.last_vessel_position.lng,
                updated_at: route_data.ais.last_vessel_position.updated_at
            };
        }

        // Build user-friendly status message
        let statusMessage = '';
        if (lastActualEvent) {
            const locationName = currentLocation?.name || 'Unknown Location';
            const facilityName = currentFacility?.name || '';
            const vesselName = currentVessel?.name || '';
            
            if (lastActualEvent.transport_type === 'VESSEL' && vesselName) {
                statusMessage = `On vessel ${vesselName} heading to ${locationName}`;
            } else if (lastActualEvent.transport_type === 'TRUCK') {
                statusMessage = `At ${facilityName || locationName} (via truck)`;
            } else {
                statusMessage = `At ${facilityName || locationName}`;
            }
        }

        return {
            containerNumber: number,
            overallStatus: status,
            currentLocation: {
                name: currentLocation?.name,
                state: currentLocation?.state,
                country: currentLocation?.country,
                countryCode: currentLocation?.country_code,
                coordinates: currentLocation ? {
                    lat: currentLocation.lat,
                    lng: currentLocation.lng
                } : null,
                facility: currentFacility ? {
                    name: currentFacility.name,
                    locode: currentFacility.locode
                } : null
            },
            currentEvent: lastActualEvent ? {
                description: lastActualEvent.description,
                eventType: lastActualEvent.event_type,
                eventCode: lastActualEvent.event_code,
                date: lastActualEvent.date,
                transportType: lastActualEvent.transport_type,
                vessel: currentVessel ? {
                    name: currentVessel.name,
                    imo: currentVessel.imo,
                    voyage: lastActualEvent.voyage
                } : null
            } : null,
            realTimePosition: realTimePosition,
            statusMessage: statusMessage,
            nextEvent: nextEvent ? {
                description: nextEvent.description,
                location: locationMap[nextEvent.location]?.name,
                date: nextEvent.date,
                eventType: nextEvent.event_type
            } : null,
            route: {
                origin: data.route?.pol ? locationMap[data.route.pol.location] : null,
                destination: data.route?.pod ? locationMap[data.route.pod.location] : null,
                polDate: data.route?.pol?.date,
                podDate: data.route?.pod?.date,
                podActual: data.route?.pod?.actual
            },
            allEvents: events.map(e => ({
                order: e.order_id,
                description: e.description,
                location: locationMap[e.location]?.name,
                facility: e.facility ? facilityMap[e.facility]?.name : null,
                date: e.date,
                actual: e.actual,
                transportType: e.transport_type,
                vessel: e.vessel ? data.vessels?.find(v => v.id === e.vessel)?.name : null,
                voyage: e.voyage
            }))
        };
    });

    return {
        metadata: {
            blNumber: metadata.number,
            sealine: metadata.sealine_name,
            status: metadata.status,
            updatedAt: metadata.updated_at
        },
        containers: containerTracking,
        routeInfo: {
            pol: data.route?.pol ? {
                location: locationMap[data.route.pol.location],
                date: data.route.pol.date,
                actual: data.route.pol.actual
            } : null,
            pod: data.route?.pod ? {
                location: locationMap[data.route.pod.location],
                date: data.route.pod.date,
                actual: data.route.pod.actual
            } : null
        },
        aisData: route_data?.ais ? {
            lastEvent: route_data.ais.data?.last_event,
            vesselPosition: route_data.ais.data?.last_vessel_position,
            dischargePort: route_data.ais.data?.discharge_port,
            arrivalPort: route_data.ais.data?.arrival_port
        } : null
    };
}

// Export the parsing function for direct use
exports.parseContainerTracking = parseContainerTracking;

/**
 * Track container endpoint
 * Accepts tracking API response and returns parsed, user-friendly tracking data
 * 
 * Example request body:
 * {
 *   "trackingData": {
 *     "status": "success",
 *     "data": {
 *       "metadata": {...},
 *       "locations": [...],
 *       "containers": [...],
 *       ...
 *     }
 *   }
 * }
 */
exports.trackContainer = async (req, res) => {
    try {
        const { trackingData } = req.body;

        if (!trackingData) {
            return res.status(400).json({
                success: false,
                message: 'Tracking data is required'
            });
        }

        // Parse the tracking response
        const parsedTracking = parseContainerTracking(trackingData);

        if (!parsedTracking) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking data format'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Container tracking data parsed successfully',
            data: parsedTracking
        });

    } catch (error) {
        console.error('Track container error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to parse tracking data',
            error: error.message
        });
    }
};

/**
 * Track container by number (Container, BL, or Booking number)
 * Calls external tracking API and returns location and estimated time to destination
 * 
 * GET /api/checkout/track?number=CONTAINER123&sealine=CMDU&type=CT&route=true&ais=true
 */
exports.trackContainerByNumber = async (req, res) => {
    try {
        const { 
            number, 
            sealine = 'auto', 
            type, 
            force_update = false, 
            route = true, 
            ais = true 
        } = req.query;

        // Validate required parameter
        if (!number) {
            return res.status(400).json({
                success: false,
                message: 'Container/BL/Booking number is required'
            });
        }

        // Hardcoded API key and base URL
        const apiKey = 'K-6BC266A9-006C-4F86-A839-2336C25DC3BA';
        const trackingApiBaseUrl = 'https://tracking.searates.com';

        // Build query parameters
        const queryParams = {
            api_key: apiKey,
            number: number,
            sealine: sealine,
            force_update: force_update === 'true' || force_update === true,
            route: route === 'true' || route === true,
            ais: ais === 'true' || ais === true
        };

        // Add type if provided
        if (type && ['CT', 'BL', 'BK'].includes(type.toUpperCase())) {
            queryParams.type = type.toUpperCase();
        }

        console.log('[TRACK CONTAINER] Calling tracking API with params:', {
            number: number,
            sealine: sealine,
            type: type || 'auto-detect',
            route: queryParams.route,
            ais: queryParams.ais
        });

        // Call the external tracking API
        const trackingResponse = await axios.get(`${trackingApiBaseUrl}/tracking`, {
            params: queryParams,
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 30000 // 30 second timeout
        });

        // Check if API call was successful
        if (!trackingResponse.data || trackingResponse.data.status !== 'success') {
            return res.status(400).json({
                success: false,
                message: trackingResponse.data?.message || 'Failed to fetch tracking information',
                data: trackingResponse.data
            });
        }

        // Parse the tracking response
        const parsedTracking = parseContainerTracking(trackingResponse.data);

        if (!parsedTracking) {
            return res.status(400).json({
                success: false,
                message: 'Invalid tracking data format received from API'
            });
        }

        // Extract route info for use in summary
        const routeInfo = parsedTracking.routeInfo;

        // Extract location and ETA for each container
        const containerStatuses = parsedTracking.containers.map(container => {
            const currentLocation = container.currentLocation;
            
            // Calculate estimated time to destination
            let estimatedArrival = null;
            let daysUntilArrival = null;
            
            if (routeInfo.pod && routeInfo.pod.date) {
                const podDate = new Date(routeInfo.pod.date);
                const now = new Date();
                const diffTime = podDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                estimatedArrival = routeInfo.pod.date;
                daysUntilArrival = diffDays > 0 ? diffDays : 0;
            }

            // Get real-time position if available
            const realTimePosition = container.realTimePosition || 
                                   (parsedTracking.aisData?.vesselPosition ? {
                                       lat: parsedTracking.aisData.vesselPosition.lat,
                                       lng: parsedTracking.aisData.vesselPosition.lng,
                                       updated_at: parsedTracking.aisData.vesselPosition.updated_at
                                   } : null);

            return {
                containerNumber: container.containerNumber,
                currentLocation: {
                    name: currentLocation?.name || 'Unknown',
                    city: currentLocation?.name,
                    state: currentLocation?.state,
                    country: currentLocation?.country,
                    countryCode: currentLocation?.countryCode,
                    coordinates: currentLocation?.coordinates,
                    facility: currentLocation?.facility?.name
                },
                status: container.overallStatus,
                statusMessage: container.statusMessage,
                realTimePosition: realTimePosition,
                destination: routeInfo.pod ? {
                    name: routeInfo.pod.location?.name,
                    city: routeInfo.pod.location?.name,
                    state: routeInfo.pod.location?.state,
                    country: routeInfo.pod.location?.country,
                    countryCode: routeInfo.pod.location?.country_code,
                    coordinates: routeInfo.pod.location ? {
                        lat: routeInfo.pod.location.lat,
                        lng: routeInfo.pod.location.lng
                    } : null
                } : null,
                estimatedArrival: estimatedArrival,
                daysUntilArrival: daysUntilArrival,
                isActualArrival: routeInfo.pod?.actual || false,
                currentEvent: container.currentEvent,
                nextEvent: container.nextEvent,
                vessel: container.currentEvent?.vessel || null
            };
        });

        // Build response
        const response = {
            success: true,
            message: 'Container tracking information retrieved successfully',
            metadata: {
                blNumber: parsedTracking.metadata.blNumber,
                sealine: parsedTracking.metadata.sealine,
                status: parsedTracking.metadata.status,
                updatedAt: parsedTracking.metadata.updatedAt
            },
            containers: containerStatuses,
            summary: {
                totalContainers: containerStatuses.length,
                currentStatus: parsedTracking.metadata.status,
                origin: routeInfo.pol ? {
                    name: routeInfo.pol.location?.name,
                    country: routeInfo.pol.location?.country,
                    date: routeInfo.pol.date
                } : null,
                destination: routeInfo.pod ? {
                    name: routeInfo.pod.location?.name,
                    country: routeInfo.pod.location?.country,
                    estimatedArrival: routeInfo.pod.date,
                    isActual: routeInfo.pod.actual
                } : null
            }
        };

        return res.status(200).json(response);

    } catch (error) {
        console.error('[TRACK CONTAINER] Error:', error);
        console.error('[TRACK CONTAINER] Error details:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status
        });

        // Handle specific error cases
        if (error.response) {
            // API returned an error response
            return res.status(error.response.status || 500).json({
                success: false,
                message: error.response.data?.message || 'Failed to fetch tracking information',
                error: error.response.data
            });
        } else if (error.request) {
            // Request was made but no response received
            return res.status(503).json({
                success: false,
                message: 'Tracking API is unavailable or timeout occurred',
                error: error.message
            });
        } else {
            // Error setting up the request
            return res.status(500).json({
                success: false,
                message: 'Failed to process tracking request',
                error: error.message
            });
        }
    }
};