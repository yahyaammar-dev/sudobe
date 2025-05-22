const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

router.post('/update-order-status/:orderId', checkoutController.updateOrderStatus)
router.post('/update-transfer-id/:orderId', checkoutController.updateTransferId)
router.get('/get-order-details', checkoutController.getOrderDetails)    

module.exports = router;