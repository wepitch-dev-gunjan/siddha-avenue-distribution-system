const express = require('express');
const { getRole, getRoles, deleteRole, createRole, getChildrenRoles } = require('../controllers/roleController');
const { userAuth } = require('../middlewares/authMiddlewares');
const router = express.Router();

router.post('/role', createRole);
router.get('/role/single-role/:role_id', getRole);
router.get('/role', getRoles);
router.get('/role/children-roles/:role_id', getChildrenRoles);
router.delete('/role', deleteRole);

module.exports = router;