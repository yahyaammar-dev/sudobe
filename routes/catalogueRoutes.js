const express = require('express');
const router = express.Router();
const catalogueController = require('../controllers/catalogueController');

router.get('/search-products', catalogueController.searchProducts);


module.exports = router;
