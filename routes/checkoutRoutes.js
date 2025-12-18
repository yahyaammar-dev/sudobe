const express = require('express');
const router = express.Router();
const checkoutController = require('../controllers/checkoutController');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });

router.post('/update-order-status/:orderId', checkoutController.updateOrderStatus)
router.post('/update-transfer-id/:orderId', checkoutController.updateTransferId)
router.get('/get-order-details', checkoutController.getOrderDetails)
router.post(
    '/update-order-documents/:orderId',
    upload.fields([
        { name: 'shipping_qutation' },
        { name: 'invoice_by_factory' },
        { name: 'dhl_invoice' },
        { name: 'inspection_report' },
        { name: 'shipping_policy' },
        { name: 'other_documents' },
    ]),
    checkoutController.updateOrderDocuments
);

router.post('/calculate-load', checkoutController.calculateLoad)
router.post('/add-custom-price-to-cart/:cartId', checkoutController.testCustomPrice)
router.post('/add-custom-price-to-order/:orderId', checkoutController.addCustomPriceToOrder)
router.post('/track-container', checkoutController.trackContainer)
router.get('/track', checkoutController.trackContainerByNumber)

module.exports = router;