const express = require('express');
const router = express.Router();
const catalogueController = require('../controllers/catalogueController');

router.get('/search-products', catalogueController.searchProducts);
router.get('/by-factory/:factoryId', catalogueController.searchProductsByFactory);

module.exports = router;
