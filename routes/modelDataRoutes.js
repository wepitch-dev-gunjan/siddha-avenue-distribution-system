const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadModelData, getSalesDataModelWise } = require("../controllers/modelDataController");
const router = express.Router();

router.post("/model-data", upload.single("file"), uploadModelData);
router.get("/model-data", getSalesDataModelWise);

module.exports = router;