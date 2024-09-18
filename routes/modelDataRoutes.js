const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadModelData, getSalesDataModelWise, getSalesDataModelWiseForEmployeeMTDW } = require("../controllers/modelDataController");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/model-data", upload.single("file"), uploadModelData);
router.get("/model-data", getSalesDataModelWise);

// MTDW 
router.get("/model-data/mtdw/employee", userAuth, getSalesDataModelWiseForEmployeeMTDW);

module.exports = router;