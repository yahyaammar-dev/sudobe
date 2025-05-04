const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');


router.post('/send-otp-via-whatsapp', userController.sendOtpViaWhatsApp)
router.post('/verify-otp', userController.verifyOtp)


module.exports = router;
