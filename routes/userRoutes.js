const express = require("express");
const {
  getUser,
  getUsers,
  login,
  register,
  editProfile,
  getChildren,
  forgotPassword,
  resetPassword,
} = require("../controllers/userController");
const { userAuth, adminAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.get("/user", userAuth, adminAuth, getUsers);
router.get("/user/children", getChildren);
router.get("/user/profile", userAuth, getUser);
router.post("/user/register", register);
router.post("/user/forgotPassword", forgotPassword);
router.post("/user/:user_id/resetPassword", userAuth, resetPassword);

router.put("/user", userAuth, editProfile);
router.get("/login", login);

module.exports = router;
