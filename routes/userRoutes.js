const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');

router.get('/', userController.getUsers);
router.post('/', userController.createUser);
router.post('/send-otp-via-whatsapp', userController.sendOtpViaWhatsApp)
router.post('/verify-otp', userController.verifyOtp)


module.exports = router;
