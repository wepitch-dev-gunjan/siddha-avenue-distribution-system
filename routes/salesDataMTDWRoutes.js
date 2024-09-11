const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { uploadSalesDataMTDW, getSalesDashboardDataMTDW, getSalesDataChannelWiseForEmployeeMTDW, getSalesDataSegmentWiseForEmployeeMTDW } = require("../controllers/salesDataMTDWController");

router.post("/sales-data-mtdw", upload.single("file"), uploadSalesDataMTDW);
router.get("/sales-data-mtdw/dashboard", getSalesDashboardDataMTDW);
router.get("/sales-data-mtdw/channel-wise/employee", getSalesDataChannelWiseForEmployeeMTDW);
router.get("/sales-data-mtdw/segment-wise/employee", getSalesDataSegmentWiseForEmployeeMTDW);

module.exports = router;