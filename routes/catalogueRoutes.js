const express = require('express');
const router = express.Router();
const catalogueController = require('../controllers/catalogueController');

router.get('/search-products', catalogueController.searchProductsGroupedByFactory);
router.get('/all-products', catalogueController.getAllProductsGroupedByFactory);
router.get('/by-factory/:factoryId/:accountId', catalogueController.searchProductsByFactory);
router.get('/cancelorder/:orderId', catalogueController.cancelOrder);
router.get('/featured-products', catalogueController.getFeaturedProducts);
router.get('/factories', catalogueController.getFactories);
router.get('/productDetails/:id', catalogueController.getProductDetails);
router.get('/byCategory/:id', catalogueController.getByCategory);
router.get('/categories', catalogueController.getCategories);
router.get('/subcategories/:id', catalogueController.getSubcategories);
router.get('/categoryDetails/:id', catalogueController.getCategoryDetails);
router.get('/products', catalogueController.getAllProducts);

module.exports = router;