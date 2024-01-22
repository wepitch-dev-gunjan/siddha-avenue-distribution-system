const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadSheet } = require('../controllers/sheetController');
const { oauth2Client } = require('../services/googleConfig');
const { googleAuth } = require('../middlewares/authMiddlewares');
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

router.post('/sheet', googleAuth, upload.single('file'), uploadSheet)

module.exports = router;