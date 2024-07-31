const express = require("express");
const { uploadSalesData, getSalesDataChannelWise, getSalesDataSegmentWise, getSalesDataTSEWise, getSalesDashboardData, getChannelSalesDataAreaWise, getSalesDataABMWise, getSalesDataASMWise, getSalesDataRSOWise, getSalesDataCLUSTERWise, getSalesDataSegmentWiseTSE, getSegmentDataForZSM, getAllSubordinates, getSegmentDataForABM, getSegmentDataForRSO } = require("../controllers/salesDataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/sales", upload.single("file"), uploadSalesData);
router.get("/sales/dashboard", getSalesDashboardData);
router.get("/sales/channel-wise", getSalesDataChannelWise);
router.get("/sales/segment-wise", getSalesDataSegmentWise);
router.get("/sales/tse-wise", getSalesDataTSEWise);
// router.get("/sales/channel/area-wise", getChannelSalesDataAreaWise)
router.get("/sales/abm-wise", getSalesDataABMWise);
router.get("/sales/asm-wise", getSalesDataASMWise);
router.get("/sales/rso-wise", getSalesDataRSOWise);
router.get("/sales/cluster-wise", getSalesDataCLUSTERWise);

router.get("/sales/segment-wise/tse", getSalesDataSegmentWiseTSE);

// NEW ROUTES 
router.get("/sales/segment-wise/zsm", getSegmentDataForZSM);
router.get("/sales/segment-wise/abm", getSegmentDataForABM);
router.get("/sales/segment-wise/rso", getSegmentDataForRSO);


// GET ALL SUBORDINATE ROUTE 
router.get("/sales/get-all-subordinates", getAllSubordinates);
module.exports = router;