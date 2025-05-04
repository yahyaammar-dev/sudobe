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