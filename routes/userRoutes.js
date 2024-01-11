const express = require('express');
const { getUser, getUsers, login } = require('../controllers/userController');
const { userAuth, adminAuth } = require('../middlewares/authMiddlewares');
const { register } = require('module');
const router = express.Router();

router.get('/user', userAuth, adminAuth, getUsers,);
router.get('/user/:user_id', userAuth, getUser,);
router.post('/user/register', register);
router.get('/user/login', login);

module.exports = router;