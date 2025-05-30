const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const {
    uploadCertifications,
    updateUserWithCertifications
  } = require('../controllers/userController');

router.post('/send-otp-via-whatsapp', userController.sendOtpViaWhatsApp)
router.post('/verify-otp', userController.verifyOtp)
router.post('/create-user', userController.createUser)
router.put('/:id/certifications', uploadCertifications, updateUserWithCertifications);
router.put('/:id/personal_id', uploadCertifications, userController.updateUserWithPersonalid);


module.exports = router;

