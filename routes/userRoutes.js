const express = require('express');
const { getUser, getUsers } = require('../controllers/userController');
const { userAuth } = require('../middlewares/authMiddlewares');
const router = express.Router();

router.get('/user', userAuth, adminAuth, getUsers,);
router.get('/user/:user_id', userAuth, getUser,);

module.exports = router;