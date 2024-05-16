const express = require("express");
const { uploadSalesData, getSalesDataChannelWise, getSalesDataSegmentWise, getSalesDataTSEWise, getSalesDashboardData } = require("../controllers/salesDataController");
const { upload } = require("../services/fileUpload");
const { userAuth } = require("../middlewares/authMiddlewares");
const router = express.Router();

router.post("/sales", upload.single("file"), uploadSalesData);
router.get("/sales/dashboard", getSalesDashboardData);
router.get("/sales/channel-wise", getSalesDataChannelWise);
router.get("/sales/segment-wise", getSalesDataSegmentWise);
router.get("/sales/tse-wise", getSalesDataTSEWise);

module.exports = router;