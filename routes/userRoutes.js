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
  getParents,
} = require("../controllers/userController");
const { userAuth, adminAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.get("/user", userAuth, adminAuth, getUsers);
router.get("/user/children", getChildren);
router.get("/user/parents", getParents);
router.get("/user/profile", userAuth, getUser);
router.post("/user/register", register);
router.post("/user/forgotPassword", userAuth, forgotPassword);
router.post("/user/resetPassword", resetPassword);

router.put("/user", userAuth, editProfile);
router.post("/login", login);

module.exports = router;
