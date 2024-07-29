const express = require("express");
const { uploadSalesData, getSalesDataChannelWise, getSalesDataSegmentWise, getSalesDataTSEWise, getSalesDashboardData, getChannelSalesDataAreaWise, getSalesDataABMWise, getSalesDataASMWise, getSalesDataRSOWise } = require("../controllers/salesDataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/sales", upload.single("file"), uploadSalesData);
router.get("/sales/dashboard", getSalesDashboardData);
router.get("/sales/channel-wise", getSalesDataChannelWise);
router.get("/sales/segment-wise", getSalesDataSegmentWise);
router.get("/sales/tse-wise", getSalesDataTSEWise);
router.get("/sales/channel/area-wise", getChannelSalesDataAreaWise)
router.get("/sales/abm-wise", getSalesDataABMWise);
router.get("/sales/asm-wise", getSalesDataASMWise);
router.get("/sales/rso-wise", getSalesDataRSOWise);

module.exports = router;