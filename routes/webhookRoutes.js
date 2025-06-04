const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

router.post('/send-notification', webhookController.sendNotifications)


module.exports = router;

