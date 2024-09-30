const express = require("express");
const { addRecord } = require("../controllers/recordController");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();


router.post("/record/add", userAuth, addRecord);

module.exports = router;