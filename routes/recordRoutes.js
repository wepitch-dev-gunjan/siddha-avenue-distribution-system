const express = require("express");
const { addRecord } = require("../controllers/recordController");
const router = express.Router();


router.post("/record/add", addRecord);

module.exports = router;