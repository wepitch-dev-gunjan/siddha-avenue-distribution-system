const express = require('express');
const { getRole, getRoles, deleteRole, createRole } = require('../controllers/roleController');
const router = express.Router();

router.post('/role', createRole);
router.get('/role/:role_id', getRole);
router.get('/role', getRoles);
router.delete('/role', deleteRole);

module.exports = router;