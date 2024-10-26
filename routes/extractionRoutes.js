const express = require("express");
const { userAuth } = require("../middlewares/authMiddlewares");
const { addExtractionRecord, getAllExtractionRecords, getExtractionDataForEmployee, getExtractionRecordsForAMonth, getExtractionReportForAdmins, getBrandComparisonReport, getSegmentAnalysisReport, getDealerPerformanceReport, getUniqueColumnValues, getExtractionDataForAdminWithFilters, getExtractionOverviewForAdmins, getExtractionDataModelWiseForAdmins } = require("../controllers/extractionRecordControllers");
const router = express.Router();


router.post("/record/extraction/add", userAuth, addExtractionRecord);
router.get("/record/extraction/get-all", getAllExtractionRecords);
router.get("/record/extraction/for-employee", userAuth,  getExtractionDataForEmployee);
router.get("/record/extraction/for-a-month", getExtractionRecordsForAMonth);
router.get("/record/extraction/report-for-admins", getExtractionReportForAdmins);
router.get("/extraction/brand-comparison", getBrandComparisonReport);
router.get("/extraction/segment-analysis", getSegmentAnalysisReport);
router.get("/extraction/dealer-performance", getDealerPerformanceReport);

// New frontend routes:
router.get("/extraction/unique-column-values", getUniqueColumnValues);
router.get("/extraction/filtered-data", getExtractionDataForAdminWithFilters);
router.get("/extraction/overview-for-admins", getExtractionOverviewForAdmins);
router.get("/extraction/data-model-wise-for-admins", getExtractionDataModelWiseForAdmins)

module.exports = router;