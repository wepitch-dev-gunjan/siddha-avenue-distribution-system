const express = require("express");
const { addRecord, getPulseDataForEmployee } = require("../controllers/recordController");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();


router.post("/record/add", userAuth, addRecord);
router.get("/record/for-employee", userAuth, getPulseDataForEmployee);

module.exports = router;