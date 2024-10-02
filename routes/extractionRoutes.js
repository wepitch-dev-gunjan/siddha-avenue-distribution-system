const express = require("express");
const { userAuth } = require("../middlewares/authMiddlewares");
const { addExtractionRecord } = require("../controllers/extractionRecordControllers");
const router = express.Router();


router.post("/record/extraction/add", userAuth, addExtractionRecord);

module.exports = router;