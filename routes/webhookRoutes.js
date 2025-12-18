const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/send-notification', webhookController.sendNotifications);
router.post('/create-order-estimate-arrival-time', webhookController.createOrderEstimateArrivalTime);
router.post('/check-container-tracking', webhookController.checkContainerTracking);

module.exports = router;

