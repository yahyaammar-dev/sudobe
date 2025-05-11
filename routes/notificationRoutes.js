
const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificationController');

router.post('/store-token/:accountId', notificationController.storeToken);

module.exports = router;
