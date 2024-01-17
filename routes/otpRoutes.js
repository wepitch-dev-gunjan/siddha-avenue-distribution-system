const express = require('express');
const { generateOtpByPhone, verifyOtpByPhone } = require('../controllers/userController');
const router = express.Router();

// Route to send OTP by Phone
router.post('/auth/sendOTPPhone', generateOtpByPhone);

// Route to verify OTP by Phone
router.post('/auth/verifyOTPPhone', verifyOtpByPhone);

module.exports = router;