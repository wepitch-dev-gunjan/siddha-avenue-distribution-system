const express = require("express");
const { uploadSalesData, getSalesDataChannelWise, getSalesDataSegmentWise, getSalesDataTSEWise, getSalesDashboardData, getChannelSalesDataAreaWise, getSalesDataABMWise, getSalesDataASMWise, getSalesDataRSOWise, getSalesDataCLUSTERWise, getSalesDataSegmentWiseTSE, getSegmentDataForZSM, getAllSubordinates, getSegmentDataForABM, getSegmentDataForRSO, getSegmentDataForASE, getSegmentDataForASM, getSegmentDataForTSE, getSegmentDataForAllPositions, getSegmentDataForDealer, getSalesDashboardDataForDealer, getSalesDataChannelWiseForEmployee } = require("../controllers/salesDataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

// Upload data routes
router.post("/sales", upload.single("file"), uploadSalesData);

// Dashboard Routes
router.get("/sales/dashboard", getSalesDashboardData);

// Channel wise routes
router.get("/sales/channel-wise", getSalesDataChannelWise);
router.get("/sales/channel-wise/employee", getSalesDataChannelWiseForEmployee);

// Not getting used - check
router.get("/sales/segment-wise", getSalesDataSegmentWise);
router.get("/sales/tse-wise", getSalesDataTSEWise);
router.get("/sales/abm-wise", getSalesDataABMWise);
router.get("/sales/asm-wise", getSalesDataASMWise);
router.get("/sales/rso-wise", getSalesDataRSOWise);
router.get("/sales/cluster-wise", getSalesDataCLUSTERWise);
router.get("/sales/segment-wise/tse/draft", getSalesDataSegmentWiseTSE);

// Employee ROUTES 
router.get("/sales/segment-wise/zsm", getSegmentDataForZSM);
router.get("/sales/segment-wise/abm", getSegmentDataForABM);
router.get("/sales/segment-wise/rso", getSegmentDataForRSO);
router.get("/sales/segment-wise/ase", getSegmentDataForASE);
router.get("/sales/segment-wise/asm", getSegmentDataForASM);
router.get("/sales/segment-wise/tse", getSegmentDataForTSE);
router.get("/sales/segment-wise/all", getSegmentDataForAllPositions);

// Dealer routes 
router.get("/sales/segment-wise/dealer", getSegmentDataForDealer);
router.get("/sales/dealer-dashboard", getSalesDashboardDataForDealer);

// GET ALL SUBORDINATE ROUTE 
router.get("/sales/get-all-subordinates", getAllSubordinates);
module.exports = router;