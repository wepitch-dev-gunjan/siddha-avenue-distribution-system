const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadModelData } = require("../controllers/modelDataController");
const router = express.Router();

router.post("/model-data", upload.single("file"), uploadModelData);

module.exports = router;