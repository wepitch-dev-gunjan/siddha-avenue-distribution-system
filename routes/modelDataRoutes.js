const express = require("express");
const { upload } = require("../services/fileUpload");
const { uploadModelData, getSalesDataModelWise, getSalesDataModelWiseForEmployeeMTDW, getSalesDataModelWiseBySubordinateCodeMTDW, getSalesDataModelWiseByPositionCategoryMTDW, getSalesDataModelWiseBySubordinateNameMTDW, getSalesDataModelWiseForDealerMTDW, getSalesDataModelWiseForEmployeeByDealerCodeMTDW } = require("../controllers/modelDataController");
const { userAuth, dealerAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/model-data", upload.single("file"), uploadModelData);
router.get("/model-data", getSalesDataModelWise);

// MTDW 
router.get("/model-data/mtdw/employee", userAuth, getSalesDataModelWiseForEmployeeMTDW);
router.get("/model-data/mtdw/dealer", dealerAuth, getSalesDataModelWiseForDealerMTDW);
router.get("/model-data-mtdw/by-subordinate-code/:subordinate_code", getSalesDataModelWiseBySubordinateCodeMTDW);
router.get("/model-data-mtdw/by-position-category", userAuth, getSalesDataModelWiseByPositionCategoryMTDW);
router.get("/model-data-mtdw/by-subordinate-name/:subordinate_name", getSalesDataModelWiseBySubordinateNameMTDW);
router.get("/model-data-mtdw/employee/by-dealer-code", getSalesDataModelWiseForEmployeeByDealerCodeMTDW);

module.exports = router;