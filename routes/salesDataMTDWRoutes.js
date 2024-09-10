const express = require("express");
const router = express.Router();
const { upload } = require("../services/fileUpload");
const { uploadSalesDataMDTW, getSalesDashboardDataMDTW, getSalesDataChannelWiseForEmployeeMDTW } = require("../controllers/salesDataMTDWController");

router.post("/sales-data-mtdw", upload.single("file"), uploadSalesDataMDTW);
router.get("/sales-data-mtdw/dashboard", getSalesDashboardDataMDTW);
router.get("/sales-data-mtdw/channel-wise/employee", getSalesDataChannelWiseForEmployeeMDTW);

module.exports = router;