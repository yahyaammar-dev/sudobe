require('dotenv').config();
const { swell } = require('swell-node');
swell.init(process.env.SWELL_STORE_ID, process.env.SWELL_SECRET_KEY);

exports.searchProducts = async (req, res) => {
    try {
        const {
            q,              // search query
            limit = 25,
            page = 1,
            category,       // optional: category ID
            sort,           // optional: "name asc", "price desc", etc.
            fields,         // optional: "name,slug"
            expand          // optional: "variants:10"
        } = req.query;

        const where = { active: true };
        if (category) {
            where.categories = category;
        }

        const result = await swell.get('/products', {
            search: q || undefined,
            where,
            limit: parseInt(limit),
            page: parseInt(page),
            sort: sort || undefined,
            fields: fields || undefined,
            expand: expand || undefined,
        });

        res.json({
            success: true,
            page: result.page,
            pages: result.pages,
            count: result.count,
            results: result.results,
        });
    } catch (err) {
        console.error('Error fetching products:', err.message);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
}




exports.searchProductsByFactory = async (req, res) => {
    const { factoryId, accountId } = req.params;

    try {
        // Step 1: Fetch factory account
        const customer = await swell.get(`/accounts/${factoryId}`);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Factory (customer) not found',
            });
        }

        const user = await swell.get(`/accounts/${accountId}`);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User (customer) not found',
            });
        }


        // Step 2: Fetch products related to this factory
        const productsResult = await swell.get('/products', {
            where: {
                'content.factory_id': factoryId,
            },
            limit: 100,
        });

        const products = productsResult?.results || [];

        // Step 3: Get all category IDs from all products
        const allCategoryIds = new Set();
        for (const product of products) {
            const categoryIds = product.category_index?.id || [];
            categoryIds.forEach((id) => allCategoryIds.add(id));
        }

        // Step 4: Fetch actual category data from Swell
        const categoryMap = {};
        if (allCategoryIds.size > 0) {
            const categoriesResult = await swell.get('/categories', {
                where: {
                    id: { $in: Array.from(allCategoryIds) },
                },
                limit: 100,
            });

            for (const category of categoriesResult?.results || []) {
                categoryMap[category.id] = category.name;
            }
        }

        // Step 5: Group products by category name
        const groupedByCategory = {};
        for (const product of products) {
            const categoryIds = product.category_index?.id || [];
            const categoryName = categoryIds.length > 0
                ? categoryMap[categoryIds[0]] || 'Uncategorized'
                : 'Uncategorized';

            if (!groupedByCategory[categoryName]) {
                groupedByCategory[categoryName] = [];
            }

            groupedByCategory[categoryName].push(product);
        }

        // Step 6: Return final response
        return res.status(200).json({
            success: true,
            factory: {
                id: customer.id,
                name: customer?.name,
                email: customer?.email,
                phone: customer.phone,
                ...customer
            },
            groupedProducts: groupedByCategory,
        });

    } catch (error) {
        console.error('Error in searchProductsByFactory:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
        });
    }
};


exports.cancelOrder = async (req, res) => {
    const { orderId } = req.params;

    if (!orderId) {
        return res.status(400).json({
            success: false,
            message: 'Missing order ID',
        });
    }

    try {
        // Fetch the order first to ensure it exists
        const order = await swell.get(`/orders/${orderId}`);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found',
            });
        }

        // Cancel the order
        const cancelledOrder = await swell.put(`/orders/${orderId}`, {
            canceled: true
        });

        return res.status(200).json({
            success: true,
            message: 'Order cancelled successfully',
            order: cancelledOrder,
        });
    } catch (err) {
        console.error('Error cancelling order:', err.message);
        return res.status(500).json({
            success: false,
            message: 'Failed to cancel order',
        });
    }
};


exports.searchProductsByFactory = async (req, res) => {
    const { factoryId, accountId } = req.params;

    try {
        // Step 1: Fetch factory and user accounts
        const [customer, user] = await Promise.all([
            swell.get(`/accounts/${factoryId}`),
            swell.get(`/accounts/${accountId}`, { fields: ['metadata.favorites'] }),
        ]);

        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Factory (customer) not found',
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User (customer) not found',
            });
        }

        // Step 2: Fetch products related to this factory
        const productsResult = await swell.get('/products', {
            where: {
                'content.factory_id': factoryId,
            },
            limit: 100,
        });

        const products = productsResult?.results || [];
        const favoriteIds = user.metadata?.favorites || [];

        // Step 3: Get all category IDs from all products
        const allCategoryIds = new Set();
        for (const product of products) {
            const categoryIds = product.category_index?.id || [];
            categoryIds.forEach((id) => allCategoryIds.add(id));
        }

        // Step 4: Fetch actual category data from Swell
        const categoryMap = {};
        if (allCategoryIds.size > 0) {
            const categoriesResult = await swell.get('/categories', {
                where: {
                    id: { $in: Array.from(allCategoryIds) },
                },
                limit: 100,
            });

            for (const category of categoriesResult?.results || []) {
                categoryMap[category.id] = category.name;
            }
        }

        // Step 5: Group products by category name (with isFavorite flag)
        const groupedByCategory = {};
        for (const product of products) {
            const categoryIds = product.category_index?.id || [];
            const categoryName = categoryIds.length > 0
                ? categoryMap[categoryIds[0]] || 'Uncategorized'
                : 'Uncategorized';

            const enrichedProduct = {
                ...product,
                isFavorite: favoriteIds.includes(product.id),
            };

            if (!groupedByCategory[categoryName]) {
                groupedByCategory[categoryName] = [];
            }

            groupedByCategory[categoryName].push(enrichedProduct);
        }

        // Step 6: Return final response
        return res.status(200).json({
            success: true,
            factory: {
                id: customer.id,
                name: customer?.name,
                email: customer?.email,
                phone: customer.phone,
                ...customer
            },
            groupedProducts: groupedByCategory,
        });

    } catch (error) {
        console.error('Error in searchProductsByFactory:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
        });
    }
};



exports.getFactories = async (req, res) => {
    try {
        // Step 1: Fetch all accounts with factory_name set
        const { results: factories } = await swell.get('/accounts', {
            where: {
                'content.factory_name': { $ne: null } // Exclude null values
            },
            limit: 1000 // Adjust limit as needed
        });

        // Optional: Filter out empty string values
        const validFactories = factories.filter(acc => acc.content?.factory_name?.trim());

        return res.status(200).json({
            success: true,
            data: validFactories,
        });

    } catch (error) {
        console.error('Error fetching factories:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
        });
    }
};



exports.getFeaturedProducts = async (req, res) => {
    try {
        const { account } = req.query;

        if (!account) {
            return res.status(400).json({
                success: false,
                message: 'Missing account',
            });
        }

        // Parallelize these calls
        const [promotionsResponse, productsResponse, accountResponse] = await Promise.all([
            swell.get('/promotions', { where: { active: true } }),
            swell.get('/products', { limit: 50 }), // Add filtering if needed
            swell.get(`/accounts/${account}`, { fields: ['metadata.favorites'] }),
        ]);

        const promotions = promotionsResponse.results || [];
        const products = productsResponse.results || [];
        const favoriteIds = accountResponse.metadata?.favorites || [];

        // Build product-level discount map
        const discountMap = {};
        promotions.forEach(promo => {
            promo.discounts?.forEach(discount => {
                if (discount.type === 'product' && discount.value_type === 'percent') {
                    discountMap[discount.product_id] = {
                        percent: discount.value_percent
                    };
                }
            });
        });

        // Extract unique factory IDs
        const factoryIds = [
            ...new Set(products.map(p => p.content.factory_id).filter(Boolean))
        ];

        // Batch-fetch factory accounts in parallel (avoid one-by-one requests)
        const factories = factoryIds.length > 0
            ? await swell.get('/accounts', {
                where: {
                    id: { $in: factoryIds }
                },
                limit: factoryIds.length
            })
            : { results: [] };

        const factoryMap = {};
        factories.results?.forEach(f => {
            factoryMap[f.id] = f;
        });

        // Enrich products
        const enrichedProducts = products.map(p => {
            const discount = discountMap[p.id];
            const originalPrice = p.price;
            const discountPercent = discount?.percent || 0;
            const discountedPrice = discount
                ? +(originalPrice * (1 - discountPercent / 100)).toFixed(2)
                : null;

            return {
                ...p,
                isFavorite: favoriteIds.includes(p.id),
                discount_percent: discountPercent,
                discounted_price: discountedPrice,
                content: {
                    ...p.content,
                    factory: factoryMap[p.content.factory_id] || null
                }
            };
        });

        return res.status(200).json({
            success: true,
            products: enrichedProducts,
        });

    } catch (error) {
        console.error('Error fetching featured products:', error.message);
        return res.status(500).json({
            success: false,
            message: 'Internal Server Error',
        });
    }
};