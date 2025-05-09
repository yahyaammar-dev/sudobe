// routes/contact.js

const express = require('express');
const router = express.Router();
const contactController = require('../controllers/contactController');

router.post('/:accountId', contactController.submitContactMessage);

module.exports = router;
