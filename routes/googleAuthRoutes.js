const express = require('express');
const { googleAuthCallback, generateGoogleAuth } = require('../controllers/googleAuthController');
const router = express.Router();

router.get('/auth/google', generateGoogleAuth);
router.get('/auth/google/callback', googleAuthCallback);

module.exports = router;