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
    const { factoryId } = req.params;

    try {
        // Step 1: Fetch factory account
        const customer = await swell.get(`/accounts/${factoryId}`);
        if (!customer) {
            return res.status(404).json({
                success: false,
                message: 'Factory (customer) not found',
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
